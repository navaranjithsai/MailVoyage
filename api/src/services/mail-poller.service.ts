/**
 * Background Mail Poller for MailVoyage API
 *
 * Periodically checks IMAP and POP3 accounts for online users and pushes
 * inbox_new_mail WebSocket notifications when new mail arrives.
 *
 * Key design decisions:
 * - Poll interval is 120 seconds (2 min) to reduce server load, rate limits,
 *   and resource usage — even on free-tier serverless.
 * - Only runs for users with an active WebSocket connection.
 * - When a user disconnects, their accounts are no longer polled.
 * - POP3 accounts are checked via STAT message-count comparison.
 * - IMAP accounts are checked via mailbox.exists count comparison.
 * - Manual sync/reload buttons work independently for offline/unsupported users.
 * - Full fail-safe: any per-account or per-user error is caught and logged
 *   without crashing the poller or the server.
 */

import { ImapFlow, ImapFlowOptions } from 'imapflow';
import Pop3Command from 'node-pop3';
import pool from '../db/index.js';
import { logger } from '../utils/logger.js';
import { tryDecrypt } from '../utils/crypto.js';
import { config } from '../utils/config.js';
import { wsService } from './websocket.service.js';
import { signalNewInboxMail } from '../utils/signaling.js';
import { syncInbox, getLastSyncedUid, getUserInboxCacheLimit } from './inbox.service.js';

// ============================================================================
// Configuration — all tunables are env-driven via config.mailPoller so any
// deployment size can be accommodated without code changes.
// ============================================================================

/** Poll interval in milliseconds (POLL_INTERVAL_SEC, default 120s). */
const POLL_INTERVAL_MS = config.mailPoller.intervalSec * 1000;

/**
 * Max users to check per poll cycle (POLL_MAX_USERS_PER_CYCLE, default 25).
 * The scheduler rotates through the connected-user list across cycles, so
 * every user is polled within ceil(total / cap) cycles regardless of how
 * many users are online.
 */
const MAX_USERS_PER_CYCLE = config.mailPoller.maxUsersPerCycle;

/** Timeout for individual account checks (POLL_ACCOUNT_TIMEOUT_SEC, default 15s). */
const ACCOUNT_CHECK_TIMEOUT_MS = config.mailPoller.accountTimeoutSec * 1000;

/** Debounce for login/reconnect immediate polls (POLL_IMMEDIATE_DEBOUNCE_SEC). */
const IMMEDIATE_POLL_DEBOUNCE_MS = config.mailPoller.immediateDebounceSec * 1000;

/** Cooldown after an account fails — skip it for N cycles to avoid hammering. */
const ACCOUNT_FAIL_COOLDOWN_CYCLES = 3;

/**
 * Max users checked CONCURRENTLY within one cycle. Bounded so a cycle with
 * hundreds of users can't open hundreds of simultaneous IMAP/POP3 sockets
 * (mail providers rate-limit parallel sessions hard).
 */
const MAX_PARALLEL_USER_CHECKS = 5;

interface AccountInfo {
  userId: string;
  accountCode: string;
  email: string;
  incomingType: string;
  incomingHost: string;
  incomingPort: number;
  incomingUsername: string;
  password: string;
  incomingSecurity: string;
}

/** Track last-known message counts per user+account for polling comparison. */
const lastKnownCounts = new Map<string, number>();

/** Track consecutive failures per account — skip accounts that keep failing. */
const accountFailures = new Map<string, number>();

/** Guard to prevent overlapping poll cycles. */
let isPolling = false;

/**
 * FAIR SCHEDULING: index into the connected-user list where the next cycle
 * should begin. Rotating the starting point guarantees every connected user
 * is polled within ceil(N / MAX_USERS_PER_CYCLE) cycles, regardless of how
 * many users are online.
 */
let rotationCursor = 0;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get all active IMAP and POP3 accounts for a user.
 * Fetches from the database and decrypts passwords.
 * Skips accounts with undecryptable passwords.
 */
