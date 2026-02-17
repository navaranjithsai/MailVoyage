import React, { useEffect, useState, useCallback, memo, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Mail, 
  Inbox, 
  Send, 
  FileText, 
  Plus, 
  Archive, 
  Settings,
  User,
  RefreshCw,
  Folder,
  HardDrive,
  Wifi,
  WifiOff,
  Clock,
  Star,
  Calendar,
  AlertCircle,
  Radio
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useEmail } from '@/contexts/EmailContext';
import { useSync } from '@/contexts/SyncContext';
import Button from '@/components/ui/Button';
import EmailList from '@/components/email/EmailList';
import SearchBar from '@/components/email/SearchBar';
import { toast } from '@/lib/toast';
import { fetchAll, fetchDraftsCount, type FetchProgress } from '@/lib/dataSync';
import { getStorageBreakdown, getSentMailsCount } from '@/lib/db';
import { SectionErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineIndicator } from '@/components/OfflineQueueManager';
import { usePullToRefresh, PullToRefreshIndicator } from '@/hooks/usePullToRefresh';
// Service worker utilities available via lib/serviceWorker.ts

interface EmailStats {
  unread: number;
  total: number;
  sent: number;
  drafts: number;
}

// Storage and sync status interfaces
interface StorageInfo {
  used: number; // total in bytes
  total: number; // browser quota in bytes
  percentage: number;
  indexedDb: { bytes: number; tables: Record<string, { count: number; bytes: number }> };
  localStorage: { bytes: number; keys: number };
}

interface SyncStatus {
  isOnline: boolean;
  isRealTime: boolean; // New: WebSocket connected
  lastSync: string;
  pendingSync: number;
}

interface RecentActivity {
  id: number;
  type: 'received' | 'sent' | 'deleted' | 'starred';
  description: string;
  timestamp: string;
  icon: React.ReactNode;
}

// Generate a consistent color from username
const getAvatarColor = (username: string): string => {
  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
    'bg-indigo-500', 'bg-teal-500', 'bg-orange-500', 'bg-cyan-500',
    'bg-rose-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500'
  ];
  
  // Generate a hash from the username
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
};

// Avatar caching in localStorage
const AVATAR_CACHE_KEY = 'mailvoyage-avatar-cache';
const AVATAR_CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedAvatar {
  svg: string;
  timestamp: number;
  username: string;
}

const getCachedAvatar = (username: string): string | null => {
  try {
    const cached = localStorage.getItem(AVATAR_CACHE_KEY);
    if (!cached) return null;
    
    const data: CachedAvatar = JSON.parse(cached);
    if (data.username !== username) return null;
    if (Date.now() - data.timestamp > AVATAR_CACHE_EXPIRY) {
      localStorage.removeItem(AVATAR_CACHE_KEY);
      return null;
    }
    
    return data.svg;
  } catch {
    return null;
  }
};

const setCachedAvatar = (username: string, svg: string): void => {
  try {
    const data: CachedAvatar = {
      svg,
      timestamp: Date.now(),
      username
    };
    localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
};

// UTF-8 safe base64 encoding for SVG
const svgToDataUrl = (svgText: string): string => {
  // Use encodeURIComponent for UTF-8 safe encoding
  const encoded = encodeURIComponent(svgText)
    .replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16)));
  return `data:image/svg+xml;base64,${btoa(encoded)}`;
};

// Memoized Stat Card component
interface StatCardProps {
  title: string;
  icon: React.ReactNode;
  value: number;
  bgColor: string;
  borderColor: string;
  isLoading: boolean;
  index: number;
}

const StatCard = memo(function StatCard({ 
  title, 
  icon, 
  value, 
  bgColor, 
  borderColor, 
  isLoading,
  index 
}: StatCardProps) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      className={`
        ${bgColor} rounded-lg p-6 shadow-sm border ${borderColor}
        hover:shadow-md transition-all duration-200 hover:scale-105
      `}
    >
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-gray-700 dark:text-gray-300 font-medium">
          {title}
        </h3>
        {icon}
      </div>
      <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
        {isLoading ? (
          <div className="h-8 w-16 bg-gray-300 dark:bg-gray-600 rounded animate-pulse"></div>
        ) : (
          value
        )}
      </div>
    </motion.div>
  );
});

