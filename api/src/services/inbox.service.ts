import { ImapFlow, FetchMessageObject } from 'imapflow';
import { simpleParser, AddressObject } from 'mailparser';
import crypto from 'crypto';
// @ts-ignore — node-pop3 has no type declarations
import Pop3Command from 'node-pop3';
import pool from '../db/index.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';
import { tryDecrypt } from '../utils/crypto.js';

/**
 * Convert a POP3 UIDL string into a stable positive integer.
 * POP3 message numbers are transient (change on deletion), so we hash
 * the UIDL value to produce a deterministic numeric UID.
 */
function pop3UidlToNumericUid(uidlStr: string): number {
  const hash = crypto.createHash('md5').update(uidlStr).digest();
  // Use first 4 bytes as unsigned 32-bit int (always positive)
  return hash.readUInt32BE(0);
}

// ============================================================================
// Types
// ============================================================================

export interface InboxMail {
  id: string;          // server DB id (uuid)
  uid: number;         // IMAP UID
  accountCode: string;
  mailbox: string;
  messageId: string | null;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  ccAddresses: string[] | null;
  bccAddresses: string[] | null;
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  date: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  attachmentsMetadata: Array<{
    filename: string;
    contentType: string;
    size: number;
  }> | null;
  labels: string[] | null;
}

export interface PaginatedInbox {
  mails: InboxMail[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

export interface FetchFromServerResult {
  mails: InboxMail[];
  totalOnServer: number;
  fetched: number;
}

// ============================================================================
// Helper: Extract addresses
// ============================================================================

function extractAddresses(addr: AddressObject | AddressObject[] | undefined): string[] {
  if (!addr) return [];
  const list = Array.isArray(addr) ? addr : [addr];
  const result: string[] = [];
  for (const group of list) {
    if (group.value) {
      for (const entry of group.value) {
        if (entry.address) result.push(entry.address);
      }
    }
  }
  return result;
}

function extractName(addr: AddressObject | AddressObject[] | undefined): string | null {
  if (!addr) return null;
  const list = Array.isArray(addr) ? addr : [addr];
  for (const group of list) {
    if (group.value) {
      for (const entry of group.value) {
        if (entry.name) return entry.name;
      }
    }
  }
  return null;
}

// ============================================================================
// Helper: Get IMAP account credentials
// ============================================================================

interface ImapCredentials {
  email: string;
  accountCode: string;
  host: string;
  port: number;
  username: string;
  password: string;
  security: string;
  incomingType: string;
}

async function getImapCredentials(userId: string, accountCode: string): Promise<ImapCredentials> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT email, account_code, incoming_type, incoming_host, incoming_port,
              incoming_username, password, incoming_security
       FROM email_accounts
       WHERE user_id = $1 AND account_code = $2 AND is_active = true`,
      [userId, accountCode]
    );

    if (result.rows.length === 0) {
      throw new AppError('Email account not found or inactive', 404, true);
    }

    const row = result.rows[0];
    const decryptedPassword = tryDecrypt(row.password);
    if (!decryptedPassword) {
      throw new AppError('Failed to decrypt account password', 500, false);
    }

    return {
      email: row.email,
      accountCode: row.account_code,
      host: row.incoming_host,
      port: row.incoming_port,
      username: row.incoming_username || row.email,
      password: decryptedPassword,
      security: row.incoming_security,
      incomingType: row.incoming_type,
    };
  } finally {
    client.release();
  }
}

// ============================================================================
// Helper: Get all active email accounts for a user
// ============================================================================

async function getAllEmailAccounts(userId: string): Promise<Array<{ accountCode: string; email: string; isPrimary: boolean }>> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT account_code, email, is_primary
       FROM email_accounts
       WHERE user_id = $1 AND is_active = true
       ORDER BY is_primary DESC, created_at ASC`,
      [userId]
    );
    return result.rows.map(r => ({
      accountCode: r.account_code,
      email: r.email,
      isPrimary: r.is_primary
    }));
  } finally {
    client.release();
  }
}

