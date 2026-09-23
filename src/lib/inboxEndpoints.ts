/**
 * Pure URL-builder helpers for inbox API endpoints.
 * No Dexie, no apiFetch, no localStorage — safe to import in any environment.
 */

/**
 * Build the GET endpoint that returns all cached inbox mails for one account.
 * Uses the server-side inbox_cache table (fast, no IMAP round-trip).
 */
export const buildCachedInboxEndpoint = (accountCode: string): string =>
  `/api/inbox/cached?accountCode=${encodeURIComponent(accountCode)}`;