async function getActiveAccountsForUser(userId: string): Promise<AccountInfo[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT user_id, email, account_code, incoming_type, incoming_host,
              incoming_port, incoming_username, password, incoming_security
       FROM email_accounts
       WHERE user_id = $1 AND is_active = true`,
      [userId]
    );

    return result.rows.map((row) => {
      const decrypted = tryDecrypt(row.password);
      return {
        userId: row.user_id as string,
        accountCode: row.account_code as string,
        email: row.email as string,
        incomingType: (row.incoming_type as string || 'IMAP').toUpperCase().trim(),
        incomingHost: row.incoming_host as string,
        incomingPort: row.incoming_port as number,
        incomingUsername: (row.incoming_username as string) || (row.email as string),
        password: decrypted || '',
        incomingSecurity: row.incoming_security as string,
      };
    }).filter(a => a.password !== ''); // Skip accounts with undecryptable passwords
  } finally {
    client.release();
  }
}

/**
 * Clean up cached counts for a user when they disconnect.
 * Called when a user's WebSocket connection is closed or they log out.
 */
export function cleanupUserCache(userId: string): void {
  // Cancel any debounced immediate poll still pending for this user —
  // they're gone, opening a mail-server connection for them is waste.
  const pendingTimer = pendingImmediatePolls.get(userId);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingImmediatePolls.delete(userId);
  }

  const keysToDelete: string[] = [];
  for (const key of lastKnownCounts.keys()) {
    if (key.startsWith(`${userId}:`)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(k => lastKnownCounts.delete(k));

  // Also clean up failure tracking
  const failKeysToDelete: string[] = [];
  for (const key of accountFailures.keys()) {
    if (key.startsWith(`${userId}:`)) {
      failKeysToDelete.push(key);
    }
  }
  failKeysToDelete.forEach(k => accountFailures.delete(k));

  if (keysToDelete.length > 0 || failKeysToDelete.length > 0) {
    logger.debug(`[MailPoller] Cleaned up ${keysToDelete.length} count(s) and ${failKeysToDelete.length} failure(s) for user ${userId}`);
  }
}

// ============================================================================
// IMAP new-mail check
// ============================================================================

async function checkImapAccountForNewMail(account: AccountInfo): Promise<{ newCount: number; subjects: string[] } | null> {
  const secure = account.incomingSecurity === 'SSL';
  const imapConfig: ImapFlowOptions = {
    host: account.incomingHost,
    port: account.incomingPort,
    secure,
    auth: { user: account.incomingUsername, pass: account.password },
    logger: false,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
      minVersion: 'TLSv1.2',
    },
  };

  if (account.incomingSecurity === 'STARTTLS') {
    imapConfig.secure = false;
    (imapConfig as unknown as Record<string, unknown>).starttls = { required: true };
  }

  const client = new ImapFlow(imapConfig);
  let lock: Awaited<ReturnType<typeof client.getMailboxLock>> | null = null;

  // CRITICAL: Prevent ECONNRESET from crashing the server
  client.on('error', (err: Error) => {
    logger.warn(`[MailPoller] IMAP error for ${account.accountCode} (${account.incomingHost}): ${err.message}`);
  });

  try {
    await client.connect();

    lock = await client.getMailboxLock('INBOX');
    const mb = client.mailbox;
    if (!mb || typeof mb === 'boolean') {
      return null;
    }

    const currentCount = mb.exists || 0;
    const cacheKey = `${account.userId}:${account.accountCode}`;
    const lastCount = lastKnownCounts.get(cacheKey) ?? -1;

    // Update the known count for next cycle
    lastKnownCounts.set(cacheKey, currentCount);

    if (lastCount < 0) {
      // First check — just record the count, don't trigger
      logger.debug(`[MailPoller] ${account.accountCode}: initial IMAP count=${currentCount}`);
      return null;
    }

    if (currentCount <= lastCount) {
      // No new mail (or mail was deleted)
      return { newCount: 0, subjects: [] };
    }

    // New mail detected!
    const newCount = currentCount - lastCount;
    logger.info(`[MailPoller] ${account.accountCode}: ${newCount} new IMAP mail(s) (was ${lastCount}, now ${currentCount})`);

    // Do a live sync to fetch the new mail(s) from the server.
    // If sinceUid is stale (higher than the actual highest UID on the
    // server), syncInbox will detect this and fall back to a full fetch,
    // which also repairs the tracking.
    //
    // The cache limit is the user's own setting (Settings → Data Management).
    // The poller must respect it so poller-triggered syncs apply the same
    // retention bound as user-triggered syncs.
    const sinceUid = await getLastSyncedUid(account.userId, account.accountCode, 'INBOX');
    const cacheLimit = await getUserInboxCacheLimit(account.userId);
    const result = await syncInbox(account.userId, account.accountCode, {
      mailbox: 'INBOX',
      sinceUid: sinceUid > 0 ? sinceUid : undefined,
      cacheLimit,
    });

    // Use the count difference (from the mailbox STAT) for the signal, not
    // result.mails.length — a full sync (stale-tracking repair) may return
    // more mails than just the new ones, which would over-report newCount.
    const subjects = result.mails.slice(0, newCount).map(m => m.subject || '(No Subject)');
    return { newCount: result.mails.length > 0 ? newCount : 0, subjects };
  } catch (error) {
    logger.warn(`[MailPoller] Failed to check IMAP ${account.accountCode}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    // Always release the lock and logout — even if the timeout already fired
    try { if (lock) await lock.release(); } catch { /* ignored */ }
    try { if (client.usable) await client.logout(); } catch { /* best-effort */ }
  }
}

