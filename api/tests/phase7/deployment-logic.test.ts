/**
 * Phase 7: Deployment & Scalability Logic Tests
 *
 * Covers the logic introduced in the deployment/scalability hardening:
 * - Cache-limit clamping (per-user preference bounds)
 * - Serverless runtime detection (Vercel/Netlify/AWS/GCP/Azure/overrides)
 * - Mail poller fair round-robin rotation (no user starvation)
 * - Older-pull detection (IMAP beforeUid vs POP3 page > 1)
 * - Entrypoint guard logic (missing DATABASE_URL)
 *
 * Pure logic tests — no DB, no mail servers, no network. The detection and
 * routing conditions are replicated from production code exactly, matching
 * the phase 6 testing pattern.
 */

import { describe, expect, it } from 'vitest';
import {
  INBOX_CACHE_LIMIT_DEFAULT,
  INBOX_CACHE_LIMIT_MIN,
  INBOX_CACHE_LIMIT_MAX,
  clampInboxCacheLimit,
} from '../../src/utils/inboxCacheConfig';

// ============================================================================
// 1. Cache limit clamping — per-user preference bounds (server)
// ============================================================================

describe('clampInboxCacheLimit (server)', () => {
  it('passes through values inside the valid range unchanged', () => {
    expect(clampInboxCacheLimit(INBOX_CACHE_LIMIT_MIN)).toBe(INBOX_CACHE_LIMIT_MIN);
    expect(clampInboxCacheLimit(30)).toBe(30);
    expect(clampInboxCacheLimit(INBOX_CACHE_LIMIT_MAX)).toBe(INBOX_CACHE_LIMIT_MAX);
  });

  it('clamps values below the minimum up to MIN', () => {
    expect(clampInboxCacheLimit(0)).toBe(INBOX_CACHE_LIMIT_MIN);
    expect(clampInboxCacheLimit(1)).toBe(INBOX_CACHE_LIMIT_MIN);
    expect(clampInboxCacheLimit(INBOX_CACHE_LIMIT_MIN - 1)).toBe(INBOX_CACHE_LIMIT_MIN);
  });

  it('clamps values above the maximum down to MAX', () => {
    expect(clampInboxCacheLimit(101)).toBe(INBOX_CACHE_LIMIT_MAX);
    expect(clampInboxCacheLimit(10000)).toBe(INBOX_CACHE_LIMIT_MAX);
  });

  it('falls back to the app default for non-finite input', () => {
    expect(clampInboxCacheLimit(NaN)).toBe(INBOX_CACHE_LIMIT_DEFAULT);
    expect(clampInboxCacheLimit(Infinity)).toBe(INBOX_CACHE_LIMIT_DEFAULT);
    expect(clampInboxCacheLimit(-Infinity)).toBe(INBOX_CACHE_LIMIT_DEFAULT);
  });

  it('rounds fractional values to integers before clamping', () => {
    expect(clampInboxCacheLimit(15.7)).toBe(16);
    expect(clampInboxCacheLimit(4.2)).toBe(INBOX_CACHE_LIMIT_MIN); // rounds to 4 → clamped up
  });

  it('keeps the exported constants consistent (MIN ≤ DEFAULT ≤ MAX)', () => {
    expect(INBOX_CACHE_LIMIT_MIN).toBeLessThanOrEqual(INBOX_CACHE_LIMIT_DEFAULT);
    expect(INBOX_CACHE_LIMIT_DEFAULT).toBeLessThanOrEqual(INBOX_CACHE_LIMIT_MAX);
  });
});

// ============================================================================
// 2. Serverless runtime detection — platform matrix
// ============================================================================

