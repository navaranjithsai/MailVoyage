import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { toast } from '@/lib/toast';
import { AuthContext } from './AuthContext';
import {
  getAllInboxMails,
  getUnreadCount,
  updateMailReadStatus,
  updateMailStarredStatus,
  deleteInboxMails,
  archiveInboxMail,
  cleanupNumericKeyedMails,
  type InboxMailRecord,
} from '@/lib/db';

// Email interface used by all UI components
export interface Email {
  id: string;
  sender: string;       // fromName or fromAddress
  senderName?: string;
  senderEmail: string;   // fromAddress
  recipient?: string;
  subject: string;
  preview: string;       // first 150 chars of textBody
  content?: string;      // htmlBody or textBody
  time: string;          // formatted date string
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  attachments?: Array<{
    id: string;
    name: string;
    size: string;
    type: string;
  }>;
  isImportant: boolean;
  timestamp: Date;
  priority?: 'high' | 'normal' | 'low';
  folder?: string;
  accountId?: string;
}

// Navigation item interface for sidebar/flowbar
export interface NavigationItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  badge?: number;
}

interface EmailContextType {
  emails: Email[];
  unreadCount: number;
  markAsRead: (emailId: string) => void;
  markAsUnread: (emailId: string) => void;
  toggleEmailRead: (emailId: string) => void;
  deleteEmail: (emailId: string) => void;
  archiveEmail: (emailId: string) => void;
  starEmail: (emailId: string) => void;
  unstarEmail: (emailId: string) => void;
  toggleEmailStarred: (emailId: string) => void;
  addEmail: (email: Omit<Email, 'id' | 'timestamp'>) => void;
  refreshEmails: () => Promise<void>;
  showUnreadBadge: boolean;
  setShowUnreadBadge: (show: boolean) => void;
  isLoading: boolean;
}

const EmailContext = createContext<EmailContextType | undefined>(undefined);

// ── Helpers ──────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').trim();
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Convert an InboxMailRecord (from Dexie) to the Email interface consumed by components. */
export function inboxRecordToEmail(record: InboxMailRecord): Email {
  const preview = record.textBody
    ? record.textBody.substring(0, 150)
    : record.htmlBody
      ? stripHtml(record.htmlBody).substring(0, 150)
      : '(No content)';

  const date = new Date(record.date);

  return {
    id: String(record.id),
    sender: record.fromName || record.fromAddress,
    senderName: record.fromName || undefined,
    senderEmail: record.fromAddress,
    recipient: record.toAddresses?.length ? record.toAddresses.join(', ') : undefined,
    subject: record.subject || '(No Subject)',
    preview,
    content: record.htmlBody || record.textBody || undefined,
    time: formatTimeAgo(date),
    isRead: record.isRead,
    isStarred: record.isStarred,
    hasAttachments: record.hasAttachments,
    attachments: record.attachmentsMetadata?.map((a, idx) => ({
      id: `att-${idx}`,
      name: a.filename,
      size: formatSize(a.size),
      type: a.contentType,
    })),
    isImportant: record.isStarred,
    timestamp: date,
    priority: 'normal',
    folder: record.mailbox,
    accountId: record.accountId,
  };
}

// ── Provider ─────────────────────────────────────────────────────────────