// ============================================================================
// IMAP: Fetch mails from mail server
// ============================================================================

/**
 * Fetch emails from the mail server via IMAP.
 * Supports pagination via startUid/limit or fetching everything since a UID.
 */
export async function fetchMailsFromServer(
  userId: string,
  accountCode: string,
  options: {
    mailbox?: string;
    limit?: number;
    sinceUid?: number;     // Fetch mails with UID > sinceUid (for incremental sync)
    page?: number;         // For server-side pagination of older mails
  } = {}
): Promise<FetchFromServerResult> {
  const {
    mailbox = 'INBOX',
    limit = 15,
    sinceUid,
    page = 1,
  } = options;

  const creds = await getImapCredentials(userId, accountCode);

  if (creds.incomingType === 'POP3') {
    if (sinceUid) {
      logger.debug(`[POP3] sinceUid=${sinceUid} ignored for POP3 account ${accountCode} (POP3 does not support incremental sync)`);
    }
    return fetchMailsViaPop3(creds, accountCode, mailbox, limit, page);
  }

  // Default: IMAP
  return fetchMailsViaImap(creds, accountCode, { mailbox, limit, sinceUid, page });
}

// ============================================================================
// POP3: Fetch mails from mail server
// ============================================================================

async function fetchMailsViaPop3(
  creds: ImapCredentials,
  accountCode: string,
  _mailbox: string,
  limit: number,
  page: number
): Promise<FetchFromServerResult> {
  // node-pop3 does not support STLS (STARTTLS upgrade). For STARTTLS,
  // we treat it the same as SSL (use implicit TLS). The connection test
  // uses raw sockets with proper STLS, but for actual fetch the library
  // requires TLS from the start.
  const useTls = creds.security === 'SSL' || creds.security === 'STARTTLS';
  if (creds.security === 'STARTTLS') {
    logger.warn(`[POP3] STARTTLS requested for ${accountCode}, using implicit TLS instead (node-pop3 limitation)`);
  }

  const pop3 = new Pop3Command({
    user: creds.username,
    password: creds.password,
    host: creds.host,
    port: creds.port,
    tls: useTls,
    tlsOptions: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
      minVersion: 'TLSv1.2',
    },
    timeout: 30000,
  });

  const fetchedMails: InboxMail[] = [];

  try {
    await pop3.connect();
    logger.info(`[POP3] Connected to ${creds.host} for account ${accountCode}`);

    // Get list of message UIDs
    // POP3 UIDL response varies by server: can be array-of-arrays,
    // array-of-strings, raw multi-line string, or even an object.
    const uidListRaw: any = await pop3.UIDL();
    let uidList: Array<[string, string]> = []; // [msgNum, uidlValue]

    if (typeof uidListRaw === 'string') {
      // Raw multi-line: "1 abc123\r\n2 def456\r\n..."
      const lines = uidListRaw.split(/\r?\n/).filter((l: string) => l.trim());
      uidList = lines.map((line: string) => {
        const parts = line.trim().split(/\s+/);
        return [parts[0], parts[1] || parts[0]] as [string, string];
      });
    } else if (Array.isArray(uidListRaw)) {
      uidList = uidListRaw.map((item: any) => {
        if (Array.isArray(item)) {
          return [String(item[0]), String(item[1] ?? item[0])] as [string, string];
        }
        if (typeof item === 'string') {
          const parts = item.trim().split(/\s+/);
          return [parts[0], parts[1] || parts[0]] as [string, string];
        }
        return [String(item), String(item)] as [string, string];
      });
    } else if (uidListRaw && typeof uidListRaw === 'object') {
      // Object form: { '1': 'abc123', '2': 'def456' }
      uidList = Object.entries(uidListRaw).map(([k, v]) => [k, String(v)] as [string, string]);
    }

    const totalMessages = uidList.length;
    logger.info(`[POP3] Server has ${totalMessages} messages`);

    if (totalMessages === 0) {
      await pop3.QUIT();
      return { mails: [], totalOnServer: 0, fetched: 0 };
    }

    // POP3 doesn't support mailboxes or UIDs like IMAP —
    // paginate by taking the latest N messages (newest = highest msgNum)
    const startIdx = Math.max(0, totalMessages - page * limit);
    const endIdx = Math.max(0, totalMessages - (page - 1) * limit);
    const msgNums = uidList.slice(startIdx, endIdx).reverse();

    logger.info(`[POP3] Fetching messages ${startIdx + 1}–${endIdx} (${msgNums.length} mails)`);

    for (const [msgNum, uidStr] of msgNums) {
      try {
        // RETR returns the full message source as a string
        const rawMessage: string = await pop3.RETR(parseInt(msgNum, 10));
        if (!rawMessage) {
          logger.warn(`[POP3] Message ${msgNum} has no content, skipping`);
          continue;
        }

        const parsed = await simpleParser(rawMessage);

        const fromAddresses = extractAddresses(parsed.from);
        const toAddresses = extractAddresses(parsed.to);
        const ccAddresses = extractAddresses(parsed.cc);
        const bccAddresses = extractAddresses(parsed.bcc);

        const attachments = parsed.attachments?.map(att => ({
          filename: att.filename || 'attachment',
          contentType: att.contentType || 'application/octet-stream',
          size: att.size || 0,
        })) || [];

        fetchedMails.push({
          id: '',
          uid: pop3UidlToNumericUid(uidStr), // Stable hash of UIDL value
          accountCode,
          mailbox: 'INBOX', // POP3 only has one mailbox
          messageId: parsed.messageId || `pop3:${uidStr}`,  // fallback to UIDL if no Message-ID
          fromAddress: fromAddresses[0] || 'unknown@unknown.com',
          fromName: extractName(parsed.from),
          toAddresses,
          ccAddresses: ccAddresses.length > 0 ? ccAddresses : null,
          bccAddresses: bccAddresses.length > 0 ? bccAddresses : null,
          subject: parsed.subject || '(No Subject)',
          textBody: parsed.text || null,
          htmlBody: parsed.html || null,
          date: (parsed.date || new Date()).toISOString(),
          isRead: false, // POP3 has no read/unread flags
          isStarred: false,
          hasAttachments: attachments.length > 0,
          attachmentsMetadata: attachments.length > 0 ? attachments : null,
          labels: [],
        });
      } catch (parseErr) {
        logger.warn(`[POP3] Failed to parse message ${msgNum}:`, parseErr);
      }
    }

    await pop3.QUIT();
    logger.info(`[POP3] Fetched ${fetchedMails.length} mails`);

    // Sort by date descending
    fetchedMails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Tag mails so syncMailsToCache knows not to overwrite local flags
    for (const m of fetchedMails) {
      (m as any)._pop3 = true;
    }

    return {
      mails: fetchedMails,
      totalOnServer: totalMessages,
      fetched: fetchedMails.length,
    };
  } catch (error: any) {
    logger.error(`[POP3] Error fetching mails:`, error);

    try { await pop3.QUIT(); } catch {}

    if (error instanceof AppError) throw error;

    throw new AppError(
      `Failed to fetch emails via POP3: ${error.message}`,
      500,
      false,
      { details: error.message }
    );
  }
}

