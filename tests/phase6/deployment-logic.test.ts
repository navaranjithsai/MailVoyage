/**
 * Phase 6: Frontend Deployment & Cache-Config Logic Tests
 *
 * Covers frontend logic from the deployment hardening rounds:
 * - inboxCacheConfig: stored-limit reading, clamping, fallback (localStorage
 *   is mocked — no Dexie, no real storage)
 * - Older-mail ID resolution: transit-only older pulls have no server DB id,
 *   so they must get a stable `${accountCode}:${uid}` key — an empty-string
 *   id would collide ALL records on one primary key in Dexie.
 *
 * Pure logic tests — jsdom-free, storage mocked in-memory.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';

// ============================================================================
// In-memory localStorage mock (module-level, installed before imports)
// ============================================================================

const store: Record<string, string> = {};

vi.stubGlobal('localStorage', {
  getItem: (key: string) => (key in store ? store[key] : null),
  setItem: (key: string, value: string) => { store[key] = String(value); },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  key: (index: number) => Object.keys(store)[index] ?? null,
  get length() { return Object.keys(store).length; },
});

import {
  INBOX_CACHE_LIMIT_KEY,
  INBOX_CACHE_LIMIT_DEFAULT,
  INBOX_CACHE_LIMIT_MIN,
  INBOX_CACHE_LIMIT_MAX,
  clampInboxCacheLimit,
  getStoredInboxCacheLimit,
  storeInboxCacheLimit,
} from '../../src/lib/inboxCacheConfig';

// ============================================================================
// 1. Frontend cache-limit clamping and storage round-trip
// ============================================================================

describe('inboxCacheConfig (frontend)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('clamps within-range values unchanged', () => {
    expect(clampInboxCacheLimit(15)).toBe(15);
    expect(clampInboxCacheLimit(INBOX_CACHE_LIMIT_MIN)).toBe(INBOX_CACHE_LIMIT_MIN);
    expect(clampInboxCacheLimit(INBOX_CACHE_LIMIT_MAX)).toBe(INBOX_CACHE_LIMIT_MAX);
  });

  it('clamps out-of-range values into bounds', () => {
    expect(clampInboxCacheLimit(2)).toBe(INBOX_CACHE_LIMIT_MIN);
    expect(clampInboxCacheLimit(500)).toBe(INBOX_CACHE_LIMIT_MAX);
  });

  it('falls back to the app default on non-finite input', () => {
    expect(clampInboxCacheLimit(NaN)).toBe(INBOX_CACHE_LIMIT_DEFAULT);
  });

  it('falls back to the default when nothing is stored', () => {
    expect(getStoredInboxCacheLimit()).toBe(INBOX_CACHE_LIMIT_DEFAULT);
  });

  it('returns the stored value when valid', () => {
    localStorage.setItem(INBOX_CACHE_LIMIT_KEY, '35');
    expect(getStoredInboxCacheLimit()).toBe(35);
  });

  it('falls back to the default on corrupt (non-numeric) stored data', () => {
    localStorage.setItem(INBOX_CACHE_LIMIT_KEY, 'not-a-number');
    expect(getStoredInboxCacheLimit()).toBe(INBOX_CACHE_LIMIT_DEFAULT);
  });

  it('clamps a corrupt out-of-range stored value back into bounds', () => {
    localStorage.setItem(INBOX_CACHE_LIMIT_KEY, '999');
    expect(getStoredInboxCacheLimit()).toBe(INBOX_CACHE_LIMIT_MAX);
    localStorage.setItem(INBOX_CACHE_LIMIT_KEY, '1');
    expect(getStoredInboxCacheLimit()).toBe(INBOX_CACHE_LIMIT_MIN);
  });

  it('storeInboxCacheLimit persists the clamped value and returns it', () => {
    const saved = storeInboxCacheLimit(42);
    expect(saved).toBe(42);
    expect(localStorage.getItem(INBOX_CACHE_LIMIT_KEY)).toBe('42');
    expect(getStoredInboxCacheLimit()).toBe(42);
  });

  it('storeInboxCacheLimit clamps before persisting', () => {
    expect(storeInboxCacheLimit(999)).toBe(INBOX_CACHE_LIMIT_MAX);
    expect(localStorage.getItem(INBOX_CACHE_LIMIT_KEY)).toBe(String(INBOX_CACHE_LIMIT_MAX));
  });
});

// ============================================================================
// 2. Older-mail ID resolution — Dexie primary-key collision guard
// ============================================================================

describe('older-mail ID resolution (Dexie primary-key guard)', () => {
  // Exact replica of resolveMailId() in src/pages/InboxPage.tsx
  const resolveMailId = (
    rawId: unknown,
    accountCode: string,
    uid: number
  ): string => {
    const id = typeof rawId === 'string' && rawId.trim().length > 0 ? rawId : null;
    return id ?? `${accountCode}:${uid}`;
  };

  it('uses the server id for regular cached mails', () => {
    expect(resolveMailId('12345', 'ACC', 900)).toBe('12345');
  });

  it('falls back to account:uid when id is an empty string (transit-only older pull)', () => {
    // Older pulls from the mail server have no server-cache DB id — the
    // fetcher leaves id: ''. The nullish-coalescing operator does not
    // catch this (an empty string is not nullish), so an explicit length
    // check is required to avoid every record colliding on key "".
    expect(resolveMailId('', 'ACC', 900)).toBe('ACC:900');
  });

  it('falls back to account:uid when id is undefined', () => {
    expect(resolveMailId(undefined, 'ACC', 900)).toBe('ACC:900');
  });

  it('falls back to account:uid when id is null', () => {
    expect(resolveMailId(null, 'ACC', 900)).toBe('ACC:900');
  });

  it('falls back to account:uid when id is whitespace-only', () => {
    expect(resolveMailId('   ', 'ACC', 900)).toBe('ACC:900');
  });

  it('produces DISTINCT keys for different older mails of the same account', () => {
    // The collision that motivated the guard: same empty id, different uids.
    const keys = new Set([
      resolveMailId('', 'ACC', 900),
      resolveMailId('', 'ACC', 899),
      resolveMailId('', 'ACC', 898),
    ]);
    expect(keys.size).toBe(3);
  });

  it('produces distinct keys across accounts even with equal uids', () => {
    expect(resolveMailId('', 'ACC1', 900)).not.toBe(resolveMailId('', 'ACC2', 900));
  });

  it('ignores non-string ids (numbers) by falling back safely', () => {
    expect(resolveMailId(42, 'ACC', 900)).toBe('ACC:900');
  });
});

// ============================================================================
// 3. Parse-cache-id — numeric server ids only (guards flag overrides)
// ============================================================================

describe('parseCacheId', () => {
  // Replica of the frontend parseCacheId helpers (InboxPage / dataSync)
  const parseCacheId = (value: unknown): number | null => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
      return null;
    }
    return parsed;
  };

  it('accepts positive integer strings and numbers', () => {
    expect(parseCacheId('123')).toBe(123);
    expect(parseCacheId(123)).toBe(123);
  });

  it('rejects synthetic local ids (non-numeric)', () => {
    // Older mails carry `local:ACC:900`-style ids — they have NO server
    // cache id, so flag-override lookups must skip them.
    expect(parseCacheId('local:ACC:900')).toBeNull();
  });

  it('rejects zero, negatives, and non-integers', () => {
    expect(parseCacheId(0)).toBeNull();
    expect(parseCacheId(-5)).toBeNull();
    expect(parseCacheId(3.14)).toBeNull();
  });

  it('rejects empty string and undefined', () => {
    expect(parseCacheId('')).toBeNull();
    expect(parseCacheId(undefined)).toBeNull();
  });
});
