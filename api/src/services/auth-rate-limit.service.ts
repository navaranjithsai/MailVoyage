import pool from '../db/index.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface RateLimitPolicy {
  windowSec: number;
  maxAttempts: number;
  lockSec: number;
}

export interface RateLimitIdentity {
  scope: string;
  subjectKey: string;
  ipAddress: string;
}

export interface RateLimitFailureResult {
  locked: boolean;
  retryAfterSec: number;
  remainingAttempts: number;
}

const TABLE = 'auth_rate_limit_state';

const normalizeSubjectKey = (subjectKey: string): string => subjectKey.trim().toLowerCase();

const normalizeIp = (ipAddress: string): string => {
  const raw = (ipAddress || '').trim();
  if (!raw) return 'unknown';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
};

const remainingAttempts = (attemptCount: number, maxAttempts: number): number =>
  Math.max(0, maxAttempts - attemptCount);

const getRetryAfterSec = (lockedUntil: Date): number =>
  Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));

export const assertWithinRateLimit = async (
  identity: RateLimitIdentity,
  policy: RateLimitPolicy,
  message = 'Too many attempts. Please try again later.'
): Promise<void> => {
  const client = await pool.connect();
  try {
    const scope = identity.scope;
    const subjectKey = normalizeSubjectKey(identity.subjectKey);
    const ipAddress = normalizeIp(identity.ipAddress);

    const result = await client.query<{
      attempt_count: number;
      window_started_at: Date;
      locked_until: Date | null;
    }>(
      `SELECT attempt_count, window_started_at, locked_until
       FROM ${TABLE}
       WHERE scope = $1 AND subject_key = $2 AND ip_address = $3`,
      [scope, subjectKey, ipAddress]
    );

    if (result.rows.length === 0) {
      return;
    }

    const row = result.rows[0];
    const now = Date.now();

    if (row.locked_until && row.locked_until.getTime() > now) {
      throw new AppError(message, 429, true, {
        retryAfterSec: getRetryAfterSec(row.locked_until),
        lockedUntil: row.locked_until.toISOString(),
      });
    }

    const windowAgeMs = now - row.window_started_at.getTime();
    if (windowAgeMs > policy.windowSec * 1000 && row.attempt_count > 0) {
      await client.query(
        `UPDATE ${TABLE}
         SET attempt_count = 0,
             window_started_at = NOW(),
             locked_until = NULL,
             updated_at = NOW()
         WHERE scope = $1 AND subject_key = $2 AND ip_address = $3`,
        [scope, subjectKey, ipAddress]
      );
    }
  } finally {
    client.release();
  }
};

export const recordRateLimitFailure = async (
  identity: RateLimitIdentity,
  policy: RateLimitPolicy
): Promise<RateLimitFailureResult> => {
  const client = await pool.connect();
  try {
    const scope = identity.scope;
    const subjectKey = normalizeSubjectKey(identity.subjectKey);
    const ipAddress = normalizeIp(identity.ipAddress);

    await client.query('BEGIN');

    const rowRes = await client.query<{
      attempt_count: number;
      window_started_at: Date;
      locked_until: Date | null;
    }>(
      `SELECT attempt_count, window_started_at, locked_until
       FROM ${TABLE}
       WHERE scope = $1 AND subject_key = $2 AND ip_address = $3
       FOR UPDATE`,
      [scope, subjectKey, ipAddress]
    );

    if (rowRes.rows.length === 0) {
      await client.query(
        `INSERT INTO ${TABLE} (
          scope,
          subject_key,
          ip_address,
          attempt_count,
          window_started_at,
          locked_until,
          updated_at
        ) VALUES ($1, $2, $3, 1, NOW(), NULL, NOW())`,
        [scope, subjectKey, ipAddress]
      );

      await client.query('COMMIT');
      return {
        locked: false,
        retryAfterSec: 0,
        remainingAttempts: remainingAttempts(1, policy.maxAttempts),
      };
    }

    const row = rowRes.rows[0];
    const now = Date.now();

    const lockStillActive = row.locked_until && row.locked_until.getTime() > now;
    if (lockStillActive && row.locked_until) {
      await client.query('COMMIT');
      return {
        locked: true,
        retryAfterSec: getRetryAfterSec(row.locked_until),
        remainingAttempts: 0,
      };
    }

    const resetWindow = now - row.window_started_at.getTime() > policy.windowSec * 1000;
    const nextAttemptCount = resetWindow ? 1 : row.attempt_count + 1;
    const shouldLock = nextAttemptCount >= policy.maxAttempts;

    const lockUntil = shouldLock
      ? new Date(now + policy.lockSec * 1000)
      : null;

    await client.query(
      `UPDATE ${TABLE}
       SET attempt_count = $4,
           window_started_at = CASE WHEN $5::boolean THEN NOW() ELSE window_started_at END,
           locked_until = $6,
           updated_at = NOW()
       WHERE scope = $1 AND subject_key = $2 AND ip_address = $3`,
      [scope, subjectKey, ipAddress, nextAttemptCount, resetWindow, lockUntil]
    );

    await client.query('COMMIT');

    return {
      locked: shouldLock,
      retryAfterSec: lockUntil ? getRetryAfterSec(lockUntil) : 0,
      remainingAttempts: shouldLock ? 0 : remainingAttempts(nextAttemptCount, policy.maxAttempts),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('recordRateLimitFailure failed', { identity, error });
    throw error;
  } finally {
    client.release();
  }
};

export const clearRateLimitState = async (identity: RateLimitIdentity): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query(
      `DELETE FROM ${TABLE}
       WHERE scope = $1 AND subject_key = $2 AND ip_address = $3`,
      [identity.scope, normalizeSubjectKey(identity.subjectKey), normalizeIp(identity.ipAddress)]
    );
  } finally {
    client.release();
  }
};
