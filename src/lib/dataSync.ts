/**
 * Data Synchronization Library
 * 
 * Provides centralized functions for fetching and syncing data across the application.
 * Used by Dashboard and other components to refresh data from APIs.
 */

import { apiFetch } from './apiFetch';
import { 
  getDraftsCount as getDraftCountFromDb,
  clearSentMails,
  addOrUpdateSentMails,
  upsertInboxMails,
  trimInboxToLimit,
  type InboxMailRecord,
} from './db';

// ============================================================================
// Types
// ============================================================================

export interface EmailAccount {
  id: string;
  email: string;
  accountCode: string;
  isPrimary: boolean;
  incomingType: 'IMAP' | 'POP3';
  incomingHost: string;
  incomingPort: number;
  incomingUsername?: string;
  incomingSecurity: 'SSL' | 'STARTTLS' | 'NONE';
  outgoingHost: string;
  outgoingPort: number;
  outgoingUsername?: string;
  outgoingSecurity: 'SSL' | 'STARTTLS' | 'NONE';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SmtpAccount {
  id: string;
  email: string;
  accountCode: string;
  host: string;
  port: number;
  security: 'SSL' | 'TLS' | 'STARTTLS' | 'PLAIN' | 'NONE';
  username: string;
  createdAt: string;
  updatedAt: string;
}

export interface SentMail {
  id: string;
  threadId: string;
  fromEmail: string;
  toEmails: string[];
  subject: string;
  textBody: string | null;
  sentAt: string;
  status: 'pending' | 'sent' | 'failed';
}

export interface FetchResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface EmailAccountsResult {
  emailAccounts: EmailAccount[];
  smtpAccounts: SmtpAccount[];
}

export interface SentMailsResult {
  mails: SentMail[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface InboxResult {
  mails: any[];
  total: number;
}

export interface SettingsResult {
  inboxCacheLimit: number;
}

export interface FetchAllResult {
  emailAccounts: FetchResult<EmailAccountsResult>;
  sentMails: FetchResult<SentMailsResult>;
  inbox: FetchResult<InboxResult>;
  settings: FetchResult<SettingsResult>;
  draftsCount: number;
}

export interface FetchProgress {
  step: 'emailAccounts' | 'sentMails' | 'inbox' | 'settings' | 'complete';
  message: string;
}

// ============================================================================
// Auth Guard
// ============================================================================

/**
 * Quick check: is there a logged-in user?
 * We read `localStorage.authUser` to stay decoupled from React contexts.
 * This prevents queued / in-flight API calls from firing after logout.
 */
function isUserLoggedIn(): boolean {
  return !!localStorage.getItem('authUser');
}

// ============================================================================
// Individual Fetch Functions
// ============================================================================

/**
 * Fetch email accounts (IMAP/POP3) and SMTP accounts from the API.
 * Updates localStorage with the fetched data.
 */
export async function fetchEmailAccounts(): Promise<FetchResult<EmailAccountsResult>> {
  if (!isUserLoggedIn()) return { success: false, error: 'Not authenticated' };
  try {
    console.log('🔄 Fetching email accounts from API...');
    const response = await apiFetch('/api/email-accounts', {
      method: 'GET',
    });
    
    // Handle different response formats
    const emailAccounts = Array.isArray(response) 
      ? response 
      : (response.emailAccounts || []);
    const smtpAccounts = Array.isArray(response) 
      ? [] 
      : (response.smtpAccounts || []);
    
    // Save to localStorage
    localStorage.setItem('emailAccounts', JSON.stringify(emailAccounts));
    localStorage.setItem('smtpAccounts', JSON.stringify(smtpAccounts));
    
    console.log('✅ Email accounts fetched successfully:', { 
      emailCount: emailAccounts.length, 
      smtpCount: smtpAccounts.length 
    });
    
    return {
      success: true,
      data: { emailAccounts, smtpAccounts }
    };
  } catch (error: any) {
    console.error('❌ Failed to fetch email accounts:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch email accounts'
    };
  }
}

/**
 * Fetch sent mails from the API with pagination.
 * Updates the sent mails cache in Dexie.
 */
export async function fetchSentMails(
  page: number = 1, 
  limit: number = 20
): Promise<FetchResult<SentMailsResult>> {
  if (!isUserLoggedIn()) return { success: false, error: 'Not authenticated' };
  try {
    console.log(`🔄 Fetching sent mails (page ${page})...`);
    const response = await apiFetch(`/api/sent-mails?page=${page}&limit=${limit}`);
    
    if (response.success && response.data) {
      const data: SentMailsResult = response.data;
      
      // Cache the data in Dexie
      if (data.mails && data.mails.length > 0) {
        const sentMailRecords = data.mails.map(mail => ({
          id: mail.id,
          threadId: mail.threadId,
          fromEmail: mail.fromEmail,
          toEmails: mail.toEmails,
          cc: null,
          bcc: null,
          subject: mail.subject,
          htmlBody: null,
          textBody: mail.textBody,
          attachmentsMetadata: null,
          messageId: null,
          status: mail.status,
          sentAt: mail.sentAt,
          createdAt: mail.sentAt,
          syncedAt: new Date().toISOString()
        }));
        await addOrUpdateSentMails(sentMailRecords);
      }
      
      console.log('✅ Sent mails fetched successfully:', { 
        count: data.mails.length, 
        total: data.total 
      });
      
      return {
        success: true,
        data
      };
    }
    
    return {
      success: false,
      error: 'Invalid response format'
    };
  } catch (error: any) {
    console.error('❌ Failed to fetch sent mails:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch sent mails'
    };
  }
}

/**
 * Fetch inbox mails from the API using the new inbox sync endpoint.
 * Gets cached mails from server, then saves to local encrypted Dexie.
 */
export async function fetchInboxMails(
  _mailbox: string = 'INBOX'
): Promise<FetchResult<InboxResult>> {
  if (!isUserLoggedIn()) return { success: false, error: 'Not authenticated' };
  try {
    console.log('🔄 Fetching cached inbox mails from server...');

    // Step 1: Get the list of email accounts
    const emailAccountsStr = localStorage.getItem('emailAccounts');
    if (!emailAccountsStr) {
      console.log('ℹ️ No email accounts configured, skipping inbox fetch.');
      return { success: true, data: { mails: [], total: 0 } };
    }

    const accounts: Array<{ accountCode: string }> = JSON.parse(emailAccountsStr);
    let allMails: any[] = [];

    // Step 2: For each account, get cached mails from server DB
    for (const acc of accounts) {
      try {
        const res = await apiFetch(
          `/api/inbox/cached?accountCode=${encodeURIComponent(acc.accountCode)}`
        );
        const mails = res?.data?.mails || res?.mails || [];
        if (mails.length) {
          allMails = allMails.concat(mails);
        }
      } catch (err) {
        console.warn(`⚠️ Failed to fetch cached mails for ${acc.accountCode}:`, err);
      }
    }

    // Step 3: Save to local Dexie (encrypted)
    if (allMails.length > 0) {
      const records: InboxMailRecord[] = allMails.map((m: any) => ({
        id: String(m.id ?? `${m.account_code || m.accountCode || m.accountId}:${m.uid}`),
        uid: m.uid,
        accountId: m.account_code || m.accountCode || m.accountId || '',
        mailbox: m.mailbox || 'INBOX',
        messageId: m.message_id || m.messageId,
        fromAddress: m.from_address || m.fromAddress || '',
        fromName: m.from_name || m.fromName || '',
        toAddresses: Array.isArray(m.to_addresses || m.toAddresses)
          ? (m.to_addresses || m.toAddresses)
          : [m.to_addresses || m.toAddresses || ''],
        ccAddresses: Array.isArray(m.cc_addresses || m.ccAddresses)
          ? (m.cc_addresses || m.ccAddresses)
          : [],
        bccAddresses: [],
        subject: m.subject || '(No Subject)',
        htmlBody: m.html_body || m.htmlBody || null,
        textBody: m.text_body || m.textBody || null,
        date: m.date || new Date().toISOString(),
        isRead: m.is_read ?? m.isRead ?? false,
        isStarred: m.is_starred ?? m.isStarred ?? false,
        hasAttachments: m.has_attachments ?? m.hasAttachments ?? false,
        attachmentsMetadata: m.attachments_metadata || m.attachmentsMetadata || null,
        labels: m.labels || [],
        syncedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdAt: m.created_at || m.createdAt || m.date || new Date().toISOString(),
      }));
      await upsertInboxMails(records);
      console.log(`✅ Saved ${records.length} cached inbox mails to Dexie.`);

      // Enforce local cache limit per account
      const cacheLimit = parseInt(localStorage.getItem('inbox_cache_limit') || '15', 10);
      const uniqueAccounts = [...new Set(records.map(r => r.accountId))];
      for (const accId of uniqueAccounts) {
        await trimInboxToLimit(accId, cacheLimit);
      }
    }

    return {
      success: true,
      data: {
        mails: allMails,
        total: allMails.length,
      },
    };
  } catch (error: any) {
    console.error('❌ Failed to fetch inbox mails:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch inbox mails',
    };
  }
}

/**
 * Get the count of locally saved drafts from Dexie IndexedDB.
 */
export async function fetchDraftsCount(): Promise<number> {
  try {
    const count = await getDraftCountFromDb();
    return count;
  } catch (error) {
    console.error('Error getting drafts count:', error);
    return 0;
  }
}

// ============================================================================
// Combined Fetch Functions
// ============================================================================

/**
 * Fetch all mails (inbox + sent).
 * Returns combined results from both endpoints.
 */
export async function fetchAllMails(
  onProgress?: (progress: FetchProgress) => void
): Promise<{ inbox: FetchResult<InboxResult>; sentMails: FetchResult<SentMailsResult> }> {
  // Fetch inbox first
  onProgress?.({ step: 'inbox', message: 'Fetching inbox...' });
  const inbox = await fetchInboxMails();
  
  // Small delay between requests to avoid overwhelming the server
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Fetch sent mails
  onProgress?.({ step: 'sentMails', message: 'Fetching sent mails...' });
  const sentMails = await fetchSentMails();
  
  onProgress?.({ step: 'complete', message: 'Mail sync complete' });
  
  return { inbox, sentMails };
}

/**
 * Fetch inbox settings (cache limit) from the API.
 * Updates localStorage with the fetched limit.
 */
export async function fetchInboxSettings(): Promise<FetchResult<SettingsResult>> {
  if (!isUserLoggedIn()) return { success: false, error: 'Not authenticated' };
  try {
    console.log('🔄 Fetching inbox settings...');
    const res = await apiFetch('/api/inbox/settings');
    const limit = res?.data?.inboxCacheLimit ?? res?.inboxCacheLimit ?? 15;
    localStorage.setItem('inbox_cache_limit', String(limit));
    console.log('✅ Inbox settings fetched: cacheLimit =', limit);
    return { success: true, data: { inboxCacheLimit: limit } };
  } catch (error: any) {
    console.error('❌ Failed to fetch inbox settings:', error);
    return { success: false, error: error.message || 'Failed to fetch inbox settings' };
  }
}

/**
 * Fetch all data: email accounts, inbox, sent mails, and settings.
 * Accounts are fetched first (inbox depends on them), then inbox, sent,
 * and settings are fetched in parallel for speed.
 *
 * @param onProgress - Optional callback to report progress
 * @param options - Options to control which data to fetch
 */
export async function fetchAll(
  onProgress?: (progress: FetchProgress) => void,
  options: {
    fetchAccounts?: boolean;
    fetchInbox?: boolean;
    fetchSent?: boolean;
    fetchSettings?: boolean;
    invalidateCache?: boolean;
  } = {}
): Promise<FetchAllResult> {
  const {
    fetchAccounts = true,
    fetchInbox = true,
    fetchSent = true,
    fetchSettings = true,
    invalidateCache = true
  } = options;

  // Initialize results
  const results: FetchAllResult = {
    emailAccounts: { success: false },
    sentMails: { success: false },
    inbox: { success: false },
    settings: { success: false },
    draftsCount: 0
  };

  // Bail out early if user logged out before or during this call
  if (!isUserLoggedIn()) {
    return results;
  }

  // Invalidate caches if requested - clear sent mails from Dexie
  if (invalidateCache) {
    await clearSentMails();
  }

  try {
    // Step 1: Fetch email accounts first (inbox fetch depends on accounts in localStorage)
    if (fetchAccounts) {
      onProgress?.({ step: 'emailAccounts', message: 'Syncing email accounts...' });
      results.emailAccounts = await fetchEmailAccounts();
    }

    // Step 2: Fetch inbox, sent, and settings in parallel
    const parallelTasks: Promise<void>[] = [];

    if (fetchInbox) {
      onProgress?.({ step: 'inbox', message: 'Fetching inbox...' });
      parallelTasks.push(
        fetchInboxMails().then(r => { results.inbox = r; })
      );
    }

    if (fetchSent) {
      onProgress?.({ step: 'sentMails', message: 'Fetching sent mails...' });
      parallelTasks.push(
        fetchSentMails().then(r => { results.sentMails = r; })
      );
    }

    if (fetchSettings) {
      onProgress?.({ step: 'settings', message: 'Fetching settings...' });
      parallelTasks.push(
        fetchInboxSettings().then(r => { results.settings = r; })
      );
    }

    // Wait for all parallel fetches
    await Promise.allSettled(parallelTasks);

    // Step 3: Get drafts count (local only, fast)
    results.draftsCount = await fetchDraftsCount();

    onProgress?.({ step: 'complete', message: 'Sync complete!' });

    return results;

  } catch (error: any) {
    console.error('Error in fetchAll:', error);
    onProgress?.({ step: 'complete', message: 'Sync failed' });
    return results;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get cached email accounts from localStorage.
 */
export function getCachedEmailAccounts(): EmailAccountsResult {
  try {
    const emailAccountsStr = localStorage.getItem('emailAccounts');
    const smtpAccountsStr = localStorage.getItem('smtpAccounts');
    
    return {
      emailAccounts: emailAccountsStr ? JSON.parse(emailAccountsStr) : [],
      smtpAccounts: smtpAccountsStr ? JSON.parse(smtpAccountsStr) : []
    };
  } catch (error) {
    console.error('Error reading cached email accounts:', error);
    return { emailAccounts: [], smtpAccounts: [] };
  }
}

/**
 * Check if user has any email accounts configured.
 */
export function hasEmailAccounts(): boolean {
  const { emailAccounts, smtpAccounts } = getCachedEmailAccounts();
  return emailAccounts.length > 0 || smtpAccounts.length > 0;
}

/**
 * Get the primary email account or the first available one.
 */
export function getPrimaryEmailAccount(): EmailAccount | null {
  const { emailAccounts } = getCachedEmailAccounts();
  if (emailAccounts.length === 0) return null;
  
  const primary = emailAccounts.find(acc => acc.isPrimary);
  return primary || emailAccounts[0];
}