// ============================================================================
// IMAP: Fetch mails from mail server (internal)
// ============================================================================

async function fetchMailsViaImap(
  creds: ImapCredentials,
  accountCode: string,
  options: {
    mailbox: string;
    limit: number;
    sinceUid?: number;
    page: number;
  }
): Promise<FetchFromServerResult> {
  const { mailbox, limit, sinceUid, page } = options;
  const secure = creds.security === 'SSL';

  const imapConfig: any = {
    host: creds.host,
    port: creds.port,
    secure,
    auth: {
      user: creds.username,
      pass: creds.password,
    },
    logger: false,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
      minVersion: 'TLSv1.2',
    },
  };

  if (creds.security === 'STARTTLS') {
    imapConfig.secure = false;
    imapConfig.starttls = { required: true };
  }

  const client = new ImapFlow(imapConfig);
  const fetchedMails: InboxMail[] = [];

  try {
    await client.connect();
    logger.info(`[IMAP] Connected to ${creds.host} for account ${accountCode}`);

    const lock = await client.getMailboxLock(mailbox);
    try {
      const mb = client.mailbox;
      if (!mb || typeof mb === 'boolean') {
        throw new AppError('Could not open mailbox', 500, false);
      }

      const totalMessages = mb.exists || 0;
      logger.info(`[IMAP] Mailbox ${mailbox} has ${totalMessages} messages`);

      if (totalMessages === 0) {
        return { mails: [], totalOnServer: 0, fetched: 0 };
      }

      // Determine range to fetch
      let range: string;
      if (sinceUid && sinceUid > 0) {
        // Incremental sync: fetch all UIDs greater than sinceUid
        range = `${sinceUid + 1}:*`;
      } else {
        // Full paginated fetch: latest mails first
        // IMAP sequence numbers are 1-based, newest = highest
        const endSeq = Math.max(1, totalMessages - ((page - 1) * limit));
        const startSeq = Math.max(1, endSeq - limit + 1);
        range = `${startSeq}:${endSeq}`;
      }

      logger.info(`[IMAP] Fetching range ${range} (limit ${limit})`);

      // Fetch messages with envelope + source for full parsing
      for await (const msg of client.fetch(range, {
        envelope: true,
        source: true,
        flags: true,
        uid: true,
      })) {
        try {
          if (!msg.source || msg.source.length === 0) {
            logger.warn(`[IMAP] Message UID ${msg.uid} has no source data, skipping`);
            continue;
          }

          const parsed = await simpleParser(msg.source);

          const fromAddresses = extractAddresses(parsed.from);
          const toAddresses = extractAddresses(parsed.to);
          const ccAddresses = extractAddresses(parsed.cc);
          const bccAddresses = extractAddresses(parsed.bcc);

          const attachments = parsed.attachments?.map(att => ({
            filename: att.filename || 'attachment',
            contentType: att.contentType || 'application/octet-stream',
            size: att.size || 0,
          })) || [];

          const flags = msg.flags ? [...msg.flags] : [];

          fetchedMails.push({
            id: '', // Will be assigned by DB on insert
            uid: msg.uid,
            accountCode,
            mailbox,
            messageId: parsed.messageId || null,
            fromAddress: fromAddresses[0] || 'unknown@unknown.com',
            fromName: extractName(parsed.from),
            toAddresses,
            ccAddresses: ccAddresses.length > 0 ? ccAddresses : null,
            bccAddresses: bccAddresses.length > 0 ? bccAddresses : null,
            subject: parsed.subject || '(No Subject)',
            textBody: parsed.text || null,
            htmlBody: parsed.html || null,
            date: (parsed.date || new Date()).toISOString(),
            isRead: flags.includes('\\Seen'),
            isStarred: flags.includes('\\Flagged'),
            hasAttachments: attachments.length > 0,
            attachmentsMetadata: attachments.length > 0 ? attachments : null,
            labels: flags.filter(f => !f.startsWith('\\')),
          });
        } catch (parseErr) {
          logger.warn(`[IMAP] Failed to parse message UID ${msg.uid}:`, parseErr);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    logger.info(`[IMAP] Fetched ${fetchedMails.length} mails from ${mailbox}`);

    // Sort by date descending (newest first)
    fetchedMails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      mails: fetchedMails,
      totalOnServer: (client.mailbox && typeof client.mailbox !== 'boolean') ? client.mailbox.exists || 0 : fetchedMails.length,
      fetched: fetchedMails.length,
    };
  } catch (error: any) {
    logger.error(`[IMAP] Error fetching mails:`, error);

    if (client && client.usable) {
      try { await client.logout(); } catch {}
    }

    if (error instanceof AppError) throw error;

    throw new AppError(
      `Failed to fetch emails: ${error.message}`,
      500,
      false,
      { details: error.message }
    );
  }
}

// ============================================================================
// DB: Save/sync mails to inbox_cache
// ============================================================================

/**
 * Upsert fetched mails into the inbox_cache table.
 * Only keeps the latest N mails per account (configurable via user settings).
 */
export async function syncMailsToCache(
  userId: string,
  accountCode: string,
  mails: InboxMail[],
  cacheLimit: number = 15
): Promise<InboxMail[]> {
  if (mails.length === 0) return [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const savedMails: InboxMail[] = [];

    // Determine if this is a POP3 account (POP3 has no flags; preserve local read/starred)
    const isPop3 = mails.length > 0 && mails[0].mailbox === 'INBOX'
      && (mails[0] as any)._pop3 === true;

    for (const mail of mails) {
      // For IMAP: overwrite flags from server (they are authoritative).
      // For POP3: preserve locally-set is_read / is_starred (POP3 always sends false).
      const onConflictSet = isPop3
        ? `subject = EXCLUDED.subject,
           text_body = EXCLUDED.text_body,
           html_body = EXCLUDED.html_body,
           labels = EXCLUDED.labels,
           updated_at = NOW()`
        : `is_read = EXCLUDED.is_read,
           is_starred = EXCLUDED.is_starred,
           subject = EXCLUDED.subject,
           text_body = EXCLUDED.text_body,
           html_body = EXCLUDED.html_body,
           labels = EXCLUDED.labels,
           updated_at = NOW()`;

      const result = await client.query(
        `INSERT INTO inbox_cache (
          user_id, account_code, uid, message_id, mailbox,
          from_address, from_name, to_addresses, cc_addresses, bcc_addresses,
          subject, text_body, html_body, date,
          is_read, is_starred, has_attachments, attachments_metadata, labels,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, NOW())
        ON CONFLICT (user_id, account_code, mailbox, uid)
        DO UPDATE SET
          ${onConflictSet}
        RETURNING id`,
        [
          userId, accountCode, mail.uid, mail.messageId, mail.mailbox,
          mail.fromAddress, mail.fromName,
          JSON.stringify(mail.toAddresses),
          mail.ccAddresses ? JSON.stringify(mail.ccAddresses) : null,
          mail.bccAddresses ? JSON.stringify(mail.bccAddresses) : null,
          mail.subject, mail.textBody, mail.htmlBody, mail.date,
          mail.isRead, mail.isStarred, mail.hasAttachments,
          mail.attachmentsMetadata ? JSON.stringify(mail.attachmentsMetadata) : null,
          mail.labels ? JSON.stringify(mail.labels) : null,
        ]
      );

      savedMails.push({ ...mail, id: result.rows[0].id });
    }

    // Trim old mails: keep only the latest `cacheLimit` per account+mailbox
    await client.query(
      `DELETE FROM inbox_cache
       WHERE user_id = $1 AND account_code = $2 AND id NOT IN (
         SELECT id FROM inbox_cache
         WHERE user_id = $1 AND account_code = $2
         ORDER BY date DESC
         LIMIT $3
       )`,
      [userId, accountCode, cacheLimit]
    );

    await client.query('COMMIT');
    logger.info(`[InboxService] Synced ${savedMails.length} mails to cache, limit=${cacheLimit}`);

    return savedMails;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('[InboxService] Error syncing mails to cache:', error);
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// DB: Sync tracking — persist last UID per account+mailbox
// ============================================================================

/**
 * Get the last synced UID for a user + account + mailbox.
 * Returns 0 if no sync has been tracked yet.
 */
export async function getLastSyncedUid(
  userId: string,
  accountCode: string,
  mailbox: string = 'INBOX'
): Promise<number> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT last_uid FROM sync_tracking
       WHERE user_id = $1 AND account_code = $2 AND mailbox = $3`,
      [userId, accountCode, mailbox]
    );
    return result.rows.length > 0 ? result.rows[0].last_uid : 0;
  } finally {
    client.release();
  }
}

/**
 * Update (or insert) the sync tracking record after a successful sync.
 */
export async function updateSyncTracking(
  userId: string,
  accountCode: string,
  mailbox: string,
  lastUid: number,
  totalOnServer?: number
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO sync_tracking (user_id, account_code, mailbox, last_uid, total_on_server, last_synced_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (user_id, account_code, mailbox)
       DO UPDATE SET
         last_uid = GREATEST(sync_tracking.last_uid, EXCLUDED.last_uid),
         total_on_server = COALESCE(EXCLUDED.total_on_server, sync_tracking.total_on_server),
         last_synced_at = NOW(),
         updated_at = NOW()`,
      [userId, accountCode, mailbox, lastUid, totalOnServer ?? null]
    );
  } finally {
    client.release();
  }
}

