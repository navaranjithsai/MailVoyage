/**
 * Inbox Cache Limit — single source of truth (frontend).
 *
 * The cache limit is a PER-USER preference (Settings → Data Management).
 * No component or sync path may hardcode a limit number: every consumer
 * reads the user's stored value through the helpers below, falling back to
 * the app-wide default only when nothing has been set yet.
 *
 * MIN/MAX exist purely as guard rails for corrupt/invalid stored values and
 * mirror the range enforced by the API server.
 */

/** localStorage key the user's saved cache limit is stored under. */
export const INBOX_CACHE_LIMIT_KEY = 'inbox_cache_limit';

/** App-wide default used until the user has saved their own preference. */
export const INBOX_CACHE_LIMIT_DEFAULT = 15;

/** Lowest sane limit (guard rail for corrupt values; mirrors the API). */
export const INBOX_CACHE_LIMIT_MIN = 5;

/** Highest sane limit (guard rail for corrupt values; mirrors the API). */
export const INBOX_CACHE_LIMIT_MAX = 100;

/** Clamp any raw number into the valid limit range. */
export function clampInboxCacheLimit(value: number): number {
  if (!Number.isFinite(value)) return INBOX_CACHE_LIMIT_DEFAULT;
  return Math.max(
    INBOX_CACHE_LIMIT_MIN,
    Math.min(INBOX_CACHE_LIMIT_MAX, Math.round(value))
  );
}

/**
 * Read the user's saved cache limit from localStorage.
 * Falls back to the app default (never another magic number) when missing
 * or corrupt, and clamps out-of-range values into the valid window.
 */
export function getStoredInboxCacheLimit(): number {
  const raw = localStorage.getItem(INBOX_CACHE_LIMIT_KEY);
  const parsed = raw !== null ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed)) {
    return clampInboxCacheLimit(parsed);
  }
  return INBOX_CACHE_LIMIT_DEFAULT;
}

/** Persist the user's cache limit locally (called after a server-side save). */
export function storeInboxCacheLimit(limit: number): number {
  const safe = clampInboxCacheLimit(limit);
  localStorage.setItem(INBOX_CACHE_LIMIT_KEY, String(safe));
  return safe;
}
