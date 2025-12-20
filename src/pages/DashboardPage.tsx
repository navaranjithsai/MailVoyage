import React, { useEffect, useState, useCallback, memo } from 'react';
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
  Trash2,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useEmail } from '@/contexts/EmailContext';
import Button from '@/components/ui/Button';
import EmailList from '@/components/email/EmailList';
import SearchBar from '@/components/email/SearchBar';
import { toast } from '@/lib/toast';
import { fetchAll, fetchDraftsCount, type FetchProgress } from '@/lib/dataSync';
import { SectionErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineIndicator } from '@/components/OfflineQueueManager';
import { usePullToRefresh, PullToRefreshIndicator } from '@/hooks/usePullToRefresh';
// Service worker utilities available via lib/serviceWorker.ts

// Mock data for email statistics - replace with actual API calls
interface EmailStats {
  unread: number;
  total: number;
  sent: number;
  drafts: number;
}

// Storage and sync status interfaces
interface StorageInfo {
  used: number; // in MB
  total: number; // in MB
  percentage: number;
}

interface SyncStatus {
  isOnline: boolean;
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

const DashboardPage: React.FC = () => {
  const { user, logout, getTabSessionInfo, clearTabValidation } = useAuth();
  const { theme, resolvedTheme } = useTheme();
  const { emails, unreadCount, pingNewEmail } = useEmail();
  const navigate = useNavigate();
  
  const [emailStats, setEmailStats] = useState<EmailStats>({
    unread: unreadCount,
    total: emails.length,
    sent: 0, // This would come from a different context/API in real app
    drafts: 0 // This would come from a different context/API in real app
  });
  const [storageInfo, setStorageInfo] = useState<StorageInfo>({
    used: 0,
    total: 1000,
    percentage: 0
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: navigator.onLine,
    lastSync: 'Never',
    pendingSync: 0
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
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
        // Fetch real drafts count from IndexedDB
        const draftsCount = await fetchDraftsCount();
        
        // Update with real email data
        setEmailStats({
          unread: unreadCount,
          total: emails.length,
          sent: 0, // Will be updated on manual refresh
          drafts: draftsCount
        });

        // Calculate real storage usage
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          try {
            const estimate = await navigator.storage.estimate();
            const usedMB = Math.round((estimate.usage || 0) / (1024 * 1024));
            const totalMB = Math.round((estimate.quota || 0) / (1024 * 1024));
            const percentage = totalMB > 0 ? (usedMB / totalMB) * 100 : 0;
            
            setStorageInfo({
              used: usedMB,
              total: Math.min(totalMB, 1000), // Cap display at 1GB for readability
              percentage: Math.min(percentage, 100)
            });
          } catch (storageError) {
            console.warn('Could not estimate storage:', storageError);
          }
        }

        setSyncStatus({
          isOnline: navigator.onLine,
          lastSync: 'Not synced yet',
          pendingSync: 0
        });

        // TODO: Replace with real activity from API or local activity log
        setRecentActivity([
          {
            id: 1,
            type: 'received',
            description: 'New email from GitHub Notifications',
            timestamp: '2 min ago',
            icon: <Mail size={16} className="text-blue-500" />
          },
          {
            id: 2,
            type: 'sent',
            description: 'Email sent to team@company.com',
            timestamp: '15 min ago',
            icon: <Send size={16} className="text-green-500" />
          },
          {
            id: 3,
            type: 'starred',
            description: 'Starred important meeting notes',
            timestamp: '1 hour ago',
            icon: <Star size={16} className="text-yellow-500" />
          },
          {
            id: 4,
            type: 'deleted',
            description: 'Cleaned up old promotional emails',
            timestamp: '2 hours ago',
            icon: <Trash2 size={16} className="text-red-500" />
          }
        ]);
      } catch (error) {
        console.error('Error loading dashboard data:', error);
        toast.error('Failed to load dashboard data');
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboardData();

    // Set up online/offline listeners
    const handleOnline = () => setSyncStatus(prev => ({ ...prev, isOnline: true }));
    const handleOffline = () => setSyncStatus(prev => ({ ...prev, isOnline: false }));
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [unreadCount, emails.length]); // Re-run when email data changes

  // Handle progress updates from fetchAll
  const handleFetchProgress = useCallback((progress: FetchProgress) => {
    setRefreshProgress(progress.message);
    console.log('📊 Sync progress:', progress.step, progress.message);
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setRefreshProgress('Starting sync...');
    
    try {
      // Call the actual API sync function
      const results = await fetchAll(handleFetchProgress, {
        fetchAccounts: true,
        fetchInbox: true,
        fetchSent: true,
        invalidateCache: true
      });
      
      // Update email stats based on results
      const newStats = { ...emailStats };
      
      if (results.sentMails.success && results.sentMails.data) {
        newStats.sent = results.sentMails.data.total;
      }
      
      if (results.inbox.success && results.inbox.data) {
        newStats.total = results.inbox.data.total;
      }
      
      // Update drafts count from local storage
      newStats.drafts = results.draftsCount;
      newStats.unread = unreadCount;
      
      setEmailStats(newStats);
      
      // Update sync status
      setSyncStatus(prev => ({
        ...prev,
        lastSync: new Date().toLocaleTimeString(),
        pendingSync: 0
      }));
      
      // Show success/partial success message
      const successCount = [
        results.emailAccounts.success,
        results.sentMails.success,
        results.inbox.success
      ].filter(Boolean).length;
      
      if (successCount === 3) {
        toast.success('Dashboard synced successfully');
      } else if (successCount > 0) {
        toast.info(`Partial sync complete (${successCount}/3 succeeded)`);
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
  }, [handleFetchProgress, emailStats, unreadCount]);

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

  const handlePingMail = () => {
    pingNewEmail();
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
                  to="/email" 
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
                  {storageInfo.used} MB / {storageInfo.total} MB
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-2">
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
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {storageInfo.percentage.toFixed(1)}% used
                {storageInfo.percentage > 80 && (
                  <span className="ml-2 text-red-500 dark:text-red-400 flex items-center gap-1">
                    <AlertCircle size={14} />
                    Storage almost full
                  </span>
                )}
              </p>
            </motion.div>

            {/* Sync Status */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  {syncStatus.isOnline ? (
                    <Wifi size={20} className="text-green-600 dark:text-green-400" />
                  ) : (
                    <WifiOff size={20} className="text-red-600 dark:text-red-400" />
                  )}
                  Sync Status
                </h3>
                <span className={`text-sm px-2 py-1 rounded-full ${
                  syncStatus.isOnline 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                }`}>
                  {syncStatus.isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Last sync:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {syncStatus.lastSync}
                  </span>
                </div>
                {syncStatus.pendingSync > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Pending:</span>
                    <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
                      {syncStatus.pendingSync} emails
                    </span>
                  </div>
                )}
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
              {recentActivity.map((activity, index) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.8 + index * 0.1, duration: 0.3 }}
                  className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex-shrink-0">
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
                to="/activity"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm flex items-center justify-center gap-1 transition-colors"
              >
                View all activity <Calendar size={14} />
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
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {[
                { name: 'Inbox', count: emailStats.unread, bgColor: 'bg-blue-500', hoverColor: 'group-hover:bg-blue-600' },
                { name: 'Sent', count: emailStats.sent, bgColor: 'bg-green-500', hoverColor: 'group-hover:bg-green-600' },
                { name: 'Drafts', count: emailStats.drafts, bgColor: 'bg-orange-500', hoverColor: 'group-hover:bg-orange-600' },
                { name: 'Starred', count: 8, bgColor: 'bg-yellow-500', hoverColor: 'group-hover:bg-yellow-600' },
                { name: 'Archive', count: 45, bgColor: 'bg-gray-500', hoverColor: 'group-hover:bg-gray-600' },
                { name: 'Spam', count: 2, bgColor: 'bg-red-500', hoverColor: 'group-hover:bg-red-600' }
              ].map((folder, index) => (
                <motion.div
                  key={folder.name}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.9 + index * 0.05, duration: 0.3 }}
                  className="p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 transition-colors cursor-pointer group"
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
                  onClick={handlePingMail}
                  variant="outline"
                  size="small"
                  className="border-yellow-300 dark:border-yellow-600 text-yellow-700 dark:text-yellow-300"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Ping Mail
                </Button>
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