// ============================================================================
// DB: Get cached mails from inbox_cache
// ============================================================================

/**
 * Get cached inbox mails from the server database.
 * Used when user logs in to quickly show recent mails before full sync.
 */
export async function getCachedMails(
  userId: string,
  accountCode?: string,
  mailbox: string = 'INBOX'
): Promise<InboxMail[]> {
  const client = await pool.connect();
  try {
    let query: string;
    let params: any[];

    if (accountCode) {
      query = `SELECT * FROM inbox_cache
               WHERE user_id = $1 AND account_code = $2 AND mailbox = $3
               ORDER BY date DESC`;
      params = [userId, accountCode, mailbox];
    } else {
      // Get mails from all accounts
      query = `SELECT * FROM inbox_cache
               WHERE user_id = $1 AND mailbox = $2
               ORDER BY date DESC`;
      params = [userId, mailbox];
    }

    const result = await client.query(query, params);
    return result.rows.map(mapRowToInboxMail);
  } finally {
    client.release();
  }
}

// ============================================================================
// DB: Get user setting
// ============================================================================

export async function getUserSetting(userId: string, key: string, defaultValue: string = ''): Promise<string> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT setting_value FROM user_settings WHERE user_id = $1 AND setting_key = $2`,
      [userId, key]
    );
    return result.rows.length > 0 ? result.rows[0].setting_value : defaultValue;
  } finally {
    client.release();
  }
}

export async function setUserSetting(userId: string, key: string, value: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO user_settings (user_id, setting_key, setting_value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, setting_key)
       DO UPDATE SET setting_value = $3, updated_at = NOW()`,
      [userId, key, value]
    );
  } finally {
    client.release();
  }
}