// Format bytes to human-readable string
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const DashboardPage: React.FC = () => {
  const { user, logout, getTabSessionInfo, clearTabValidation } = useAuth();
  const { theme, resolvedTheme } = useTheme();
  const { emails, unreadCount, refreshEmails } = useEmail();
  const { syncState, isRealTimeActive, triggerSync, refreshConnection } = useSync();
  const navigate = useNavigate();
  
  const [emailStats, setEmailStats] = useState<EmailStats>({
    unread: unreadCount,
    total: emails.length,
    sent: 0,
    drafts: 0,
  });
  const [storageInfo, setStorageInfo] = useState<StorageInfo>({
    used: 0,
    total: 1000,
    percentage: 0,
    indexedDb: { bytes: 0, tables: {} },
    localStorage: { bytes: 0, keys: 0 },
  });
  // Derive recent activity from live email list — updates instantly on read/star changes
  const recentActivity: RecentActivity[] = useMemo(() => {
    const sorted = [...emails]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);
    return sorted.map((email, idx) => ({
      id: idx + 1,
      type: email.isStarred ? 'starred' as const : 'received' as const,
      description: `${email.isRead ? '' : '(New) '}${email.sender}: ${email.subject}`,
      timestamp: email.time,
      icon: email.isStarred
        ? <Star size={16} className="text-yellow-500" />
        : email.isRead
          ? <Mail size={16} className="text-gray-400" />
          : <Mail size={16} className="text-blue-500" />,
    }));
  }, [emails]);

  // Starred count derived from emails
  const starredCount = useMemo(() => emails.filter(e => e.isStarred).length, [emails]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<string>('');
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [cachedAvatarSvg, setCachedAvatarSvg] = useState<string | null>(() => {
    // Synchronously load cached avatar on initial render
    const cached = getCachedAvatar(user?.username || 'User');
    return cached;
  });

  // Derive sync status directly from context (no local state copy)
  const syncStatus: SyncStatus = useMemo(() => ({
    isOnline: syncState.isOnline,
    isRealTime: isRealTimeActive,
    lastSync: syncState.lastSync || 'Not synced yet',
    pendingSync: syncState.pendingChanges
  }), [syncState, isRealTimeActive]);

  // Get username for avatar
  const username = user?.username || 'User';
  const avatarUrl = `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(username)}`;
  const avatarColor = getAvatarColor(username);
  const firstLetter = username.charAt(0).toUpperCase();

  // Set avatarLoaded if we have cached avatar
  useEffect(() => {
    if (cachedAvatarSvg) {
      setAvatarLoaded(true);
    }
  }, [cachedAvatarSvg]);

  // Fetch and cache avatar SVG only if not cached
  useEffect(() => {
    // Skip if already have cached version or already loaded
    if (cachedAvatarSvg || avatarLoaded) return;

    let cancelled = false;

    const fetchAndCacheAvatar = async () => {
      try {
        const response = await fetch(avatarUrl);
        if (!response.ok || cancelled) return;
        
        const svgText = await response.text();
        if (cancelled) return;
        
        // Convert to data URL using UTF-8 safe encoding
        const dataUrl = svgToDataUrl(svgText);
        setCachedAvatarSvg(dataUrl);
        setCachedAvatar(username, dataUrl);
        setAvatarLoaded(true);
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to fetch avatar:', error);
          setAvatarError(true);
        }
      }
    };

    fetchAndCacheAvatar();

    return () => {
      cancelled = true;
    };
  }, [username, avatarUrl, cachedAvatarSvg, avatarLoaded]);

  useEffect(() => {
    const loadDashboardData = async () => {
      setIsLoading(true);
      try {
        // Fetch real counts from IndexedDB
        const [draftsCount, sentCount] = await Promise.all([
          fetchDraftsCount(),
          getSentMailsCount(),
        ]);
        
        // Update with real email data
        setEmailStats({
          unread: unreadCount,
          total: emails.length,
          sent: sentCount,
          drafts: draftsCount
        });

        // Calculate detailed storage breakdown (IndexedDB + localStorage)
        try {
          const breakdown = await getStorageBreakdown();
          const totalUsed = breakdown.indexedDb.bytes + breakdown.localStorage.bytes;

          // Also get browser quota for the overall bar
          let quotaBytes = 100 * 1024 * 1024; // default 100 MB
          if ('storage' in navigator && 'estimate' in navigator.storage) {
            const estimate = await navigator.storage.estimate();
            quotaBytes = estimate.quota || quotaBytes;
          }

          const percentage = quotaBytes > 0 ? (totalUsed / quotaBytes) * 100 : 0;

          setStorageInfo({
            used: totalUsed,
            total: quotaBytes,
            percentage: Math.min(percentage, 100),
            indexedDb: breakdown.indexedDb,
            localStorage: breakdown.localStorage,
          });
        } catch (storageError) {
          console.warn('Could not estimate storage:', storageError);
        }

        // Sync status derived from context via useMemo
        // Recent activity derived from emails via useMemo
      } catch (error) {
        console.error('Error loading dashboard data:', error);
        toast.error('Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboardData();

    // Online/offline status is now tracked by SyncContext/deltaSyncManager
    // No need to duplicate listeners here
  }, [unreadCount, emails.length]); // Re-run when email data changes

  // Refresh emails from Dexie when the page gains focus (live update)
  // NOTE: No mount-time refresh here — the auto-sync effect (handleRefresh)
  // already calls refreshEmails() after fetchAll completes, so calling it here
  // too creates a race where two loadEmails() run concurrently.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshEmails();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refreshEmails]);

  // Refresh on WebSocket inbox events (new mail / sync complete)
  useEffect(() => {
    const handleInboxEvent = () => refreshEmails();
    window.addEventListener('inbox:sync-complete', handleInboxEvent);
    window.addEventListener('inbox:new-mail', handleInboxEvent);
    return () => {
      window.removeEventListener('inbox:sync-complete', handleInboxEvent);
      window.removeEventListener('inbox:new-mail', handleInboxEvent);
    };
  }, [refreshEmails]);

  // Handle progress updates from fetchAll
  const handleFetchProgress = useCallback((progress: FetchProgress) => {
    setRefreshProgress(progress.message);
    console.log('📊 Sync progress:', progress.step, progress.message);
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setRefreshProgress('Starting sync...');
    
    try {
      // Full sync: accounts → inbox + sent + settings (parallel)
      const results = await fetchAll(handleFetchProgress, {
        fetchAccounts: true,
        fetchInbox: true,
        fetchSent: true,
        fetchSettings: true,
        invalidateCache: false
      });

      // Immediately refresh EmailContext so UI renders new data
      await refreshEmails();
      
      // Update email stats from fresh Dexie data
      const [sentCount, draftsCount] = await Promise.all([
        getSentMailsCount(),
        fetchDraftsCount(),
      ]);

      setEmailStats(prev => ({
        ...prev,
        sent: sentCount,
        total: results.inbox.success && results.inbox.data ? results.inbox.data.total : prev.total,
        drafts: draftsCount,
        unread: unreadCount,
      }));
      
      // Refresh storage breakdown after sync
      try {
        const breakdown = await getStorageBreakdown();
        const totalUsed = breakdown.indexedDb.bytes + breakdown.localStorage.bytes;
        setStorageInfo(prev => ({
          ...prev,
          used: totalUsed,
          indexedDb: breakdown.indexedDb,
          localStorage: breakdown.localStorage,
          percentage: prev.total > 0 ? Math.min((totalUsed / prev.total) * 100, 100) : 0,
        }));
      } catch { /* ignore */ }
      
      // Show success/partial success message
      const successCount = [
        results.emailAccounts.success,
        results.inbox.success,
        results.sentMails.success,
        results.settings.success
      ].filter(Boolean).length;
      
      if (successCount === 4) {
        toast.success('All data synced successfully');
      } else if (successCount > 0) {
        toast.info(`Partial sync complete (${successCount}/4 succeeded)`);
      } else {
        toast.error('Sync failed - please try again');
      }
      
    } catch (error) {
      console.error('Error refreshing dashboard:', error);
      toast.error('Failed to refresh dashboard');
    } finally {
      setIsRefreshing(false);
      setRefreshProgress('');
    }
  }, [handleFetchProgress, unreadCount, refreshEmails]);

  // Auto-trigger full sync on first load (e.g. after login)
  const hasAutoSynced = useRef(false);
  useEffect(() => {
    if (!hasAutoSynced.current && user) {
      hasAutoSynced.current = true;
      // Call directly — no setTimeout to avoid StrictMode cleanup cancellation
      handleRefresh();
    }
  }, [user, handleRefresh]);

  // Pull-to-refresh functionality for mobile
  const {
    pullDistance,
    isRefreshing: isPullRefreshing,
    pullProgress,
    containerRef
  } = usePullToRefresh({
    onRefresh: handleRefresh,
    disabled: isRefreshing
  });

  const handleEmailSearch = (query: string) => {
    console.log('Searching emails for:', query);
    if (query.trim()) {
      // Navigate to search page with query parameter
      navigate(`/search?q=${encodeURIComponent(query)}`);
    } else {
      // If no query, just navigate to search page
      navigate('/search');
    }
  };

  const handleEmailFilter = () => {
    console.log('Opening email filters');
    toast.info('Email filters opened');
    // Here you would implement filter functionality
  };

  const handleLogout = () => {
    logout();
  };

  const handleDebugTabSession = () => {
    const sessionInfo = getTabSessionInfo();
    console.log('Tab Session Info:', sessionInfo);
    toast.info(`Tab ID: ${sessionInfo.tabSessionId.slice(-8)} | Validated: ${sessionInfo.isValidated}`);
  };

  const handleClearTabValidation = () => {
    clearTabValidation();
    toast.info('Tab validation cleared');
  };

  const handleHardReload = () => {
    console.log('Hard reload triggered. Clearing tab validation states...');
    try {
      // Clear all tab validation states
      const keys = Object.keys(sessionStorage);
      keys.forEach(key => {
        if (key.startsWith('sessionValidated_') || key === 'tabSessionId') {
          sessionStorage.removeItem(key);
        }
      });
      console.log('Tab validation states cleared.');
    } catch (e) {
      console.error('Error clearing tab validation states:', e);
    }
    window.location.reload();
  };

  const statCards = [
    { 
      title: 'Unread', 
      icon: <Mail className="text-blue-500 dark:text-blue-400" size={24} />, 
      value: emailStats.unread,
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      borderColor: 'border-blue-200 dark:border-blue-800'
    },
    { 
      title: 'Total', 
      icon: <Inbox className="text-gray-500 dark:text-gray-400" size={24} />, 
      value: emailStats.total,
      bgColor: 'bg-gray-50 dark:bg-gray-800/50',
      borderColor: 'border-gray-200 dark:border-gray-700'
    },
    { 
      title: 'Sent', 
      icon: <Send className="text-green-500 dark:text-green-400" size={24} />, 
      value: emailStats.sent,
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      borderColor: 'border-green-200 dark:border-green-800'
    },
    { 
      title: 'Drafts', 
      icon: <FileText className="text-orange-500 dark:text-orange-400" size={24} />, 
      value: emailStats.drafts,
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      borderColor: 'border-orange-200 dark:border-orange-800'
    },
  ];

  const quickActions = [
    {
      title: 'Compose Email',
      description: 'Create a new email',
      icon: <Plus size={20} />,
      href: '/compose',
      color: 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
    },
    {
      title: 'Mail Settings',
      description: 'Configure mail servers',
      icon: <Settings size={20} />,
      href: '/settings/',
      color: 'bg-gray-600 hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600'
    },
    {
      title: 'Import/Export',
      description: 'Manage email data',
      icon: <Archive size={20} />,
      href: '/tools/import-export',
      color: 'bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-6 space-y-4 sm:space-y-0">
            <div className="flex-1 min-w-0">
              <motion.h1 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 truncate"
              >
                Welcome back, {user?.username || 'User'}!
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="text-gray-600 dark:text-gray-400 mt-1 text-sm sm:text-base"
              >
                Here's what's happening with your emails today
              </motion.p>
            </div>
            
            <div className="flex items-center justify-between sm:justify-end space-x-2 sm:space-x-4">
              <div className="flex items-center space-x-2">
                <Button
                  onClick={handleRefresh}
                  variant="ghost"
                  size="icon"
                  className="relative group"
                  disabled={isRefreshing}
                  title={isRefreshing ? refreshProgress : 'Sync all data'}
                >
                  <RefreshCw 
                    size={20} 
                    className={`${isRefreshing ? 'animate-spin' : ''} text-gray-600 dark:text-gray-300`} 
                  />
                  {/* Progress tooltip */}
                  {isRefreshing && refreshProgress && (
                    <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs bg-gray-800 dark:bg-gray-700 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                      {refreshProgress}
                    </span>
                  )}
                </Button>
                
                {/* Profile Avatar */}
                <div className="relative w-9 h-9 rounded-full overflow-hidden flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all">
                  {/* Fallback: First letter with colored background */}
                  {(!avatarLoaded || avatarError) && (
                    <div className={`absolute inset-0 ${avatarColor} flex items-center justify-center text-white font-semibold text-sm`}>
                      {firstLetter}
                    </div>
                  )}
                  {/* Cached or Dicebear Avatar */}
                  <img 
                    src={cachedAvatarSvg || avatarUrl}
                    alt={`${username}'s avatar`}
                    className={`w-full h-full object-cover transition-opacity duration-300 ${avatarLoaded && !avatarError ? 'opacity-100' : 'opacity-0'}`}
                    onLoad={() => setAvatarLoaded(true)}
                    onError={() => setAvatarError(true)}
                  />
                </div>

                {/* Offline Indicator */}
                <OfflineIndicator className="hidden sm:flex" />
              </div>

              <Button
                onClick={handleLogout}
                variant="outline"
                className="flex items-center gap-2"
                size="small"
              >
                <User size={16} />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div 
        ref={containerRef}
        className="relative overflow-auto"
        style={{ height: 'calc(100vh - 140px)' }}
      >
        {/* Pull to Refresh Indicator */}
        <PullToRefreshIndicator
          pullDistance={pullDistance}
          isRefreshing={isPullRefreshing}
          pullProgress={pullProgress}
        />

        <motion.main 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
          style={{ transform: `translateY(${pullDistance}px)` }}
        >
        {/* Quick Actions */}
        <section className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {quickActions.map((action, index) => (
              <motion.div
                key={action.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.3 }}
              >
                <Link
                  to={action.href}
                  className={`
                    block p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700
                    bg-white dark:bg-gray-800 hover:shadow-md transition-all duration-200
                    group hover:scale-105
                  `}
                >
                  <div className="flex items-center space-x-4">
                    <div className={`p-3 rounded-lg text-white ${action.color} group-hover:scale-110 transition-transform`}>
                      {action.icon}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {action.title}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {action.description}
                      </p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Statistics Cards */}
        <section className="mb-8">
          <SectionErrorBoundary name="Statistics">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {statCards.map((card, index) => (
                <StatCard
                  key={card.title}
                  title={card.title}
                  icon={card.icon}
                  value={card.value}
                  bgColor={card.bgColor}
                  borderColor={card.borderColor}
                  isLoading={isLoading}
                  index={index}
                />
              ))}
            </div>
          </SectionErrorBoundary>
        </section>        {/* Recent Emails Section */}
        <section className="mb-8">
          <SectionErrorBoundary name="Recent Emails">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700"
            >            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <Inbox size={20} className="text-blue-600 dark:text-blue-400" />
                Recent Emails
              </h2>
              <div className="flex items-center space-x-2">
                <Link 
                  to="/inbox" 
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm flex items-center gap-1 transition-colors"
                >
                  View all <Archive size={14} />
                </Link>
              </div>
            </div>
            
            {/* Email Search Bar */}
            <div className="mb-4">
              <SearchBar 
                onSearch={handleEmailSearch}
                onFilter={handleEmailFilter}
                placeholder="Search recent emails..."
                className="max-w-md"
              />
            </div>
            
            <EmailList useVirtualScroll={false} />
          </motion.div>
          </SectionErrorBoundary>
        </section>

        {/* Storage & Sync Status Row */}
        <section className="mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Storage Usage */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <HardDrive size={20} className="text-purple-600 dark:text-purple-400" />
                  Storage Usage
                </h3>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {formatBytes(storageInfo.used)} / {formatBytes(storageInfo.total)}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-3">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${storageInfo.percentage}%` }}
                  transition={{ delay: 0.8, duration: 1 }}
                  className={`h-3 rounded-full ${
                    storageInfo.percentage > 80 
                      ? 'bg-red-500' 
                      : storageInfo.percentage > 60 
                      ? 'bg-yellow-500' 
                      : 'bg-green-500'
                  }`}
                ></motion.div>
              </div>

              {/* Breakdown labels */}
              <div className="space-y-2 mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
                    IndexedDB (Emails & Drafts)
                  </span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {formatBytes(storageInfo.indexedDb.bytes)}
                  </span>
                </div>
                {/* Table sub-breakdown */}
                {Object.keys(storageInfo.indexedDb.tables).length > 0 && (
                  <div className="ml-5 space-y-0.5">
                    {Object.entries(storageInfo.indexedDb.tables)
                      .filter(([, t]) => t.count > 0)
                      .map(([name, t]) => (
                        <div key={name} className="flex justify-between text-xs text-gray-500 dark:text-gray-500">
                          <span>{name} ({t.count})</span>
                          <span>{formatBytes(t.bytes)}</span>
                        </div>
                      ))}
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                    LocalStorage (Settings & Accounts)
                  </span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {formatBytes(storageInfo.localStorage.bytes)}
                  </span>
                </div>
              </div>

              {storageInfo.percentage > 80 && (
                <p className="text-sm text-red-500 dark:text-red-400 flex items-center gap-1 mt-2">
                  <AlertCircle size={14} />
                  Storage almost full
                </p>
              )}
            </motion.div>

            {/* Sync Status */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  {syncStatus.isRealTime ? (
                    <Radio size={20} className="text-green-600 dark:text-green-400 animate-pulse" />
                  ) : syncStatus.isOnline ? (
                    <Wifi size={20} className="text-green-600 dark:text-green-400" />
                  ) : (
                    <WifiOff size={20} className="text-red-600 dark:text-red-400" />
                  )}
                  Sync Status
                </h3>
                <span className={`text-sm px-2 py-1 rounded-full flex items-center gap-1 ${
                  syncStatus.isRealTime
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                    : syncStatus.isOnline 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                }`}>
                  {syncStatus.isRealTime && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                  )}
                  {syncStatus.isRealTime ? 'Live' : syncStatus.isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              
              {/* Info note */}
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 flex items-start gap-1.5">
                <span className="text-blue-500 dark:text-blue-400 mt-0.5 shrink-0">ℹ</span>
                <span>
                  {syncStatus.isRealTime 
                    ? 'Real-time WebSocket connection active. Updates sync instantly when server detects changes.'
                    : syncStatus.isOnline 
                      ? 'WebSocket disconnected. Using manual sync mode - click "Sync Now" or "Reconnect" to update.'
                      : 'You\'re offline. Changes will sync when connection is restored.'}
                </span>
              </p>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Mode:</span>
                  <span className={`text-sm font-medium ${
                    syncStatus.isRealTime 
                      ? 'text-emerald-600 dark:text-emerald-400' 
                      : 'text-gray-900 dark:text-gray-100'
                  }`}>
                    {syncStatus.isRealTime ? 'Real-time Sync' : 'Manual Sync'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Last sync:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {syncStatus.lastSync}
                  </span>
                </div>
                {syncState.lastSyncError && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Error:</span>
                    <span className="text-sm font-medium text-red-600 dark:text-red-400 truncate max-w-37.5" title={syncState.lastSyncError}>
                      {syncState.lastSyncError}
                    </span>
                  </div>
                )}
                {syncStatus.pendingSync > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Pending:</span>
                    <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
                      {syncStatus.pendingSync} changes
                    </span>
                  </div>
                )}
                
                {/* Action buttons */}
                <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={async () => {
                      const result = await triggerSync();
                      if (!result.success && result.error) {
                        toast.info(result.error);
                      } else if (result.success) {
                        toast.success(`Synced ${result.updated} items`);
                      }
                    }}
                    disabled={syncState.isSyncing}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <RefreshCw size={14} className={syncState.isSyncing ? 'animate-spin' : ''} />
                    {syncState.isSyncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                  {!syncStatus.isRealTime && syncStatus.isOnline && (
                    <button
                      onClick={() => refreshConnection()}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                    >
                      <Radio size={14} />
                      Reconnect
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Recent Activity */}
        <section className="mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.5 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700"
          >
            <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100 mb-4">
              <Clock size={20} className="text-indigo-600 dark:text-indigo-400" />
              Recent Activity
            </h3>
            <div className="space-y-3">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No recent activity. Sync your inbox to see updates here.
                </p>
              ) : recentActivity.map((activity, index) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.8 + index * 0.1, duration: 0.3 }}
                  className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="shrink-0">
                    {activity.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                      {activity.description}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {activity.timestamp}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="mt-4 text-center">
              <Link
                to="/inbox"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm flex items-center justify-center gap-1 transition-colors"
              >
                View all in Inbox <Calendar size={14} />
              </Link>
            </div>          </motion.div>
        </section>

        {/* Quick Folders Access */}
        <section className="mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700"
          >
            <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100 mb-4">
              <Folder size={20} className="text-amber-600 dark:text-amber-400" />
              Quick Folder Access
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                { name: 'Inbox', count: emailStats.unread, bgColor: 'bg-blue-500', hoverColor: 'group-hover:bg-blue-600', href: '/inbox' },
                { name: 'Sent', count: emailStats.sent, bgColor: 'bg-green-500', hoverColor: 'group-hover:bg-green-600', href: '/sent' },
                { name: 'Drafts', count: emailStats.drafts, bgColor: 'bg-orange-500', hoverColor: 'group-hover:bg-orange-600', href: '/drafts' },
                { name: 'Starred', count: starredCount, bgColor: 'bg-yellow-500', hoverColor: 'group-hover:bg-yellow-600', href: '/inbox' },
              ].map((folder, index) => (
                <motion.div
                  key={folder.name}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.9 + index * 0.05, duration: 0.3 }}
                >
                  <Link
                    to={folder.href}
                    className="block p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 transition-colors cursor-pointer group"
                  >
                    <div className="text-center">
                      <div className={`w-8 h-8 mx-auto mb-1 rounded-full flex items-center justify-center text-white ${folder.bgColor} ${folder.hoverColor} transition-colors`}>
                        <Folder size={16} />
                      </div>
                      <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                        {folder.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {folder.count}
                      </p>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* Debug Section (Development only) */}
        {process.env.NODE_ENV === 'development' && (
          <section className="mb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg shadow-sm p-6 border border-yellow-200 dark:border-yellow-800"
            >
              <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-4">
                🛠️ Development Tools
              </h3>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleDebugTabSession}
                  variant="outline"
                  size="small"
                  className="border-yellow-300 dark:border-yellow-600 text-yellow-700 dark:text-yellow-300"
                >
                  Debug Tab Session
                </Button>
                <Button
                  onClick={handleClearTabValidation}
                  variant="outline"
                  size="small"
                  className="border-yellow-300 dark:border-yellow-600 text-yellow-700 dark:text-yellow-300"
                >
                  Clear Tab Validation
                </Button>
                <Button
                  onClick={handleHardReload}
                  variant="outline"
                  size="small"
                  className="border-yellow-300 dark:border-yellow-600 text-yellow-700 dark:text-yellow-300"
                >
                  Hard Reload Page
                </Button>
              </div>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                Current theme: {theme} | Resolved: {resolvedTheme} | User: {user?.email}
              </p>
            </motion.div>
          </section>
        )}
      </motion.main>
      </div>
    </div>
  );
};

export default DashboardPage;