describe('serverless runtime detection', () => {
  // Exact replica of isServerlessRuntime() in src/index.ts
  const isServerlessRuntime = (env: Record<string, string | undefined>): boolean => {
    if (env.RUN_SERVERLESS === '0') return false; // manual override
    if (env.RUN_SERVERLESS === '1') return true;  // manual override
    return Boolean(
      env.VERCEL ||
      env.NETLIFY ||
      env.AWS_LAMBDA_FUNCTION_NAME ||
      env.AWS_EXECUTION_ENV ||
      env.K_SERVICE ||
      env.FUNCTION_NAME ||
      env.FUNCTION_TARGET ||
      env.WEBSITE_INSTANCE_ID ||
      env.FUNCTIONS_WORKER_RUNTIME ||
      env.SERVERLESS
    );
  };

  it('is NOT serverless in a plain environment (local dev, VPS, Docker)', () => {
    expect(isServerlessRuntime({})).toBe(false);
  });

  it('detects Vercel', () => {
    expect(isServerlessRuntime({ VERCEL: '1' })).toBe(true);
  });

  it('detects Netlify', () => {
    expect(isServerlessRuntime({ NETLIFY: 'true' })).toBe(true);
  });

  it('detects AWS Lambda', () => {
    expect(isServerlessRuntime({ AWS_LAMBDA_FUNCTION_NAME: 'mailvoyage-api' })).toBe(true);
    expect(isServerlessRuntime({ AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs20.x' })).toBe(true);
  });

  it('detects Google Cloud Run', () => {
    expect(isServerlessRuntime({ K_SERVICE: 'mailvoyage' })).toBe(true);
  });

  it('detects Google Cloud Functions', () => {
    expect(isServerlessRuntime({ FUNCTION_NAME: 'mailvoyage' })).toBe(true);
    expect(isServerlessRuntime({ FUNCTION_TARGET: 'mailvoyage' })).toBe(true);
  });

  it('detects Azure Functions', () => {
    expect(isServerlessRuntime({ WEBSITE_INSTANCE_ID: 'abc123' })).toBe(true);
    expect(isServerlessRuntime({ FUNCTIONS_WORKER_RUNTIME: 'node' })).toBe(true);
  });

  it('detects the generic SERVERLESS=1 marker', () => {
    expect(isServerlessRuntime({ SERVERLESS: '1' })).toBe(true);
  });

  it('RUN_SERVERLESS=1 forces serverless mode even on a persistent host', () => {
    expect(isServerlessRuntime({ RUN_SERVERLESS: '1' })).toBe(true);
  });

  it('RUN_SERVERLESS=0 forces persistent mode even when platform markers exist', () => {
    // The manual override must win over platform detection — a self-hoster
    // running inside a container that happens to have e.g. K_SERVICE set
    // must still get the full server + WebSocket + poller.
    expect(isServerlessRuntime({ RUN_SERVERLESS: '0', VERCEL: '1' })).toBe(false);
    expect(isServerlessRuntime({ RUN_SERVERLESS: '0', K_SERVICE: 'x' })).toBe(false);
  });
});

// ============================================================================
// 3. Poller fair round-robin rotation — nobody is starved
// ============================================================================

describe('poller round-robin rotation', () => {
  // Exact replica of the selection logic in mail-poller.service pollCycle()
  const selectUsersForCycle = (
    connectedUserIds: string[],
    cursor: number,
    maxPerCycle: number
  ): { users: string[]; nextCursor: number } => {
    if (connectedUserIds.length > 0) {
      cursor = cursor % connectedUserIds.length;
    }
    const take = Math.min(maxPerCycle, connectedUserIds.length);
    const usersToCheck: string[] = [];
    for (let i = 0; i < take; i++) {
      usersToCheck.push(connectedUserIds[(cursor + i) % connectedUserIds.length]);
    }
    const nextCursor = (cursor + take) % Math.max(1, connectedUserIds.length);
    return { users: usersToCheck, nextCursor };
  };

  it('checks everyone in one cycle when user count ≤ cycle cap', () => {
    const ids = ['u1', 'u2', 'u3'];
    const { users, nextCursor } = selectUsersForCycle(ids, 0, 25);
    expect(users).toEqual(['u1', 'u2', 'u3']);
    expect(nextCursor).toBe(0); // wrapped back to start
  });

  it('splits excess users across consecutive cycles when user count exceeds the cap', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `u${i}`);

    // Cycle 1: users 0-24
    const c1 = selectUsersForCycle(ids, 0, 25);
    expect(c1.users).toHaveLength(25);
    expect(c1.users[0]).toBe('u0');
    expect(c1.users[24]).toBe('u24');
    expect(c1.nextCursor).toBe(25);

    // Cycle 2: users 25-29, then wraps to 0-4 — EVERYONE gets checked
    const c2 = selectUsersForCycle(ids, c1.nextCursor, 25);
    expect(c2.users[0]).toBe('u25');
    expect(c2.users).toContain('u29');
    expect(c2.users).toContain('u0');

    // Union of two cycles covers all 30 users exactly once
    const covered = new Set([...c1.users, ...c2.users]);
    expect(covered.size).toBe(30);
  });

  it('never checks the same user twice within one cycle', () => {
    const ids = ['u1', 'u2', 'u3', 'u4'];
    const { users } = selectUsersForCycle(ids, 3, 25); // cursor at the end
    expect(new Set(users).size).toBe(users.length);
    expect(users).toEqual(['u4', 'u1', 'u2', 'u3']);
  });

  it('handles an empty connected-user list safely', () => {
    const { users, nextCursor } = selectUsersForCycle([], 5, 25);
    expect(users).toEqual([]);
    expect(nextCursor).toBe(0);
  });

  it('keeps coverage complete regardless of cursor drift (mod safety)', () => {
    const ids = Array.from({ length: 7 }, (_, i) => `u${i}`);
    // A cursor larger than the list (e.g. after user count changed between
    // cycles) must not crash or skip anyone.
    const { users } = selectUsersForCycle(ids, 10, 25); // 10 % 7 = 3
    expect(users).toHaveLength(7);
    expect(new Set(users).size).toBe(7);
  });
});

// ============================================================================
// 4. Older-pull detection — cache-limit contract enforcement
// ============================================================================

describe('older-pull detection (server)', () => {
  // Exact replica of the detection in inbox.service syncInbox()
  const isOlderPull = (
    beforeUid: number | undefined,
    page: number | undefined
  ): boolean => {
    const isPop3OlderPull =
      !(typeof beforeUid === 'number' && beforeUid > 0) &&
      typeof page === 'number' &&
      page > 1;
    return !!(typeof beforeUid === 'number' && beforeUid > 0) || isPop3OlderPull;
  };

  it('IMAP beforeUid marks an older pull', () => {
    expect(isOlderPull(500, undefined)).toBe(true);
  });

  it('IMAP beforeUid=0 is NOT an older pull (falsy guard)', () => {
    expect(isOlderPull(0, undefined)).toBe(false);
  });

  it('POP3 page > 1 without beforeUid marks an older pull', () => {
    expect(isOlderPull(undefined, 2)).toBe(true);
    expect(isOlderPull(undefined, 5)).toBe(true);
  });

  it('POP3 page 1 is a regular sync (initial fetch)', () => {
    expect(isOlderPull(undefined, 1)).toBe(false);
  });

  it('no beforeUid and no page is a regular sync', () => {
    expect(isOlderPull(undefined, undefined)).toBe(false);
  });

  it('beforeUid always wins over page (IMAP semantics dominate)', () => {
    // Even with a page param, an explicit beforeUid means IMAP-style cursor.
    expect(isOlderPull(300, 3)).toBe(true);
  });
});

// ============================================================================
// 5. Entrypoint guard — missing DATABASE_URL must never proceed
// ============================================================================

describe('entrypoint DATABASE_URL guard', () => {
  // The guard logic in dist/entrypoint.js (source: src/entrypoint.ts)
  const shouldAbortForMissingDatabaseUrl = (
    databaseUrl: string | undefined
  ): boolean => {
    return !databaseUrl;
  };

  it('aborts when DATABASE_URL is unset', () => {
    expect(shouldAbortForMissingDatabaseUrl(undefined)).toBe(true);
  });

  it('aborts when DATABASE_URL is an empty string', () => {
    expect(shouldAbortForMissingDatabaseUrl('')).toBe(true);
  });

  it('proceeds when DATABASE_URL is present', () => {
    expect(
      shouldAbortForMissingDatabaseUrl('postgresql://user:pass@host:5432/db')
    ).toBe(false);
  });
});