export const EmailProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Consume AuthContext directly (not useAuth hook) to avoid circular issues during HMR
  const authContext = useContext(AuthContext);
  const isAuthenticated = authContext?.isAuthenticated ?? false;
  const prevAuthRef = useRef(isAuthenticated);

  const [emails, setEmails] = useState<Email[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showUnreadBadge, setShowUnreadBadge] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedPref = localStorage.getItem('showUnreadBadge');
      return savedPref === null ? true : savedPref === 'true';
    }
    return true;
  });

  /** Load all inbox mails from Dexie (decrypted) and update state. */
  const loadEmails = useCallback(async () => {
    // Never touch Dexie if not authenticated
    if (!isAuthenticated) return;
    try {
      // One-time cleanup: remove numeric-keyed duplicates from a previous bug
      await cleanupNumericKeyedMails();
      const records = await getAllInboxMails();

      // Deduplicate by stringified id to prevent React duplicate-key errors.
      // IndexedDB treats numeric key 21 and string key "21" as distinct entries;
      // both can survive if deleteDatabase was blocked on logout or a stale code
      // path wrote numeric keys.  Keep only the first (most-recently-dated) record
      // for each stringified id.
      const seen = new Set<string>();
      const uniqueRecords: typeof records = [];
      for (const r of records) {
        const key = String(r.id);
        if (!seen.has(key)) {
          seen.add(key);
          uniqueRecords.push(r);
        }
      }
      if (uniqueRecords.length < records.length) {
        console.warn(
          `[EmailContext] Deduplicated ${records.length - uniqueRecords.length} inbox records ` +
          `(numeric/string key collision)`
        );
      }

      setEmails(uniqueRecords.map(inboxRecordToEmail));
      const count = await getUnreadCount();
      setUnreadCount(count);
    } catch (err) {
      console.error('[EmailContext] Failed to load emails from Dexie:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // React to auth changes: load on login, clear on logout
  useEffect(() => {
    if (isAuthenticated && !prevAuthRef.current) {
      // Just logged in → load emails from Dexie
      setIsLoading(true);
      loadEmails();
    } else if (!isAuthenticated && prevAuthRef.current) {
      // Just logged out → clear in-memory state immediately (Dexie already wiped by AuthContext)
      setEmails([]);
      setUnreadCount(0);
      setIsLoading(false);
    } else if (isAuthenticated) {
      // Already authenticated on mount (e.g. page refresh with valid session)
      setIsLoading(true);
      loadEmails();
    }
    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated, loadEmails]);

  // Listen for badge preference changes
  useEffect(() => {
    const handleStorageChange = () => {
      const savedPref = localStorage.getItem('showUnreadBadge');
      setShowUnreadBadge(savedPref === null ? true : savedPref === 'true');
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const markAsRead = useCallback(async (emailId: string) => {
    if (!isAuthenticated) return;
    await updateMailReadStatus(emailId, true);
    setEmails(prev => prev.map(e => e.id === emailId ? { ...e, isRead: true } : e));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, [isAuthenticated]);

  const markAsUnread = useCallback(async (emailId: string) => {
    if (!isAuthenticated) return;
    await updateMailReadStatus(emailId, false);
    setEmails(prev => prev.map(e => e.id === emailId ? { ...e, isRead: false } : e));
    setUnreadCount(prev => prev + 1);
  }, [isAuthenticated]);

  const toggleEmailRead = useCallback(async (emailId: string) => {
    const email = emails.find(e => e.id === emailId);
    if (!email) return;
    email.isRead ? await markAsUnread(emailId) : await markAsRead(emailId);
  }, [emails, markAsRead, markAsUnread]);

  const deleteEmail = useCallback(async (emailId: string) => {
    if (!isAuthenticated) return;
    const email = emails.find(e => e.id === emailId);
    await deleteInboxMails([emailId]);
    setEmails(prev => prev.filter(e => e.id !== emailId));
    if (email && !email.isRead) setUnreadCount(prev => Math.max(0, prev - 1));
    toast.success('Email deleted');
  }, [isAuthenticated, emails]);

  const archiveEmail = useCallback(async (emailId: string) => {
    if (!isAuthenticated) return;
    await archiveInboxMail(emailId);
    setEmails(prev => prev.filter(e => e.id !== emailId));
    toast.success('Email archived');
  }, [isAuthenticated]);

  const starEmail = useCallback(async (emailId: string) => {
    if (!isAuthenticated) return;
    await updateMailStarredStatus(emailId, true);
    setEmails(prev => prev.map(e => e.id === emailId ? { ...e, isStarred: true, isImportant: true } : e));
  }, [isAuthenticated]);

  const unstarEmail = useCallback(async (emailId: string) => {
    if (!isAuthenticated) return;
    await updateMailStarredStatus(emailId, false);
    setEmails(prev => prev.map(e => e.id === emailId ? { ...e, isStarred: false, isImportant: false } : e));
  }, [isAuthenticated]);

  const toggleEmailStarred = useCallback(async (emailId: string) => {
    const email = emails.find(e => e.id === emailId);
    if (!email) return;
    email.isStarred ? await unstarEmail(emailId) : await starEmail(emailId);
  }, [emails, starEmail, unstarEmail]);

  const addEmail = useCallback((emailData: Omit<Email, 'id' | 'timestamp'>) => {
    const newEmail: Email = { ...emailData, id: Date.now().toString(), timestamp: new Date() };
    setEmails(prev => [newEmail, ...prev]);
    if (!newEmail.isRead) setUnreadCount(prev => prev + 1);
    toast.info(`New email from ${newEmail.sender}: ${newEmail.subject}`, {
      position: 'top-right',
      autoClose: 5000,
    });
  }, []);

  const refreshEmails = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    await loadEmails();
  }, [isAuthenticated, loadEmails]);

  const contextValue: EmailContextType = {
    emails,
    unreadCount,
    markAsRead,
    markAsUnread,
    toggleEmailRead,
    deleteEmail,
    archiveEmail,
    starEmail,
    unstarEmail,
    toggleEmailStarred,
    addEmail,
    refreshEmails,
    showUnreadBadge,
    setShowUnreadBadge,
    isLoading,
  };

  return (
    <EmailContext.Provider value={contextValue}>
      {children}
    </EmailContext.Provider>
  );
};

export const useEmail = (): EmailContextType => {
  const context = useContext(EmailContext);
  if (context === undefined) {
    throw new Error('useEmail must be used within an EmailProvider');
  }
  return context;
};
