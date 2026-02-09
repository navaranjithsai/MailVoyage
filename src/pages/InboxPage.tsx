import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, easeOut, AnimatePresence } from 'framer-motion';
import {
  Search,
  Filter,
  Star,
  Paperclip,
  Trash2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Mail,
  Inbox,
  AlertCircle,
  ChevronDown,
  X,
  Loader2,
  Download,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import {
  getInboxMailsPaginated,
  searchInboxMails,
  deleteInboxMails,
  updateMailReadStatus,
  updateMailStarredStatus,
  upsertInboxMails,
  trimInboxToLimit,
  type InboxMailRecord,
} from '@/lib/db';
import { useEmail } from '@/contexts/EmailContext';
import { apiFetch } from '@/lib/apiFetch';
import { toast } from '@/lib/toast';
import { isMobileTabletWidth } from '@/lib/navigation';

// ── Types ────────────────────────────────────────────────────────────────

interface EmailAccount {
  id: string;
  email: string;
  accountCode: string;
  isPrimary?: boolean;
  incomingType?: 'IMAP' | 'POP3';
}

type FilterMode = 'all' | 'unread' | 'read' | 'starred' | 'attachments';

// ── Component ────────────────────────────────────────────────────────────

const InboxPage: React.FC = () => {
  const navigate = useNavigate();
  const { refreshEmails, toggleEmailStarred } = useEmail();
  const isMobile = isMobileTabletWidth();

  // Data
  const [mails, setMails] = useState<InboxMailRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [cacheLimitRaw, setCacheLimitRaw] = useState(
    () => parseInt(localStorage.getItem('inbox_cache_limit') || '15', 10)
  );
  const limit = useMemo(() => Math.max(5, cacheLimitRaw), [cacheLimitRaw]);

  // Accounts
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<EmailAccount | null>(null);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<InboxMailRecord[] | null>(null);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Selection & delete
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mailToDelete, setMailToDelete] = useState<InboxMailRecord | null>(null);

  // Server-side search (progressive depth: 0=local only, 1=6mo, 2=12mo, 3=all)
  const [serverSearchDepth, setServerSearchDepth] = useState(0);
  const [isServerSearching, setIsServerSearching] = useState(false);
  const [serverSearchInfo, setServerSearchInfo] = useState<string | null>(null);

  // Mobile infinite scroll
  const [mobileMails, setMobileMails] = useState<InboxMailRecord[]>([]);
  const [mobileHasMore, setMobileHasMore] = useState(true);
  const [mobileLoadingMore, setMobileLoadingMore] = useState(false);
  const mobilePageRef = useRef(1);
  const scrollSentinelRef = useRef<HTMLDivElement>(null);

  // Scroll position restoration flag
  const pendingScrollRestore = useRef<number | null>(null);
  // Track whether initial mount has restored state
  const didRestoreState = useRef(false);

  // ── Session-state persistence helpers ────────────────────────────────

  const INBOX_STATE_KEY = 'inbox_page_state';

  const savePageState = useCallback(() => {
    if (!selectedAccount) return;
    const state = {
      accountCode: selectedAccount.accountCode,
      currentPage,
      filterMode,
      searchQuery,
      showSearchBar,
      scrollY: window.scrollY,
    };
    sessionStorage.setItem(INBOX_STATE_KEY, JSON.stringify(state));
  }, [selectedAccount, currentPage, filterMode, searchQuery, showSearchBar]);

  // ── Load accounts ────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const emailAccountsStr = localStorage.getItem('emailAccounts');
      if (emailAccountsStr) {
        const parsed: EmailAccount[] = JSON.parse(emailAccountsStr);
        setAccounts(parsed);

        // Try to restore previously-selected account from sessionStorage
        let restored = false;
        const savedRaw = sessionStorage.getItem(INBOX_STATE_KEY);
        if (savedRaw) {
          try {
            const saved = JSON.parse(savedRaw);
            const match = parsed.find(a => a.accountCode === saved.accountCode);
            if (match) {
              setSelectedAccount(match);
              setCurrentPage(saved.currentPage ?? 1);
              setFilterMode(saved.filterMode ?? 'all');
              setSearchQuery(saved.searchQuery ?? '');
              setShowSearchBar(saved.showSearchBar ?? false);
              if (typeof saved.scrollY === 'number') {
                pendingScrollRestore.current = saved.scrollY;
              }
              restored = true;
              didRestoreState.current = true;
            }
          } catch { /* ignore corrupt data */ }
        }

        if (!restored) {
          const primary = parsed.find(a => a.isPrimary) || parsed[0] || null;
          setSelectedAccount(primary);
        }
      }
    } catch (err) {
      console.error('[InboxPage] Error loading email accounts:', err);
    }
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target as Node)) {
        setShowAccountDropdown(false);
      }
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Load mails from Dexie ────────────────────────────────────────────

  const loadMails = useCallback(async (page: number = 1) => {
    if (!selectedAccount) {
      setMails([]);
      setTotal(0);
      setTotalPages(1);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const result = await getInboxMailsPaginated(selectedAccount.accountCode, page, limit);
      setMails(result.mails);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setCurrentPage(result.page);

      // Restore scroll position after content renders (from saved state)
      if (pendingScrollRestore.current !== null) {
        const scrollTarget = pendingScrollRestore.current;
        pendingScrollRestore.current = null;
        requestAnimationFrame(() => {
          window.scrollTo({ top: scrollTarget, behavior: 'instant' });
        });
      }
    } catch (err) {
      console.error('[InboxPage] Error loading mails:', err);
      setError('Failed to load emails');
    } finally {
      setIsLoading(false);
    }
  }, [selectedAccount, limit]);

  // Load mails when account changes
  useEffect(() => {
    if (selectedAccount) {
      // If this is the initial mount and we restored state, load the
      // restored page / run restored search — don't reset filters.
      if (didRestoreState.current) {
        didRestoreState.current = false;
        setSelectedIds([]);
        if (isMobile) {
          loadMobileMails(true);
        } else {
          loadMails(currentPage);
        }
        // Restored searchQuery will trigger the debounced search effect
        return;
      }

      // Normal account switch — reset everything
      setSearchQuery('');
      setSearchResults(null);
      setFilterMode('all');
      setSelectedIds([]);
      if (isMobile) {
        loadMobileMails(true);
      } else {
        loadMails(1);
      }
    }
  }, [selectedAccount, isMobile, loadMails]);

  // ── Mobile infinite scroll ───────────────────────────────────────────

  const loadMobileMails = useCallback(async (reset: boolean = false) => {
    if (!selectedAccount) return;
    const page = reset ? 1 : mobilePageRef.current + 1;
    if (reset) {
      setMobileMails([]);
      setMobileHasMore(true);
      mobilePageRef.current = 1;
    }

    try {
      setMobileLoadingMore(!reset);
      if (reset) setIsLoading(true);
      const result = await getInboxMailsPaginated(selectedAccount.accountCode, page, limit);
      if (reset) {
        setMobileMails(result.mails);
      } else {
        setMobileMails(prev => [...prev, ...result.mails]);
      }
      setTotal(result.total);
      mobilePageRef.current = page;
      setMobileHasMore(page < result.totalPages);
    } catch (err) {
      console.error('[InboxPage] Error loading mobile mails:', err);
    } finally {
      setMobileLoadingMore(false);
      setIsLoading(false);
    }
  }, [selectedAccount]);

  // Intersection observer for mobile scroll-to-load
  useEffect(() => {
    if (!isMobile || !scrollSentinelRef.current) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && mobileHasMore && !mobileLoadingMore && !isSearching) {
          loadMobileMails(false);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(scrollSentinelRef.current);
    return () => observer.disconnect();
  }, [isMobile, mobileHasMore, mobileLoadingMore, isSearching, loadMobileMails]);

  // ── WebSocket inbox events ───────────────────────────────────────────

  useEffect(() => {
    const handleSyncComplete = () => {
      console.info('[InboxPage] Received inbox:sync-complete event, refreshing…');
      if (isMobile) loadMobileMails(true);
      else loadMails(currentPage);
    };

    const handleNewMail = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      console.info('[InboxPage] New mail notification:', detail);
      // Auto-refresh if the event matches the selected account
      if (!detail?.accountCode || detail.accountCode === selectedAccount?.accountCode) {
        if (isMobile) loadMobileMails(true);
        else loadMails(currentPage);
        toast.info(detail?.count === 1
          ? `New email${detail?.subject ? `: ${detail.subject}` : ''}`
          : `${detail?.count || ''} new emails`);
      }
    };

    const handleSettingsUpdated = () => {
      const newLimit = parseInt(localStorage.getItem('inbox_cache_limit') || '15', 10);
      setCacheLimitRaw(newLimit);
    };

    window.addEventListener('inbox:sync-complete', handleSyncComplete);
    window.addEventListener('inbox:new-mail', handleNewMail);
    window.addEventListener('settings:updated', handleSettingsUpdated);
    return () => {
      window.removeEventListener('inbox:sync-complete', handleSyncComplete);
      window.removeEventListener('inbox:new-mail', handleNewMail);
      window.removeEventListener('settings:updated', handleSettingsUpdated);
    };
  }, [isMobile, currentPage, selectedAccount, loadMails, loadMobileMails]);

  // ── Refresh on tab visibility ────────────────────────────────────────

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && selectedAccount) {
        if (isMobile) loadMobileMails(true);
        else loadMails(currentPage);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [selectedAccount, isMobile, currentPage, loadMails, loadMobileMails]);

  // ── Keyboard shortcut: Ctrl+K or / to open search ────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K / Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearchBar(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
        return;
      }
      // '/' when not typing in an input
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setShowSearchBar(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Sync from IMAP server ────────────────────────────────────────────

  const handleSync = useCallback(async () => {
    if (!selectedAccount || isSyncing) return;
    try {
      setIsSyncing(true);
      setError(null);

      const response = await apiFetch('/api/inbox/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountCode: selectedAccount.accountCode }),
      });

      const fetchedMails = response?.data?.mails || response?.mails || [];

      if (fetchedMails.length > 0) {
        // Convert API mails to InboxMailRecord and save to Dexie (encrypted)
        const records: InboxMailRecord[] = fetchedMails.map((m: any) => ({
          id: `${selectedAccount.accountCode}:${m.uid}`,
          uid: m.uid,
          accountId: selectedAccount.accountCode,
          mailbox: m.mailbox || 'INBOX',
          messageId: m.messageId,
          fromAddress: m.from?.address || m.from || '',
          fromName: m.from?.name || '',
          toAddresses: Array.isArray(m.to) ? m.to.map((t: any) => t.address || t) : [m.to || ''],
          ccAddresses: m.cc ? (Array.isArray(m.cc) ? m.cc.map((c: any) => c.address || c) : []) : [],
          bccAddresses: [],
          subject: m.subject || '(No Subject)',
          htmlBody: m.htmlBody || null,
          textBody: m.textBody || null,
          date: m.date || new Date().toISOString(),
          isRead: m.isRead ?? false,
          isStarred: m.isStarred ?? false,
          hasAttachments: m.hasAttachments ?? false,
          attachmentsMetadata: m.attachmentsMetadata || null,
          labels: m.labels || [],
          syncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdAt: m.date || new Date().toISOString(),
        }));

        await upsertInboxMails(records);

        // Enforce local cache limit — keep only latest N mails per account
        const cacheLimit = parseInt(localStorage.getItem('inbox_cache_limit') || '15', 10);
        const trimmed = await trimInboxToLimit(selectedAccount.accountCode, cacheLimit);
        if (trimmed > 0) {
          console.log(`[InboxPage] Trimmed ${trimmed} old mails from local cache`);
        }

        toast.success(`Synced ${records.length} email${records.length !== 1 ? 's' : ''}`);
      } else {
        toast.info('No new emails');
      }

      // Refresh local view + global context
      if (isMobile) {
        await loadMobileMails(true);
      } else {
        await loadMails(currentPage);
      }
      await refreshEmails();
    } catch (err: any) {
      console.error('[InboxPage] Sync error:', err);
      const msg = err?.message || 'Failed to sync emails from server';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSyncing(false);
    }
  }, [selectedAccount, isSyncing, currentPage, isMobile, loadMails, loadMobileMails, refreshEmails]);

  // ── Search ───────────────────────────────────────────────────────────

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      setServerSearchDepth(0);
      setServerSearchInfo(null);
      return;
    }

    try {
      setIsSearching(true);
      // Reset server search depth when query changes
      setServerSearchDepth(0);
      setServerSearchInfo(null);
      const results = await searchInboxMails(
        query,
        selectedAccount?.accountCode
      );
      setSearchResults(results);
    } catch (err) {
      console.error('[InboxPage] Search error:', err);
    } finally {
      setIsSearching(false);
    }
  }, [selectedAccount]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => handleSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch]);

  // ── Server-side search (progressive) ─────────────────────────────────

  const handleServerSearch = useCallback(async () => {
    if (!selectedAccount || !searchQuery.trim() || isServerSearching) return;

    // Determine sinceMonths based on current depth
    const depthMap: Record<number, number> = { 0: 6, 1: 12, 2: 0 }; // 0 = all time
    const nextDepth = serverSearchDepth + 1;
    const sinceMonths = depthMap[serverSearchDepth] ?? 0;

    try {
      setIsServerSearching(true);
      setServerSearchInfo(null);

      const response = await apiFetch('/api/inbox/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountCode: selectedAccount.accountCode,
          query: searchQuery.trim(),
          sinceMonths,
        }),
      });

      const data = response?.data || response;
      const serverMails = data?.mails || [];
      const protocol = data?.protocol || 'IMAP';

      if (protocol === 'POP3') {
        setServerSearchInfo('Server search is not available for POP3 accounts');
        toast.info('Server search is not supported for POP3 accounts');
        setServerSearchDepth(3); // Prevent further clicks
        return;
      }

      if (serverMails.length > 0) {
        // Convert to InboxMailRecord and upsert into Dexie (local-only storage)
        const records: InboxMailRecord[] = serverMails.map((m: any) => ({
          id: `${selectedAccount.accountCode}:${m.uid}`,
          uid: m.uid,
          accountId: selectedAccount.accountCode,
          mailbox: m.mailbox || 'INBOX',
          messageId: m.messageId || null,
          fromAddress: m.fromAddress || '',
          fromName: m.fromName || '',
          toAddresses: m.toAddresses || [],
          ccAddresses: m.ccAddresses || [],
          bccAddresses: m.bccAddresses || [],
          subject: m.subject || '(No Subject)',
          htmlBody: m.htmlBody || null,
          textBody: m.textBody || null,
          date: m.date || new Date().toISOString(),
          isRead: m.isRead ?? false,
          isStarred: m.isStarred ?? false,
          hasAttachments: m.hasAttachments ?? false,
          attachmentsMetadata: m.attachmentsMetadata || null,
          labels: m.labels || [],
          syncedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdAt: m.date || new Date().toISOString(),
        }));

        // Store in Dexie only — do NOT trim (these are search results, not cache)
        await upsertInboxMails(records);

        // Re-run local search to merge new results
        const merged = await searchInboxMails(searchQuery, selectedAccount.accountCode);
        setSearchResults(merged);

        const rangeLabel = sinceMonths === 6 ? 'last 6 months' : sinceMonths === 12 ? 'last 12 months' : 'all time';
        setServerSearchInfo(`Found ${serverMails.length} result${serverMails.length !== 1 ? 's' : ''} on server (${rangeLabel})`);
        toast.success(`Found ${serverMails.length} email${serverMails.length !== 1 ? 's' : ''} on server`);
      } else {
        const rangeLabel = sinceMonths === 6 ? 'last 6 months' : sinceMonths === 12 ? 'last 12 months' : 'all time';
        setServerSearchInfo(`No additional results on server (${rangeLabel})`);
        toast.info(`No matches found on server (${rangeLabel})`);
      }

      setServerSearchDepth(nextDepth);
    } catch (err: any) {
      console.error('[InboxPage] Server search error:', err);
      const msg = err?.message || 'Failed to search on server';
      setServerSearchInfo(`Error: ${msg}`);
      toast.error(msg);
    } finally {
      setIsServerSearching(false);
    }
  }, [selectedAccount, searchQuery, serverSearchDepth, isServerSearching]);

  // ── Filter logic ─────────────────────────────────────────────────────

  const applyFilter = useCallback((items: InboxMailRecord[]): InboxMailRecord[] => {
    switch (filterMode) {
      case 'unread': return items.filter(m => !m.isRead);
      case 'read': return items.filter(m => m.isRead);
      case 'starred': return items.filter(m => m.isStarred);
      case 'attachments': return items.filter(m => m.hasAttachments);
      default: return items;
    }
  }, [filterMode]);

  // The mails to render
  const displayMails = searchResults !== null
    ? applyFilter(searchResults)
    : isMobile
      ? applyFilter(mobileMails)
      : applyFilter(mails);

  // ── Actions ──────────────────────────────────────────────────────────

  const handleStarToggle = async (e: React.MouseEvent, mail: InboxMailRecord) => {
    e.stopPropagation();
    await updateMailStarredStatus(mail.id, !mail.isStarred);
    // Update local state
    const updater = (prev: InboxMailRecord[]) =>
      prev.map(m => m.id === mail.id ? { ...m, isStarred: !m.isStarred } : m);
    setMails(updater);
    setMobileMails(updater);
    if (searchResults) setSearchResults(prev => prev ? updater(prev) : prev);
    toggleEmailStarred(mail.id);
  };

  const handleMailClick = (mail: InboxMailRecord) => {
    savePageState();
    navigate(`/email/${mail.id}?type=inbox`);
  };

  const handleReadToggle = async (e: React.MouseEvent, mail: InboxMailRecord) => {
    e.stopPropagation();
    await updateMailReadStatus(mail.id, !mail.isRead);
    const updater = (prev: InboxMailRecord[]) =>
      prev.map(m => m.id === mail.id ? { ...m, isRead: !m.isRead } : m);
    setMails(updater);
    setMobileMails(updater);
    if (searchResults) setSearchResults(prev => prev ? updater(prev) : prev);
  };

  const confirmDelete = async () => {
    if (!mailToDelete) return;
    try {
      await deleteInboxMails([mailToDelete.id]);
      setMails(prev => prev.filter(m => m.id !== mailToDelete.id));
      setMobileMails(prev => prev.filter(m => m.id !== mailToDelete.id));
      if (searchResults) setSearchResults(prev => prev ? prev.filter(m => m.id !== mailToDelete.id) : prev);
      setTotal(prev => prev - 1);
      toast.success('Email deleted');
      await refreshEmails();
    } catch (err) {
      toast.error('Failed to delete email');
    } finally {
      setMailToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      await deleteInboxMails(selectedIds);
      setMails(prev => prev.filter(m => !selectedIds.includes(m.id)));
      setMobileMails(prev => prev.filter(m => !selectedIds.includes(m.id)));
      setTotal(prev => prev - selectedIds.length);
      setSelectedIds([]);
      toast.success(`Deleted ${selectedIds.length} email(s)`);
      await refreshEmails();
    } catch (err) {
      toast.error('Failed to delete emails');
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    loadMails(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Persist updated page so back-navigation restores it
    if (selectedAccount) {
      const state = {
        accountCode: selectedAccount.accountCode,
        currentPage: page,
        filterMode,
        searchQuery,
        showSearchBar,
        scrollY: 0,
      };
      sessionStorage.setItem(INBOX_STATE_KEY, JSON.stringify(state));
    }
  };

  // ── Format helpers ───────────────────────────────────────────────────

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (days === 1) return 'Yesterday';
    if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getPreview = (mail: InboxMailRecord): string => {
    if (mail.textBody) return mail.textBody.substring(0, 120);
    if (mail.htmlBody) {
      const div = document.createElement('div');
      div.innerHTML = mail.htmlBody;
      return (div.textContent || '').substring(0, 120);
    }
    return '(No content)';
  };

  // ── Filter labels ────────────────────────────────────────────────────

  const filterOptions: { value: FilterMode; label: string; icon?: React.ReactNode }[] = [
    { value: 'all', label: 'All Emails' },
    { value: 'unread', label: 'Unread', icon: <EyeOff className="w-3.5 h-3.5" /> },
    { value: 'read', label: 'Read', icon: <Eye className="w-3.5 h-3.5" /> },
    { value: 'starred', label: 'Starred', icon: <Star className="w-3.5 h-3.5" /> },
    { value: 'attachments', label: 'Has Attachments', icon: <Paperclip className="w-3.5 h-3.5" /> },
  ];

  // ── Animation variants ───────────────────────────────────────────────

  const pageVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeOut } },
  };

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <motion.div
      className="max-w-6xl mx-auto"
      variants={pageVariants}
      initial="initial"
      animate="animate"
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="border-b border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Inbox className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                Inbox
              </h1>
              {total > 0 && (
                <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-2 py-0.5 rounded-full">
                  {total}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowSearchBar(v => {
                    if (v) { setSearchQuery(''); setSearchResults(null); }
                    return !v;
                  });
                  // Auto-focus the input after the animation opens
                  if (!showSearchBar) setTimeout(() => searchInputRef.current?.focus(), 150);
                }}
                className={`flex items-center gap-2 ${showSearchBar ? '!border-blue-500 !text-blue-600 dark:!text-blue-400' : ''}`}
                size="small"
              >
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">Search</span>
                <kbd className="hidden lg:inline text-[10px] bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-300 px-1.5 py-0.5 rounded font-mono ml-1">/</kbd>
              </Button>
              <Button
                variant="outline"
                onClick={handleSync}
                disabled={isSyncing || !selectedAccount}
                className="flex items-center gap-2"
                size="small"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isSyncing ? 'Syncing…' : 'Sync'}</span>
              </Button>
            </div>
          </div>

          {/* Account selector + Filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Account Dropdown */}
            {accounts.length > 0 && (
              <div className="relative" ref={accountDropdownRef}>
                <button
                  onClick={() => setShowAccountDropdown(v => !v)}
                  className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors w-full sm:w-auto min-w-[180px]"
                >
                  <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="truncate flex-1 text-left">
                    {selectedAccount?.email || 'Select account'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showAccountDropdown ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {showAccountDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute z-20 mt-1 w-full sm:w-72 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg overflow-hidden"
                    >
                      {accounts.map(acc => (
                        <button
                          key={acc.id}
                          onClick={() => {
                            setSelectedAccount(acc);
                            setShowAccountDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex items-center gap-2 ${
                            selectedAccount?.id === acc.id
                              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                              : 'text-gray-700 dark:text-gray-200'
                          }`}
                        >
                          <Mail className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{acc.email}</span>
                          {acc.isPrimary && (
                            <span className="ml-auto text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
                              Primary
                            </span>
                          )}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Spacer pushes filter to the right */}
            <div className="flex-1" />

            {/* Filter */}
            <div className="relative" ref={filterRef}>
              <Button
                variant="outline"
                onClick={() => setShowFilterMenu(v => !v)}
                className={`flex items-center gap-2 ${filterMode !== 'all' ? '!border-blue-500 !text-blue-600 dark:!text-blue-400' : ''}`}
                size="small"
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {filterMode === 'all' ? 'Filter' : filterOptions.find(f => f.value === filterMode)?.label}
                </span>
                {filterMode !== 'all' && (
                  <button
                    onClick={e => { e.stopPropagation(); setFilterMode('all'); setShowFilterMenu(false); }}
                    className="ml-1 hover:text-red-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </Button>

              <AnimatePresence>
                {showFilterMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute right-0 z-20 mt-1 w-48 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg overflow-hidden"
                  >
                    {filterOptions.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => { setFilterMode(opt.value); setShowFilterMenu(false); }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex items-center gap-2 ${
                          filterMode === opt.value
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                            : 'text-gray-700 dark:text-gray-200'
                        }`}
                      >
                        {opt.icon}
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* ── Animated Search Panel ───────────────────────────────── */}
        <AnimatePresence>
          {showSearchBar && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: easeOut }}
              className="overflow-hidden border-b border-gray-200 dark:border-gray-700"
            >
              <div className="px-4 sm:px-6 py-3 bg-gray-50 dark:bg-gray-900/30">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search cached emails by subject, sender, body…"
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white text-sm"
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        setSearchQuery('');
                        setSearchResults(null);
                        setShowSearchBar(false);
                      }
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => { setSearchQuery(''); setSearchResults(null); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {isSearching && (
                    <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-blue-500" />
                  )}
                </div>
                {searchResults !== null && (
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {searchResults.length === 0
                      ? 'No matches in cached emails'
                      : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} found`}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Bulk Toolbar ────────────────────────────────────────── */}
        <AnimatePresence>
          {selectedIds.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-b border-gray-200 dark:border-gray-700 px-4 py-3 bg-blue-50 dark:bg-blue-900/20"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                  {selectedIds.length} selected
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="small"
                    onClick={handleBulkDelete}
                    className="flex items-center gap-1 !text-red-600 !border-red-300 dark:!border-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="small"
                    onClick={() => setSelectedIds([])}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Error Banner ────────────────────────────────────────── */}
        {error && (
          <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="hover:text-red-900">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── No accounts ─────────────────────────────────────────── */}
        {accounts.length === 0 && !isLoading && (
          <div className="p-12 text-center">
            <Mail className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Email Accounts</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Add an email account in Settings to start receiving emails.
            </p>
            <Button onClick={() => navigate('/settings')}>Go to Settings</Button>
          </div>
        )}

        {/* ── Loading skeleton ─────────────────────────────────────── */}
        {isLoading && accounts.length > 0 && (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-4 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-4 h-4 bg-gray-200 dark:bg-gray-600 rounded" />
                  <div className="flex-1">
                    <div className="flex items-center gap-4">
                      <div className="w-32 h-4 bg-gray-200 dark:bg-gray-600 rounded" />
                      <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-600 rounded" />
                      <div className="w-16 h-4 bg-gray-200 dark:bg-gray-600 rounded" />
                    </div>
                    <div className="mt-2 w-2/3 h-3 bg-gray-100 dark:bg-gray-700 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────────── */}
        {!isLoading && accounts.length > 0 && displayMails.length === 0 && (
          <div className="p-12 text-center">
            <Inbox className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              {searchQuery ? 'No results found' : filterMode !== 'all' ? 'No matching emails' : 'Inbox is empty'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {searchQuery
                ? 'Try different search terms'
                : filterMode !== 'all'
                  ? 'Try changing your filter'
                  : 'Click Sync to fetch emails from your mail server'}
            </p>
            {!searchQuery && filterMode === 'all' && (
              <Button onClick={handleSync} disabled={isSyncing}>
                <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                Sync Now
              </Button>
            )}
          </div>
        )}

        {/* ── Email list ──────────────────────────────────────────── */}
        {!isLoading && displayMails.length > 0 && (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {displayMails.map((mail) => (
              <div
                key={mail.id}
                onClick={() => handleMailClick(mail)}
                className={`
                  group px-4 py-3 cursor-pointer transition-colors
                  ${!mail.isRead ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}
                  ${selectedIds.includes(mail.id) ? '!bg-blue-100 dark:!bg-blue-900/30' : ''}
                `}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(mail.id)}
                    onChange={e => {
                      e.stopPropagation();
                      setSelectedIds(prev =>
                        prev.includes(mail.id)
                          ? prev.filter(id => id !== mail.id)
                          : [...prev, mail.id]
                      );
                    }}
                    onClick={e => e.stopPropagation()}
                    className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />

                  {/* Star */}
                  <button
                    onClick={e => handleStarToggle(e, mail)}
                    className={`mt-0.5 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${
                      mail.isStarred ? 'text-yellow-500' : 'text-gray-300 dark:text-gray-500'
                    }`}
                  >
                    <Star className={`w-4 h-4 ${mail.isStarred ? 'fill-current' : ''}`} />
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Desktop layout */}
                    <div className="hidden sm:grid sm:grid-cols-12 sm:gap-4 sm:items-baseline">
                      {/* Sender */}
                      <div className="col-span-3 min-w-0">
                        <p className={`text-sm truncate ${!mail.isRead ? 'font-semibold text-gray-900 dark:text-white' : 'font-medium text-gray-700 dark:text-gray-300'}`}>
                          {mail.fromName || mail.fromAddress}
                        </p>
                      </div>
                      {/* Subject + Preview */}
                      <div className="col-span-7 min-w-0 flex items-center gap-2">
                        <p className={`text-sm truncate ${!mail.isRead ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                          {mail.subject || '(No Subject)'}
                        </p>
                        {mail.hasAttachments && <Paperclip className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                        <span className="text-xs text-gray-400 dark:text-gray-500 truncate hidden lg:inline">
                          — {getPreview(mail)}
                        </span>
                      </div>
                      {/* Date + actions */}
                      <div className="col-span-2 flex items-center justify-end gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {formatDate(mail.date)}
                        </span>
                        <div className="hidden group-hover:flex items-center gap-1">
                          <button
                            onClick={e => handleReadToggle(e, mail)}
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400"
                            title={mail.isRead ? 'Mark as unread' : 'Mark as read'}
                          >
                            {mail.isRead ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setMailToDelete(mail); }}
                            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Mobile layout */}
                    <div className="sm:hidden">
                      <div className="flex items-center justify-between mb-0.5">
                        <p className={`text-sm truncate ${!mail.isRead ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                          {mail.fromName || mail.fromAddress}
                        </p>
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">
                          {formatDate(mail.date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className={`text-sm truncate ${!mail.isRead ? 'font-medium text-gray-800 dark:text-gray-200' : 'text-gray-600 dark:text-gray-400'}`}>
                          {mail.subject || '(No Subject)'}
                        </p>
                        {mail.hasAttachments && <Paperclip className="w-3 h-3 text-gray-400 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                        {getPreview(mail)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Mobile scroll sentinel ──────────────────────────────── */}
        {isMobile && mobileHasMore && !isLoading && displayMails.length > 0 && (
          <div ref={scrollSentinelRef} className="p-4 flex justify-center">
            {mobileLoadingMore && <Loader2 className="w-5 h-5 animate-spin text-blue-500" />}
          </div>
        )}

        {/* ── Desktop Pagination ──────────────────────────────────── */}
        {!isMobile && !isLoading && accounts.length > 0 && displayMails.length > 0 && searchResults === null && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Showing {((currentPage - 1) * limit) + 1}–{Math.min(currentPage * limit, total)} of {total}
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="small"
                  disabled={currentPage === 1}
                  onClick={() => handlePageChange(currentPage - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                {/* Page numbers */}
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let page: number;
                  if (totalPages <= 5) {
                    page = i + 1;
                  } else if (currentPage <= 3) {
                    page = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    page = totalPages - 4 + i;
                  } else {
                    page = currentPage - 2 + i;
                  }
                  return (
                    <Button
                      key={page}
                      variant={currentPage === page ? 'primary' : 'outline'}
                      size="small"
                      onClick={() => handlePageChange(page)}
                      className="!px-3 min-w-[36px]"
                    >
                      {page}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="small"
                  disabled={currentPage >= totalPages}
                  onClick={() => handlePageChange(currentPage + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Search: progressive server search ─────────────────── */}
        {searchQuery && searchResults !== null && selectedAccount?.incomingType !== 'POP3' && (
          <div className="border-t border-gray-200 dark:border-gray-700 p-4 text-center space-y-2">
            {serverSearchInfo && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {serverSearchInfo}
              </p>
            )}
            {serverSearchDepth < 3 && (
              <button
                onClick={handleServerSearch}
                disabled={isServerSearching}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1.5 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isServerSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {isServerSearching
                  ? 'Searching server…'
                  : serverSearchDepth === 0
                    ? 'Search server (last 6 months)'
                    : serverSearchDepth === 1
                      ? 'Widen search (last 12 months)'
                      : 'Search all time'}
              </button>
            )}
            {serverSearchDepth >= 3 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                All server emails searched
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Delete Confirmation ──────────────────────────────────── */}
      <ConfirmDialog
        isOpen={!!mailToDelete}
        onCancel={() => setMailToDelete(null)}
        onConfirm={confirmDelete}
        title="Delete Email"
        message={`Delete "${mailToDelete?.subject || '(No Subject)'}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </motion.div>
  );
};

export default InboxPage;
