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
  addOrUpdateSentMails
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

export interface FetchAllResult {
  emailAccounts: FetchResult<EmailAccountsResult>;
  sentMails: FetchResult<SentMailsResult>;
  inbox: FetchResult<InboxResult>;
  draftsCount: number;
}

export interface FetchProgress {
  step: 'emailAccounts' | 'sentMails' | 'inbox' | 'complete';
  message: string;
}

// ============================================================================
// Individual Fetch Functions
// ============================================================================

/**
 * Fetch email accounts (IMAP/POP3) and SMTP accounts from the API.
 * Updates localStorage with the fetched data.
 */
export async function fetchEmailAccounts(): Promise<FetchResult<EmailAccountsResult>> {
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
 * Fetch inbox mails from the API.
 * Note: This uses the mail/fetch endpoint which may require mailbox parameter.
 */
export async function fetchInboxMails(
  mailbox: string = 'INBOX'
): Promise<FetchResult<InboxResult>> {
  try {
    console.log(`🔄 Fetching inbox mails (${mailbox})...`);
    const response = await apiFetch(`/api/mail/fetch?mailbox=${encodeURIComponent(mailbox)}`);
    
    if (response.success && response.data) {
      console.log('✅ Inbox mails fetched successfully:', { 
        count: response.data.mails?.length || 0 
      });
      
      return {
        success: true,
        data: {
          mails: response.data.mails || [],
          total: response.data.total || response.data.mails?.length || 0
        }
      };
    }
    
    // Handle case where response itself contains mails directly
    if (response.mails) {
      return {
        success: true,
        data: {
          mails: response.mails,
          total: response.total || response.mails.length
        }
      };
    }
    
    return {
      success: false,
      error: 'Invalid response format'
    };
  } catch (error: any) {
    console.error('❌ Failed to fetch inbox mails:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch inbox mails'
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
 * Fetch all data: email accounts, inbox, and sent mails.
 * Executes requests sequentially with progress callbacks.
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
    invalidateCache?: boolean;
  } = {}
): Promise<FetchAllResult> {
  const { 
    fetchAccounts = true, 
    fetchInbox = true, 
    fetchSent = true,
    invalidateCache = true 
  } = options;
  
  // Initialize results
  const results: FetchAllResult = {
    emailAccounts: { success: false },
    sentMails: { success: false },
    inbox: { success: false },
    draftsCount: 0
  };
  
  // Invalidate caches if requested - clear sent mails from Dexie
  if (invalidateCache) {
    await clearSentMails();
  }
  
  try {
    // Step 1: Fetch email accounts
    if (fetchAccounts) {
      onProgress?.({ step: 'emailAccounts', message: 'Syncing email accounts...' });
      results.emailAccounts = await fetchEmailAccounts();
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Step 2: Fetch inbox mails
    if (fetchInbox) {
      onProgress?.({ step: 'inbox', message: 'Fetching inbox...' });
      results.inbox = await fetchInboxMails();
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Step 3: Fetch sent mails
    if (fetchSent) {
      onProgress?.({ step: 'sentMails', message: 'Fetching sent mails...' });
      results.sentMails = await fetchSentMails();
    }
    
    // Step 4: Get drafts count (local only, fast)
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
