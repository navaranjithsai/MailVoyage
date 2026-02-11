/**
 * MailVoyage Dexie.js Database
 * 
 * Offline-First IndexedDB wrapper using Dexie.js
 * Provides type-safe, fast access to local data with delta sync support.
 */

import Dexie, { type Table } from 'dexie';

// ============================================================================
// Types
// ============================================================================

export interface SentMailRecord {
  id: string;
  threadId: string;
  fromEmail: string;
  toEmails: string[];
  cc?: string[] | null;
  bcc?: string[] | null;
  subject: string;
  htmlBody?: string | null;
  textBody?: string | null;
  attachmentsMetadata?: Array<{
    filename: string;
    contentType: string;
    size: number;
    content?: string;
  }> | null;
  messageId?: string | null;
  status: 'pending' | 'sent' | 'failed';
  sentAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface InboxMailRecord {
  id: string;
  uid: number;
  accountId: string;
  mailbox: string;
  messageId?: string;
  fromAddress: string;
  fromName?: string;
  toAddresses: string[];
  ccAddresses?: string[];
  bccAddresses?: string[];
  subject: string;
  htmlBody?: string | null;
  textBody?: string | null;
  date: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  attachmentsMetadata?: Array<{
    filename: string;
    contentType: string;
    size: number;
  }> | null;
  labels?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DraftRecord {
  id: string;
  fromAccountId: string | null;
  fromEmail: string | null;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  attachments: Array<{
    id: string;
    name: string;
    size: number;
    sizeFormatted: string;
    type: string;
    content: string;
  }>;
  charCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SyncCheckpoint {
  id: string; // 'global' or specific table name
  lastSyncTimestamp: string; // ISO timestamp
  lastSyncedAt: string; // When the sync happened (client time)
}

export interface PendingSync {
  id: string;
  type: 'create' | 'update' | 'delete';
  table: string;
  recordId: string;
  data?: any;
  createdAt: string;
  retries: number;
}

export interface CacheMetadata {
  key: string;
  value: any;
  expiresAt?: string;
}

// ============================================================================
// Dexie Database Class
// ============================================================================

class MailVoyageDB extends Dexie {
  // Tables
  sentMails!: Table<SentMailRecord, string>;
  inboxMails!: Table<InboxMailRecord, string>;
  drafts!: Table<DraftRecord, string>;
  syncCheckpoints!: Table<SyncCheckpoint, string>;
  pendingSync!: Table<PendingSync, string>;
  cacheMetadata!: Table<CacheMetadata, string>;

  constructor() {
    super('MailVoyageDB');

    // Schema version 1
    this.version(1).stores({
      // Sent mails - indexed by id, updatedAt for delta sync
      sentMails: 'id, threadId, fromEmail, status, sentAt, updatedAt',
      
      // Inbox mails - indexed for efficient queries
      inboxMails: 'id, uid, accountId, mailbox, [accountId+mailbox], date, isRead, isStarred, updatedAt',
      
      // Drafts - local only
      drafts: 'id, updatedAt',
      
      // Sync checkpoints - track last sync per table
      syncCheckpoints: 'id',
      
      // Pending sync queue for offline operations
      pendingSync: 'id, type, table, createdAt',
      
      // General cache metadata
      cacheMetadata: 'key'
    });
  }
}

// Singleton instance
export const db = new MailVoyageDB();

/**
 * Ensure the Dexie database is open.
 * After logout, `db.close()` + `indexedDB.deleteDatabase()` leaves the
 * singleton in a closed state. Any subsequent read/write will throw
 * `DatabaseClosedError`. This helper reopens it (creating a fresh empty DB
 * if the old one was deleted).
 */
export async function ensureOpen(): Promise<void> {
  if (!db.isOpen()) {
    await db.open();
  }
}

// ============================================================================
// Sync Checkpoint Helpers
// ============================================================================

/**
 * Get the last sync timestamp for a specific table or global
 */
export async function getLastSyncTimestamp(tableOrGlobal: string = 'global'): Promise<string | null> {
  try {
    const checkpoint = await db.syncCheckpoints.get(tableOrGlobal);
    return checkpoint?.lastSyncTimestamp || null;
  } catch (error) {
    console.warn('[DB] Error getting sync checkpoint:', error);
    return null;
  }
}

/**
 * Update the sync checkpoint after successful sync
 */
export async function updateSyncCheckpoint(
  tableOrGlobal: string,
  timestamp: string
): Promise<void> {
  try {
    await db.syncCheckpoints.put({
      id: tableOrGlobal,
      lastSyncTimestamp: timestamp,
      lastSyncedAt: new Date().toISOString()
    });
  } catch (error) {
    console.warn('[DB] Error updating sync checkpoint:', error);
  }
}

// ============================================================================
// Sent Mails Helpers
// ============================================================================

/**
 * Bulk upsert sent mails (insert or update)
 */
export async function upsertSentMails(mails: SentMailRecord[]): Promise<void> {
  if (mails.length === 0) return;
  await db.sentMails.bulkPut(mails);
}

/**
 * Get all sent mails, sorted by sentAt descending
 */
export async function getAllSentMails(): Promise<SentMailRecord[]> {
  return db.sentMails.orderBy('sentAt').reverse().toArray();
}

/**
 * Get sent mails updated after a specific timestamp
 */
export async function getSentMailsUpdatedAfter(timestamp: string): Promise<SentMailRecord[]> {
  return db.sentMails
    .where('updatedAt')
    .above(timestamp)
    .toArray();
}

/**
 * Delete sent mails by IDs
 */
export async function deleteSentMails(ids: string[]): Promise<void> {
  await db.sentMails.bulkDelete(ids);
}

/**
 * Clear all sent mails
 */
export async function clearSentMails(): Promise<void> {
  await db.sentMails.clear();
}

/**
 * Get sent mails count (safe — ensures DB is open first)
 */
export async function getSentMailsCount(): Promise<number> {
  await ensureOpen();
  return db.sentMails.count();
}

/**
 * Add or update sent mails (upsert multiple)
 */
export async function addOrUpdateSentMails(mails: Array<Omit<SentMailRecord, 'updatedAt'> & { syncedAt?: string }>): Promise<void> {
  if (mails.length === 0) return;
  
  const recordsToUpsert: SentMailRecord[] = mails.map(mail => ({
    ...mail,
    updatedAt: mail.syncedAt || new Date().toISOString()
  }));
  
  await db.sentMails.bulkPut(recordsToUpsert);
}

/**
 * Get sent mail by ID
 */
export async function getSentMailById(id: string): Promise<SentMailRecord | undefined> {
  return db.sentMails.get(id);
}

/**
 * Get sent mail by thread ID
 */
export async function getSentMailByThreadId(threadId: string): Promise<SentMailRecord | undefined> {
  return db.sentMails.where('threadId').equals(threadId).first();
}

/**
 * Get sent mails with pagination
 */
export async function getSentMailsPaginated(
  page: number = 1,
  limit: number = 20
): Promise<{ mails: SentMailRecord[]; total: number; page: number; limit: number; totalPages: number }> {
  const total = await db.sentMails.count();
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  
  const mails = await db.sentMails
    .orderBy('sentAt')
    .reverse()
    .offset(offset)
    .limit(limit)
    .toArray();
  
  return { mails, total, page, limit, totalPages };
}

// ============================================================================
// Inbox Mails Helpers
// ============================================================================

/** Fields encrypted at rest in IndexedDB */
const ENCRYPTED_MAIL_FIELDS: (keyof InboxMailRecord)[] = [
  'fromAddress', 'fromName', 'subject', 'textBody', 'htmlBody',
];

/**
 * One-time migration: remove inbox mail records that were stored with numeric
 * primary keys (from a previous deltaSync bug).  String-keyed records are the
 * canonical ones; numeric-keyed records are duplicates that cause React
 * duplicate-key warnings.
 */
export async function cleanupNumericKeyedMails(): Promise<number> {
  await ensureOpen();
  const allKeys = await db.inboxMails.toCollection().primaryKeys();
  const numericKeys = allKeys.filter(k => typeof k === 'number');
  if (numericKeys.length > 0) {
    await db.inboxMails.bulkDelete(numericKeys as any);
    console.log(`[DB] Cleaned up ${numericKeys.length} numeric-keyed duplicate inbox mails`);
  }
  return numericKeys.length;
}

/**
 * Bulk upsert inbox mails (encrypts sensitive fields before storing)
 */
export async function upsertInboxMails(mails: InboxMailRecord[]): Promise<void> {
  if (mails.length === 0) return;
  await ensureOpen();
  const { encryptMailRecord } = await import('./crypto');
  const encrypted = await Promise.all(
    mails.map(m => encryptMailRecord(m, ENCRYPTED_MAIL_FIELDS))
  );
  await db.inboxMails.bulkPut(encrypted);
}

/**
 * Decrypt a single inbox mail record after reading from IndexedDB.
 * Returns null if any encrypted field couldn't be decrypted (stale key).
 */
async function decryptInboxMail(mail: InboxMailRecord): Promise<InboxMailRecord | null> {
  const { decryptMailRecord, isEncryptedData } = await import('./crypto');
  const decrypted = await decryptMailRecord(mail, ENCRYPTED_MAIL_FIELDS);
  // If any field still starts with the encryption prefix, the key is stale
  for (const field of ENCRYPTED_MAIL_FIELDS) {
    const val = (decrypted as any)[field];
    if (typeof val === 'string' && isEncryptedData(val)) {
      return null; // Stale — caller should discard
    }
  }
  return decrypted;
}

/**
 * Get inbox mails for a specific account and mailbox (decrypted)
 */
export async function getInboxMails(
  accountId: string,
  mailbox: string = 'INBOX'
): Promise<InboxMailRecord[]> {
  const mails = await db.inboxMails
    .where('[accountId+mailbox]')
    .equals([accountId, mailbox])
    .reverse()
    .sortBy('date');
  const results = await Promise.all(mails.map(decryptInboxMail));
  return results.filter((m): m is InboxMailRecord => m !== null);
}

/**
 * Get inbox mails for a specific account with pagination (decrypted)
 */
export async function getInboxMailsPaginated(
  accountId: string,
  page: number = 1,
  limit: number = 20,
  mailbox: string = 'INBOX'
): Promise<{ mails: InboxMailRecord[]; total: number; page: number; totalPages: number }> {
  const allMails = await db.inboxMails
    .where('[accountId+mailbox]')
    .equals([accountId, mailbox])
    .reverse()
    .sortBy('date');
  
  const total = allMails.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const paginated = allMails.slice(offset, offset + limit);
  const decrypted = await Promise.all(paginated.map(decryptInboxMail));
  const valid = decrypted.filter((m): m is InboxMailRecord => m !== null);
  
  return { mails: valid, total, page, totalPages };
}

/**
 * Get all inbox mails (decrypted), excluding archived
 */
export async function getAllInboxMails(): Promise<InboxMailRecord[]> {
  await ensureOpen();
  const mails = await db.inboxMails.orderBy('date').reverse().toArray();
  const decrypted = await Promise.all(mails.map(decryptInboxMail));
  const valid = decrypted.filter((m): m is InboxMailRecord => m !== null);
  // If many records are stale (undecryptable), wipe them so a re-fetch picks up fresh data
  const staleCount = decrypted.length - valid.length;
  if (staleCount > 0) {
    console.warn(`[DB] ${staleCount} inbox mails had stale encryption — clearing them`);
    const staleKeys = mails
      .filter((_, i) => decrypted[i] === null)
      .map(m => m.id);
    await db.inboxMails.bulkDelete(staleKeys);
  }
  // Filter out archived mails from the main inbox view
  return valid.filter(m => m.mailbox !== 'ARCHIVE');
}

/**
 * Get a single inbox mail by ID (decrypted)
 */
export async function getInboxMailById(id: string): Promise<InboxMailRecord | undefined> {
  await ensureOpen();
  const mail = await db.inboxMails.get(id);
  if (!mail) return undefined;
  const decrypted = await decryptInboxMail(mail);
  if (!decrypted) {
    // Stale encryption — delete the record
    await db.inboxMails.delete(id);
    return undefined;
  }
  return decrypted;
}

/**
 * Mark mail as read/unread
 */
export async function updateMailReadStatus(id: string, isRead: boolean): Promise<void> {
  await db.inboxMails.update(id, { 
    isRead, 
    updatedAt: new Date().toISOString() 
  });
}

/**
 * Mark mail as starred/unstarred
 */
export async function updateMailStarredStatus(id: string, isStarred: boolean): Promise<void> {
  await db.inboxMails.update(id, { 
    isStarred, 
    updatedAt: new Date().toISOString() 
  });
}

/**
 * Delete inbox mails by IDs
 */
export async function deleteInboxMails(ids: string[]): Promise<void> {
  await db.inboxMails.bulkDelete(ids);
}

/**
 * Look up existing Dexie primary keys for a set of (accountId, uid) pairs.
 * Returns a Map<uid, existingId> for quick lookup.
 */
export async function getExistingMailIds(
  accountId: string,
  uids: number[]
): Promise<Map<number, string>> {
  await ensureOpen();
  const existing = await db.inboxMails
    .where('accountId')
    .equals(accountId)
    .toArray();
  const map = new Map<number, string>();
  for (const m of existing) {
    if (uids.includes(m.uid)) {
      map.set(m.uid, m.id);
    }
  }
  return map;
}

/**
 * Get unread count (reads flags only, no decryption needed)
 */
export async function getUnreadCount(accountId?: string): Promise<number> {
  await ensureOpen();
  if (accountId) {
    return db.inboxMails
      .where('accountId')
      .equals(accountId)
      .and(mail => !mail.isRead)
      .count();
  }
  return db.inboxMails.filter(mail => !mail.isRead).count();
}

/**
 * Get total inbox count for an account
 */
export async function getInboxCount(accountId?: string): Promise<number> {
  if (accountId) {
    return db.inboxMails.where('accountId').equals(accountId).count();
  }
  return db.inboxMails.count();
}

/**
 * Search inbox mails locally (decrypts and searches)
 */
export async function searchInboxMails(
  query: string,
  accountId?: string
): Promise<InboxMailRecord[]> {
  const lowerQuery = query.toLowerCase();
  let mails: InboxMailRecord[];

  if (accountId) {
    mails = await db.inboxMails.where('accountId').equals(accountId).toArray();
  } else {
    mails = await db.inboxMails.toArray();
  }

  // Decrypt all mails for search
  const decrypted = await Promise.all(mails.map(decryptInboxMail));
  const valid = decrypted.filter((m): m is InboxMailRecord => m !== null);

  return valid.filter(mail => {
    return (
      mail.subject.toLowerCase().includes(lowerQuery) ||
      mail.fromAddress.toLowerCase().includes(lowerQuery) ||
      (mail.fromName && mail.fromName.toLowerCase().includes(lowerQuery)) ||
      mail.toAddresses.some(addr => addr.toLowerCase().includes(lowerQuery)) ||
      (mail.textBody && mail.textBody.toLowerCase().includes(lowerQuery))
    );
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Get highest UID stored for an account+mailbox (for incremental IMAP sync).
 * For POP3 accounts, the UIDs are hashed from UIDL strings — they are stable
 * but not sequential, so this value cannot be used as a "since" marker for
 * incremental POP3 fetch (POP3 doesn't support incremental sync anyway).
 */
export async function getHighestUid(accountId: string, mailbox: string = 'INBOX'): Promise<number> {
  const mails = await db.inboxMails
    .where('[accountId+mailbox]')
    .equals([accountId, mailbox])
    .toArray();
  
  if (mails.length === 0) return 0;
  return Math.max(...mails.map(m => m.uid));
}

/**
 * Clear inbox mails for a specific account
 */
export async function clearAccountInbox(accountId: string): Promise<void> {
  const ids = await db.inboxMails
    .where('accountId')
    .equals(accountId)
    .primaryKeys();
  await db.inboxMails.bulkDelete(ids as string[]);
}

/**
 * Archive an inbox mail locally (adds 'archived' label, marks read).
 * This only affects the local Dexie copy — never touches the mail server.
 */
export async function archiveInboxMail(id: string): Promise<void> {
  const mail = await db.inboxMails.get(id);
  if (!mail) return;
  const labels = Array.isArray(mail.labels) ? [...mail.labels] : [];
  if (!labels.includes('archived')) labels.push('archived');
  await db.inboxMails.update(id, {
    labels,
    isRead: true,
    mailbox: 'ARCHIVE',
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Trim inbox mails to keep only the latest N per account (for cache limit enforcement).
 */
export async function trimInboxToLimit(accountId: string, limit: number): Promise<number> {
  // Guard: Dexie .equals() requires a valid key (string/number/Date/Array)
  if (!accountId || typeof accountId !== 'string') {
    console.warn('[DB] trimInboxToLimit called with invalid accountId:', accountId);
    return 0;
  }
  const mails = await db.inboxMails
    .where('accountId')
    .equals(accountId)
    .reverse()
    .sortBy('date');

  if (mails.length <= limit) return 0;

  const toDelete = mails.slice(limit).map(m => m.id);
  await db.inboxMails.bulkDelete(toDelete);
  return toDelete.length;
}

// ============================================================================
// Drafts Helpers
// ============================================================================

/**
 * Draft input type - id and timestamps are optional (auto-generated if not provided)
 */
export type DraftInput = Omit<DraftRecord, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
};

/**
 * Save or update a draft
 * Auto-generates id and timestamps if not provided
 * Returns the saved draft with all fields populated
 */
export async function saveDraft(draft: DraftInput): Promise<DraftRecord> {
  const now = new Date().toISOString();
  const draftRecord: DraftRecord = {
    ...draft,
    id: draft.id || crypto.randomUUID(),
    createdAt: draft.createdAt || now,
    updatedAt: now
  };
  await db.drafts.put(draftRecord);
  return draftRecord;
}

/**
 * Get all drafts
 */
export async function getAllDrafts(): Promise<DraftRecord[]> {
  return db.drafts.orderBy('updatedAt').reverse().toArray();
}

/**
 * Get draft by ID
 */
export async function getDraftById(id: string): Promise<DraftRecord | undefined> {
  return db.drafts.get(id);
}

/**
 * Delete draft by ID
 */
export async function deleteDraft(id: string): Promise<void> {
  await db.drafts.delete(id);
}

/**
 * Delete multiple drafts by IDs
 */
export async function deleteDrafts(ids: string[]): Promise<void> {
  await db.drafts.bulkDelete(ids);
}

/**
 * Get drafts count
 */
export async function getDraftsCount(): Promise<number> {
  await ensureOpen();
  return db.drafts.count();
}

// Type aliases for compatibility with pages
export type EmailDraft = DraftRecord;
export type DraftAttachment = DraftRecord['attachments'][0];

// ============================================================================
// Pending Sync Queue (for offline operations)
// ============================================================================

/**
 * Add an operation to the pending sync queue
 */
export async function addToPendingSync(
  type: PendingSync['type'],
  table: string,
  recordId: string,
  data?: any
): Promise<void> {
  await db.pendingSync.put({
    id: `${table}_${recordId}_${Date.now()}`,
    type,
    table,
    recordId,
    data,
    createdAt: new Date().toISOString(),
    retries: 0
  });
}

/**
 * Get all pending sync operations
 */
export async function getPendingSync(): Promise<PendingSync[]> {
  return db.pendingSync.orderBy('createdAt').toArray();
}

/**
 * Remove a pending sync operation
 */
export async function removePendingSync(id: string): Promise<void> {
  await db.pendingSync.delete(id);
}

/**
 * Get pending sync count
 */
export async function getPendingSyncCount(): Promise<number> {
  return db.pendingSync.count();
}

/**
 * Clear all pending sync operations
 */
export async function clearPendingSync(): Promise<void> {
  await db.pendingSync.clear();
}

// ============================================================================
// Cache Metadata Helpers
// ============================================================================

/**
 * Set a cache value with optional expiry
 */
export async function setCacheValue(
  key: string,
  value: any,
  ttlMs?: number
): Promise<void> {
  await ensureOpen();
  await db.cacheMetadata.put({
    key,
    value,
    expiresAt: ttlMs ? new Date(Date.now() + ttlMs).toISOString() : undefined
  });
}

/**
 * Get a cache value (returns null if expired)
 */
export async function getCacheValue<T = any>(key: string): Promise<T | null> {
  await ensureOpen();
  const entry = await db.cacheMetadata.get(key);
  if (!entry) return null;
  
  if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
    await db.cacheMetadata.delete(key);
    return null;
  }
  
  return entry.value as T;
}

/**
 * Delete a cache value
 */
export async function deleteCacheValue(key: string): Promise<void> {
  await db.cacheMetadata.delete(key);
}

// ============================================================================
// Database Utilities
// ============================================================================

/**
 * Clear all data (for logout)
 */
export async function clearAllData(): Promise<void> {
  await Promise.all([
    db.sentMails.clear(),
    db.inboxMails.clear(),
    db.drafts.clear(),
    db.syncCheckpoints.clear(),
    db.pendingSync.clear(),
    db.cacheMetadata.clear()
  ]);
}

/**
 * Get database size estimate
 */
export async function getDbSizeEstimate(): Promise<{
  sentMails: number;
  inboxMails: number;
  drafts: number;
  pendingSync: number;
}> {
  const [sentMails, inboxMails, drafts, pendingSync] = await Promise.all([
    db.sentMails.count(),
    db.inboxMails.count(),
    db.drafts.count(),
    db.pendingSync.count()
  ]);
  
  return { sentMails, inboxMails, drafts, pendingSync };
}
/**
 * Estimate the byte sizes of IndexedDB (Dexie) and localStorage.
 * Returns bytes for each.
 */
export async function getStorageBreakdown(): Promise<{
  indexedDb: { bytes: number; tables: Record<string, { count: number; bytes: number }> };
  localStorage: { bytes: number; keys: number };
}> {
  // --- IndexedDB: estimate by serialising a sample and multiplying ---
  const tables: Record<string, { count: number; bytes: number }> = {};

  const estimateTable = async (table: Table<any, any>, name: string) => {
    const count = await table.count();
    if (count === 0) {
      tables[name] = { count: 0, bytes: 0 };
      return;
    }
    // Sample up to 10 records and extrapolate
    const sampleSize = Math.min(count, 10);
    const sample = await table.limit(sampleSize).toArray();
    const sampleBytes = sample.reduce((acc, r) => acc + new Blob([JSON.stringify(r)]).size, 0);
    const avgBytes = sampleBytes / sampleSize;
    tables[name] = { count, bytes: Math.round(avgBytes * count) };
  };

  await Promise.all([
    estimateTable(db.inboxMails, 'inboxMails'),
    estimateTable(db.sentMails, 'sentMails'),
    estimateTable(db.drafts, 'drafts'),
    estimateTable(db.pendingSync, 'pendingSync'),
    estimateTable(db.syncCheckpoints, 'syncCheckpoints'),
    estimateTable(db.cacheMetadata, 'cacheMetadata'),
  ]);

  const indexedDbBytes = Object.values(tables).reduce((s, t) => s + t.bytes, 0);

  // --- localStorage ---
  let lsBytes = 0;
  let lsKeys = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        lsKeys++;
        const val = localStorage.getItem(key) || '';
        lsBytes += (key.length + val.length) * 2; // JS strings are UTF-16
      }
    }
  } catch { /* private browsing etc. */ }

  return {
    indexedDb: { bytes: indexedDbBytes, tables },
    localStorage: { bytes: lsBytes, keys: lsKeys },
  };
}
export default db;
