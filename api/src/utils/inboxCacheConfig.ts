/**
 * Inbox Cache Limit — single source of truth (API server).
 *
 * The cache limit is a PER-USER preference persisted in user_settings under
 * INBOX_CACHE_LIMIT_SETTING_KEY. Every sync path (controller, poller,
 * service) must read the user's own value — never hardcode a number. The
 * constants below are the shared default and the guard-rail range enforced
 * on writes. (The DB-reading helper lives in inbox.service.ts to avoid a
 * circular dependency between the service and this module.)
 */

/** user_settings key the per-user cache limit is stored under. */
export const INBOX_CACHE_LIMIT_SETTING_KEY = 'inbox_cache_limit';

/** App-wide default used until the user has saved their own preference. */
export const INBOX_CACHE_LIMIT_DEFAULT = 15;

/** Lowest sane limit (guard rail; mirrored by the frontend slider min). */
export const INBOX_CACHE_LIMIT_MIN = 5;

/** Highest sane limit (guard rail; mirrored by the frontend slider max). */
export const INBOX_CACHE_LIMIT_MAX = 100;

/** Clamp any raw number into the valid limit range. */
export function clampInboxCacheLimit(value: number): number {
  if (!Number.isFinite(value)) return INBOX_CACHE_LIMIT_DEFAULT;
  return Math.max(
    INBOX_CACHE_LIMIT_MIN,
    Math.min(INBOX_CACHE_LIMIT_MAX, Math.round(value))
  );
}