// ============================================================================
// POP3 new-mail check
// ============================================================================

async function checkPop3AccountForNewMail(account: AccountInfo): Promise<{ newCount: number; subjects: string[] } | null> {
  const useTls = account.incomingSecurity === 'SSL' || account.incomingSecurity === 'STARTTLS';

  const pop3 = new Pop3Command({
    user: account.incomingUsername,
    password: account.password,
    host: account.incomingHost,
    port: account.incomingPort,
    tls: useTls,
    tlsOptions: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
      minVersion: 'TLSv1.2',
    },
    timeout: 25000,
  });

  try {
    await pop3.connect();

    const [statInfo] = await pop3.command('STAT');
    const statLine = String(statInfo).trim();
    const statParts = statLine.split(/\s+/);
    const currentCount = parseInt(
      statParts.find(p => /^\d+$/.test(p)) || statParts[1] || '0',
      10
    );

    const cacheKey = `${account.userId}:${account.accountCode}`;
    const lastCount = lastKnownCounts.get(cacheKey) ?? -1;

    lastKnownCounts.set(cacheKey, currentCount);

    if (lastCount < 0) {
      logger.debug(`[MailPoller] ${account.accountCode}: initial POP3 count=${currentCount}`);
      return null;
    }

    if (currentCount <= lastCount) {
      return { newCount: 0, subjects: [] };
    }

    // New mail detected on POP3
    const newCount = currentCount - lastCount;
    logger.info(`[MailPoller] ${account.accountCode}: ${newCount} new POP3 mail(s) (was ${lastCount}, now ${currentCount})`);

    // For POP3, sync without sinceUid (POP3 doesn't support incremental sync).
    // Respect the user's own cache-limit setting — never a hardcoded number.
    const cacheLimit = await getUserInboxCacheLimit(account.userId);
    const result = await syncInbox(account.userId, account.accountCode, {
      mailbox: 'INBOX',
      cacheLimit,
    });

    // Use the count difference (from STAT) for the signal, not
    // result.mails.length — a full sync may return more mails than just the
    // new ones, which would over-report newCount.
    const subjects = result.mails.slice(0, newCount).map(m => m.subject || '(No Subject)');
    return { newCount: result.mails.length > 0 ? newCount : 0, subjects };
  } catch (error) {
    logger.warn(`[MailPoller] Failed to check POP3 ${account.accountCode}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    try { await pop3.QUIT(); } catch { /* best-effort */ }
  }
}

// ============================================================================
// Per-account check with timeout wrapper
// ============================================================================

/**
 * Check an account for new mail with a timeout wrapper.
 * Prevents a single slow/hanging account from blocking the entire poll cycle.
 */
async function checkAccountWithTimeout(account: AccountInfo): Promise<{ newCount: number; subjects: string[] } | null> {
  const timeoutPromise = new Promise<{ newCount: number; subjects: string[] } | null>((resolve) => {
    setTimeout(() => {
      logger.warn(`[MailPoller] Timeout checking ${account.accountCode} after ${ACCOUNT_CHECK_TIMEOUT_MS / 1000}s`);
      resolve(null);
    }, ACCOUNT_CHECK_TIMEOUT_MS);
  });

  const checkPromise = account.incomingType === 'POP3'
    ? checkPop3AccountForNewMail(account)
    : checkImapAccountForNewMail(account);

  return Promise.race([checkPromise, timeoutPromise]);
}

// ============================================================================
// Main poll cycle
// ============================================================================

async function pollCycle(): Promise<void> {
  // Guard against overlapping cycles — if the previous cycle is still running
  // (e.g., due to slow IMAP connections), skip this one.
  if (isPolling) {
    logger.debug('[MailPoller] Previous cycle still running, skipping...');
    return;
  }

  const connectedUserIds = wsService.getConnectedUserIds();

  if (connectedUserIds.length === 0) {
    return; // No online users — skip entirely
  }

  isPolling = true;

  try {
    // FAIR ROUND-ROBIN: start where the previous cycle left off. Every
    // connected user gets checked within ceil(N / MAX_USERS_PER_CYCLE)
    // cycles — nobody is starved when more users are online than one
    // cycle can handle.
    if (connectedUserIds.length > 0) {
      rotationCursor = rotationCursor % connectedUserIds.length;
    }
    const take = Math.min(MAX_USERS_PER_CYCLE, connectedUserIds.length);
    const usersToCheck: string[] = [];
    for (let i = 0; i < take; i++) {
      usersToCheck.push(connectedUserIds[(rotationCursor + i) % connectedUserIds.length]);
    }
    rotationCursor = (rotationCursor + take) % Math.max(1, connectedUserIds.length);

    logger.debug(
      `[MailPoller] Checking ${usersToCheck.length}/${connectedUserIds.length} user(s) this cycle ` +
      `(cursor at ${rotationCursor})...`
    );

    // Process users through a BOUNDED worker pool — checking every user
    // in parallel would open one IMAP/POP3 socket per user simultaneously
    // and trip mail-provider rate limits under load.
    let nextIndex = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        const idx = nextIndex++;
        if (idx >= usersToCheck.length) return;
        const userId = usersToCheck[idx];
        await checkUserForNewMail(userId);
      }
    };
    const workerCount = Math.min(MAX_PARALLEL_USER_CHECKS, usersToCheck.length);
    await Promise.allSettled(
      Array.from({ length: workerCount }, () => worker())
    );
  } finally {
    isPolling = false;
  }
}

/**
 * Check all of one user's active accounts for new mail, pushing a WebSocket
 * notification for anything new. Per-user errors are contained; failure
 * counters cool accounts down.
 */
async function checkUserForNewMail(userId: string): Promise<void> {
  try {
    const accounts = await getActiveAccountsForUser(userId);
    if (accounts.length === 0) return;

    // Check each account sequentially (per-user) to avoid multiple
    // concurrent connections to the same mail server per user.
    for (const account of accounts) {
      try {
        // Skip if user disconnected while we were processing
        if (!wsService.isUserConnected(userId)) {
          logger.debug(`[MailPoller] User ${userId} disconnected during poll, skipping remaining accounts`);
          break;
        }

        // Skip accounts that have been failing — let them cool down
        const failKey = `${userId}:${account.accountCode}`;
        const failCount = accountFailures.get(failKey) ?? 0;
        if (failCount >= ACCOUNT_FAIL_COOLDOWN_CYCLES) {
          logger.debug(`[MailPoller] Skipping ${account.accountCode} (failed ${failCount} times, cooling down)`);
          continue;
        }

        const result = await checkAccountWithTimeout(account);

        if (result === null) {
          // Account check failed — increment failure counter
          accountFailures.set(failKey, failCount + 1);
        } else {
          // Success — reset failure counter
          if (failCount > 0) {
            accountFailures.set(failKey, 0);
          }

          if (result.newCount > 0) {
            // Push WebSocket notification
            signalNewInboxMail(
              userId,
              account.accountCode,
              result.newCount,
              result.subjects[0]
            );
            logger.info(`[MailPoller] Pushed ${result.newCount} new mail(s) for ${account.email} (${account.accountCode})`);
          }
        }
      } catch (err) {
        // Per-account error — log and continue to next account
        const failKey = `${userId}:${account.accountCode}`;
        accountFailures.set(failKey, (accountFailures.get(failKey) ?? 0) + 1);
        logger.warn(`[MailPoller] Error checking account ${account.accountCode}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    // Per-user error — log and continue to next user
    logger.warn(`[MailPoller] Error for user ${userId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ============================================================================
// Service lifecycle
// ============================================================================

let pollTimer: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Start the mail poller. Called once at server startup.
 * The poller self-manages which users to check based on WebSocket
 * connection status — it only checks users with active connections.
 */
export function startMailPoller(): void {
  if (pollTimer) {
    logger.warn('[MailPoller] Already running');
    return;
  }

  isRunning = true;
  logger.info(`[MailPoller] Started — polling every ${POLL_INTERVAL_MS / 1000}s for connected users`);

  pollTimer = setInterval(() => {
    if (!isRunning) return;

    pollCycle().catch(err => {
      // Top-level catch — never let the poller crash the server
      logger.error('[MailPoller] Unhandled poll cycle error:', err);
    });
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the mail poller. Called on server shutdown.
 */
export function stopMailPoller(): void {
  isRunning = false;
  isPolling = false;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  // Cancel any debounced immediate polls still pending
  for (const timer of pendingImmediatePolls.values()) {
    clearTimeout(timer);
  }
  pendingImmediatePolls.clear();
  rotationCursor = 0;
  lastKnownCounts.clear();
  accountFailures.clear();
  logger.info('[MailPoller] Stopped');
}

/**
 * Check if the mail poller is currently running.
 */
export function isMailPollerRunning(): boolean {
  return isRunning;
}

/**
 * Debounced immediate-poll bookkeeping: userId → pending timer. Login and
 * reconnect storms (many users arriving at once, or one user's tabs
 * flapping) would otherwise fire one mail-server connection per event.
 */
const pendingImmediatePolls = new Map<string, NodeJS.Timeout>();

/**
 * Trigger an immediate poll for a specific user (debounced).
 * Called when a user logs in or reconnects via WebSocket. Multiple calls
 * within the debounce window (POLL_IMMEDIATE_DEBOUNCE_SEC, default 20s)
 * collapse into one actual poll — protects against reconnect storms.
 */
export function pollUserNow(userId: string): void {
  if (!isRunning) return;
  if (!wsService.isUserConnected(userId)) return;

  const existing = pendingImmediatePolls.get(userId);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    pendingImmediatePolls.delete(userId);

    // Run async — don't block the timer
    (async () => {
    try {
      logger.debug(`[MailPoller] Immediate poll triggered for user ${userId}`);
      const accounts = await getActiveAccountsForUser(userId);
      if (accounts.length === 0) return;

      for (const account of accounts) {
        if (!wsService.isUserConnected(userId)) break;

        try {
          const result = await checkAccountWithTimeout(account);
          if (result && result.newCount > 0) {
            signalNewInboxMail(userId, account.accountCode, result.newCount, result.subjects[0]);
            logger.info(`[MailPoller] Immediate: pushed ${result.newCount} new mail(s) for ${account.email} (${account.accountCode})`);
          }
        } catch (err) {
          logger.warn(`[MailPoller] Immediate poll error for ${account.accountCode}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      logger.warn(`[MailPoller] Immediate poll failed for user ${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
    })().catch(err => {
      logger.error(`[MailPoller] Unhandled immediate poll error for user ${userId}:`, err);
    });
  }, IMMEDIATE_POLL_DEBOUNCE_MS);

  pendingImmediatePolls.set(userId, timer);
}