export async function getAllUserSettings(userId: string): Promise<Record<string, string>> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT setting_key, setting_value FROM user_settings WHERE user_id = $1`,
      [userId]
    );
    const settings: Record<string, string> = {};
    for (const row of result.rows) {
      settings[row.setting_key] = row.setting_value;
    }
    return settings;
  } finally {
    client.release();
  }
}

// ============================================================================
// Combined: Fetch from server → save to cache → return
// ============================================================================

/**
 * Search mails on the IMAP server using IMAP SEARCH.
 * Searches from, to, subject, and body within the given date range.
 * Results are NOT cached in the server DB — they are returned directly
 * for the client to store in local IndexedDB only.
 *
 * POP3 accounts don't support SEARCH — returns empty results.
 */
export interface ServerSearchResult {
  mails: InboxMail[];
  searched: number;       // how many UIDs matched
  dateRange: { since: string | null; before: string | null };
  protocol: string;       // 'IMAP' or 'POP3'
}

export async function searchMailsOnServer(
  userId: string,
  accountCode: string,
  query: string,
  options: {
    sinceMonths?: number;   // 6, 12, or 0 (= all time)
    mailbox?: string;
  } = {}
): Promise<ServerSearchResult> {
  const { sinceMonths = 6, mailbox = 'INBOX' } = options;

  const creds = await getImapCredentials(userId, accountCode);

  // POP3 doesn't support SEARCH
  if (creds.incomingType === 'POP3') {
    logger.info(`[Search] POP3 account ${accountCode} — server search not supported`);
    return {
      mails: [],
      searched: 0,
      dateRange: { since: null, before: null },
      protocol: 'POP3',
    };
  }

  const secure = creds.security === 'SSL';
  const imapConfig: any = {
    host: creds.host,
    port: creds.port,
    secure,
    auth: { user: creds.username, pass: creds.password },
    logger: false,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
      minVersion: 'TLSv1.2',
    },
  };
  if (creds.security === 'STARTTLS') {
    imapConfig.secure = false;
    imapConfig.starttls = { required: true };
  }

  const client = new ImapFlow(imapConfig);
  const fetchedMails: InboxMail[] = [];

  try {
    await client.connect();
    logger.info(`[Search] Connected to ${creds.host} for account ${accountCode}`);

    const lock = await client.getMailboxLock(mailbox);
    try {
      // Build SINCE date for the date-range filter
      let sinceDate: Date | undefined;
      if (sinceMonths > 0) {
        sinceDate = new Date();
        sinceDate.setMonth(sinceDate.getMonth() - sinceMonths);
        sinceDate.setHours(0, 0, 0, 0);
      }

      // IMAP SEARCH: search for the query across OR(FROM, TO, SUBJECT, TEXT).
      // ImapFlow's .search() accepts SearchObject with OR arrays.
      // We use TEXT (which covers headers + body) combined with the date range.
      const searchCriteria: any = {};

      if (sinceDate) {
        searchCriteria.since = sinceDate;
      }

      // TEXT searches headers and body for the keyword
      searchCriteria.text = query;

      logger.info(`[Search] Searching mailbox ${mailbox} — text="${query}", since=${sinceDate?.toISOString() ?? 'all time'}`);

      const matchedUidsRaw = await client.search(searchCriteria, { uid: true });
      const matchedUids = Array.isArray(matchedUidsRaw) ? matchedUidsRaw : [];

      logger.info(`[Search] Found ${matchedUids.length} matching UIDs`);

      if (matchedUids.length === 0) {
        return {
          mails: [],
          searched: 0,
          dateRange: {
            since: sinceDate?.toISOString() ?? null,
            before: null,
          },
          protocol: 'IMAP',
        };
      }

      // Cap fetch at 100 messages to avoid overloading
      const uidsToFetch = matchedUids.slice(0, 100);

      // Fetch matched messages
      for await (const msg of client.fetch(uidsToFetch, {
        envelope: true,
        source: true,
        flags: true,
        uid: true,
      }, { uid: true })) {
        try {
          if (!msg.source || msg.source.length === 0) continue;

          const parsed = await simpleParser(msg.source);

          const fromAddresses = extractAddresses(parsed.from);
          const toAddresses = extractAddresses(parsed.to);
          const ccAddresses = extractAddresses(parsed.cc);
          const bccAddresses = extractAddresses(parsed.bcc);

          const attachments = parsed.attachments?.map(att => ({
            filename: att.filename || 'attachment',
            contentType: att.contentType || 'application/octet-stream',
            size: att.size || 0,
          })) || [];

          const flags = msg.flags ? [...msg.flags] : [];

          fetchedMails.push({
            id: '',
            uid: msg.uid,
            accountCode,
            mailbox,
            messageId: parsed.messageId || null,
            fromAddress: fromAddresses[0] || 'unknown@unknown.com',
            fromName: extractName(parsed.from),
            toAddresses,
            ccAddresses: ccAddresses.length > 0 ? ccAddresses : null,
            bccAddresses: bccAddresses.length > 0 ? bccAddresses : null,
            subject: parsed.subject || '(No Subject)',
            textBody: parsed.text || null,
            htmlBody: parsed.html || null,
            date: (parsed.date || new Date()).toISOString(),
            isRead: flags.includes('\\Seen'),
            isStarred: flags.includes('\\Flagged'),
            hasAttachments: attachments.length > 0,
            attachmentsMetadata: attachments.length > 0 ? attachments : null,
            labels: flags.filter(f => !f.startsWith('\\')),
          });
        } catch (parseErr) {
          logger.warn(`[Search] Failed to parse message UID ${msg.uid}:`, parseErr);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    logger.info(`[Search] Fetched ${fetchedMails.length} search results from ${mailbox}`);

    // Sort by date descending
    fetchedMails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const sinceDate = sinceMonths > 0 ? new Date() : null;
    if (sinceDate) sinceDate.setMonth(sinceDate.getMonth() - sinceMonths);

    return {
      mails: fetchedMails,
      searched: fetchedMails.length,
      dateRange: {
        since: sinceDate?.toISOString() ?? null,
        before: null,
      },
      protocol: 'IMAP',
    };
  } catch (error: any) {
    logger.error(`[Search] Error searching mails:`, error);

    if (client && client.usable) {
      try { await client.logout(); } catch {}
    }

    if (error instanceof AppError) throw error;

    throw new AppError(
      `Failed to search emails: ${error.message}`,
      500,
      false,
      { details: error.message }
    );
  }
}

/**
 * Full inbox sync: fetch from IMAP server, save to cache, return mails.
 */
export async function syncInbox(
  userId: string,
  accountCode: string,
  options: {
    mailbox?: string;
    limit?: number;
    sinceUid?: number;
    page?: number;
    cacheLimit?: number;
  } = {}
): Promise<FetchFromServerResult & { cached: number }> {
  const mailbox = options.mailbox || 'INBOX';
  const cacheLimit = options.cacheLimit || parseInt(
    await getUserSetting(userId, 'inbox_cache_limit', '15'), 10
  );

  // If the client didn't send sinceUid, use the server-side tracked value
  let sinceUid = options.sinceUid;
  if (sinceUid === undefined || sinceUid === null) {
    sinceUid = await getLastSyncedUid(userId, accountCode, mailbox);
    if (sinceUid > 0) {
      logger.info(`[InboxService] Using server-side sinceUid=${sinceUid} for ${accountCode}/${mailbox}`);
    }
  }

  const result = await fetchMailsFromServer(userId, accountCode, {
    mailbox,
    limit: options.limit,
    sinceUid: sinceUid > 0 ? sinceUid : undefined,
    page: options.page,
  });

  // Save to server-side cache
  const saved = await syncMailsToCache(userId, accountCode, result.mails, cacheLimit);

  // Persist the highest UID we just synced
  if (result.mails.length > 0) {
    const highestUid = Math.max(...result.mails.map(m => m.uid));
    await updateSyncTracking(userId, accountCode, mailbox, highestUid, result.totalOnServer);
    logger.info(`[InboxService] Updated sync tracking: ${accountCode}/${mailbox} lastUid=${highestUid}`);
  }

  return {
    ...result,
    mails: saved.length > 0 ? saved : result.mails,
    cached: saved.length,
  };
}

/**
 * Get the primary account code for a user (or the first active account).
 */
export async function getPrimaryAccountCode(userId: string): Promise<string | null> {
  const accounts = await getAllEmailAccounts(userId);
  if (accounts.length === 0) return null;
  const primary = accounts.find(a => a.isPrimary);
  return primary ? primary.accountCode : accounts[0].accountCode;
}

/**
 * Get all active email account codes for a user.
 */
export async function getAccountList(userId: string): Promise<Array<{ accountCode: string; email: string; isPrimary: boolean }>> {
  return getAllEmailAccounts(userId);
}

// ============================================================================
// Helper: Map DB row to InboxMail
// ============================================================================

function mapRowToInboxMail(row: any): InboxMail {
  return {
    id: row.id,
    uid: row.uid,
    accountCode: row.account_code,
    mailbox: row.mailbox,
    messageId: row.message_id || null,
    fromAddress: row.from_address,
    fromName: row.from_name || null,
    toAddresses: row.to_addresses || [],
    ccAddresses: row.cc_addresses || null,
    bccAddresses: row.bcc_addresses || null,
    subject: row.subject || '(No Subject)',
    textBody: row.text_body || null,
    htmlBody: row.html_body || null,
    date: row.date ? new Date(row.date).toISOString() : new Date().toISOString(),
    isRead: row.is_read || false,
    isStarred: row.is_starred || false,
    hasAttachments: row.has_attachments || false,
    attachmentsMetadata: row.attachments_metadata || null,
    labels: row.labels || null,
  };
}
