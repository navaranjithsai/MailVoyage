import { useState, useEffect, useCallback } from 'react';
import {
  getOfflineQueue,
  removeFromOfflineQueue,
  clearOfflineQueue,
  processOfflineQueue,
  subscribeToQueueUpdates,
  isOnline,
  setupOnlineListeners,
  type OfflineQueueItem
} from '@/lib/serviceWorker';
import Button from './ui/Button';
import { Wifi, WifiOff, Trash2, RefreshCw, Clock, Send, X, ChevronDown, ChevronUp } from 'lucide-react';

interface OfflineQueueManagerProps {
  className?: string;
  compact?: boolean;
}

export function OfflineQueueManager({ className = '', compact = false }: OfflineQueueManagerProps) {
  const [queue, setQueue] = useState<OfflineQueueItem[]>([]);
  const [online, setOnline] = useState(isOnline());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Initial load
    setQueue(getOfflineQueue());

    // Subscribe to queue updates
    const unsubscribeQueue = subscribeToQueueUpdates(setQueue);

    // Listen for online/offline changes
    const cleanupListeners = setupOnlineListeners(
      () => setOnline(true),
      () => setOnline(false)
    );

    return () => {
      unsubscribeQueue();
      cleanupListeners();
    };
  }, []);

  const handleProcess = useCallback(async () => {
    if (!online || isProcessing) return;

    setIsProcessing(true);
    try {
      await processOfflineQueue();
    } finally {
      setIsProcessing(false);
    }
  }, [online, isProcessing]);

  const handleRemove = useCallback((id: string) => {
    removeFromOfflineQueue(id);
  }, []);

  const handleClearAll = useCallback(() => {
    if (confirm('Are you sure you want to clear all pending items?')) {
      clearOfflineQueue();
    }
  }, []);

  const getActionDescription = (item: OfflineQueueItem): string => {
    if (item.description) return item.description;

    // Parse URL to determine action type
    const url = item.url;
    if (url.includes('/mail/send')) return 'Send Email';
    if (url.includes('/drafts')) return item.method === 'POST' ? 'Save Draft' : 'Update Draft';
    if (url.includes('/sent-mails')) return 'Save Sent Mail';
    if (url.includes('/email-accounts')) return 'Update Email Account';
    
    return `${item.method} request`;
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  // Don't show if there's nothing in the queue and we're online
  if (queue.length === 0 && online) {
    return null;
  }

  // Compact version - just a badge
  if (compact && queue.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {!online && (
          <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400 text-sm">
            <WifiOff className="w-4 h-4" />
            <span>Offline</span>
          </div>
        )}
        {queue.length > 0 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full text-sm font-medium hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"
          >
            <Clock className="w-3 h-3" />
            <span>{queue.length} pending</span>
            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}

        {/* Dropdown panel */}
        {isExpanded && queue.length > 0 && (
          <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50">
            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900 dark:text-white">Pending Actions</h3>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {queue.map(item => (
                <div key={item.id} className="p-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {getActionDescription(item)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatTime(item.timestamp)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemove(item.id)}
                      className="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {queue.length > 0 && (
              <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex gap-2">
                <Button
                  size="small"
                  variant="outline"
                  className="flex-1"
                  onClick={handleClearAll}
                >
                  Clear All
                </Button>
                {online && (
                  <Button
                    size="small"
                    className="flex-1"
                    onClick={handleProcess}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <Send className="w-3 h-3 mr-1" />
                        Sync Now
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Full version
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {online ? (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <Wifi className="w-5 h-5" />
                <span className="font-medium">Online</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                <WifiOff className="w-5 h-5" />
                <span className="font-medium">Offline</span>
              </div>
            )}
            {queue.length > 0 && (
              <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full text-sm font-medium">
                {queue.length} pending
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {queue.length > 0 && (
              <>
                <Button
                  size="small"
                  variant="ghost"
                  onClick={handleClearAll}
                  className="text-gray-500 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                {online && (
                  <Button
                    size="small"
                    onClick={handleProcess}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-1" />
                        Sync Now
                      </>
                    )}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Queue items */}
      {queue.length === 0 ? (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No pending actions</p>
          {!online && (
            <p className="text-sm mt-1">
              Your actions will be saved here when offline
            </p>
          )}
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {queue.map(item => (
            <div
              key={item.id}
              className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-medium">
                      {item.method}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {getActionDescription(item)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
                    {item.url}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    <Clock className="w-3 h-3 inline mr-1" />
                    {formatTime(item.timestamp)}
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(item.id)}
                  className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Remove from queue"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer info */}
      {!online && queue.length > 0 && (
        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border-t border-yellow-100 dark:border-yellow-900/30">
          <p className="text-sm text-yellow-700 dark:text-yellow-400 text-center">
            These actions will be sent automatically when you're back online
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Offline indicator badge component
 */
export function OfflineIndicator({ className = '' }: { className?: string }) {
  const [online, setOnline] = useState(isOnline());

  useEffect(() => {
    const cleanup = setupOnlineListeners(
      () => setOnline(true),
      () => setOnline(false)
    );
    return cleanup;
  }, []);

  if (online) return null;

  return (
    <div className={`flex items-center gap-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-full text-sm font-medium ${className}`}>
      <WifiOff className="w-4 h-4" />
      <span>Offline</span>
    </div>
  );
}

export default OfflineQueueManager;
