import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import { apiFetch } from '@/lib/apiFetch';
import { useServerStatus } from '@/contexts/ServerStatusContext';

const formatTime = (timestamp: number | null): string => {
  if (!timestamp) return 'just now';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const ServerStatusOverlay: React.FC = () => {
  const {
    isServerDown,
    lastError,
    lastStatus,
    firstDetectedAt,
    retryIntervalMs,
    minimized,
    setMinimized
  } = useServerStatus();
  const navigate = useNavigate();

  const [isRetrying, setIsRetrying] = useState(false);

  const sinceText = useMemo(() => formatTime(firstDetectedAt), [firstDetectedAt]);
  const statusLabel = useMemo(() => {
    if (!lastStatus) return 'Network issue';
    return `HTTP ${lastStatus}`;
  }, [lastStatus]);
  const retrySeconds = Math.max(1, Math.round(retryIntervalMs / 1000));
  const titleText = lastStatus ? 'Server error detected' : 'Server unreachable';
  const descriptionText = lastStatus
    ? 'The backend is responding with errors. We will keep retrying automatically.'
    : 'We cannot reach the backend right now. Syncing is paused while we retry.';

  const handleRetry = useCallback(async () => {
    if (isRetrying) return;

    setIsRetrying(true);
    try {
      await apiFetch('/api/auth/validate-token');
    } catch {
      // Ignore - overlay will remain until server is reachable.
    } finally {
      setIsRetrying(false);
    }
  }, [isRetrying]);

  if (!isServerDown) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {minimized ? (
        <button
          className="flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 shadow-md transition hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
          onClick={() => setMinimized(false)}
          type="button"
          aria-label="Expand server status"
        >
          <AlertTriangle className="h-4 w-4" />
          <span>{titleText}</span>
          <ChevronUp className="h-4 w-4" />
        </button>
      ) : (
        <div className="w-80 rounded-2xl border border-amber-200 bg-white/95 p-4 shadow-xl backdrop-blur dark:border-amber-700 dark:bg-gray-900/95">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {titleText}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {descriptionText}
                </p>
              </div>
            </div>
            <button
              className="text-gray-400 transition hover:text-gray-700 dark:hover:text-gray-200"
              onClick={() => setMinimized(true)}
              type="button"
              aria-label="Minimize server status"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-200">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 dark:border-amber-800 dark:bg-amber-900/30">
              {statusLabel}
            </span>
            <span>Since {sinceText}</span>
            <span>Auto-retry every {retrySeconds}s</span>
          </div>

          {lastError && (
            <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-100">
              {lastError}
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            <Button
              size="small"
              className="flex-1"
              onClick={handleRetry}
              disabled={isRetrying}
            >
              {isRetrying ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span className="ml-2">Retrying</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  <span className="ml-2">Retry now</span>
                </>
              )}
            </Button>
            <Button
              size="small"
              variant="ghost"
              onClick={() => navigate('/server-error')}
            >
              View status
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServerStatusOverlay;
