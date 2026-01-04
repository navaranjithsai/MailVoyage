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

/**
 * Bulk upsert inbox mails
 */
export async function upsertInboxMails(mails: InboxMailRecord[]): Promise<void> {
  if (mails.length === 0) return;
  await db.inboxMails.bulkPut(mails);
}

/**
 * Get inbox mails for a specific account and mailbox
 */
export async function getInboxMails(
  accountId: string,
  mailbox: string = 'INBOX'
): Promise<InboxMailRecord[]> {
  return db.inboxMails
    .where('[accountId+mailbox]')
    .equals([accountId, mailbox])
    .reverse()
    .sortBy('date');
}

/**
 * Get all inbox mails
 */
export async function getAllInboxMails(): Promise<InboxMailRecord[]> {
  return db.inboxMails.orderBy('date').reverse().toArray();
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
 * Get unread count
 */
export async function getUnreadCount(accountId?: string): Promise<number> {
  if (accountId) {
    return db.inboxMails
      .where('accountId')
      .equals(accountId)
      .and(mail => !mail.isRead)
      .count();
  }
  return db.inboxMails.filter(mail => !mail.isRead).count();
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

export default db;
