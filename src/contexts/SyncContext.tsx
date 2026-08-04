/**
 * Sync Context for MailVoyage
 * 
 * Provides sync state to React components.
 * - Manages WebSocket connection lifecycle
 * - Exposes sync state (online/offline, last sync, etc.)
 * - Integrates with AuthContext for automatic connection on login
 */

import React, { 
  createContext, 
  useContext, 
  useEffect, 
  useState, 
  useCallback,
  useMemo,
  useRef,
  type ReactNode 
} from 'react';
import { deltaSyncManager, type SyncState, type DeltaSyncResult } from '@/lib/deltaSync';
import { AuthContext } from './AuthContext';
import { apiFetch } from '@/lib/apiFetch';

// ============================================================================
// Types
// ============================================================================

export interface SyncContextValue {
  /** Current sync state */
  syncState: SyncState;
  
  /** Whether real-time sync (WebSocket) is active */
  isRealTimeActive: boolean;
  
  /** Whether currently syncing */
  isSyncing: boolean;
  
  /** Trigger manual sync */
  triggerSync: () => Promise<DeltaSyncResult>;
  
  /** Trigger full sync (ignore checkpoints) */
  triggerFullSync: () => Promise<DeltaSyncResult>;

  /** Trigger sent-mails-only sync */
  triggerSentSync: () => Promise<DeltaSyncResult>;
  
  /** Refresh WebSocket connection */
  refreshConnection: () => Promise<void>;
}

// ============================================================================
// Context
// ============================================================================

const SyncContext = createContext<SyncContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface SyncProviderProps {
  children: ReactNode;
}

export const SyncProvider: React.FC<SyncProviderProps> = ({ children }) => {
  // Use AuthContext directly instead of useAuth() to handle HMR edge cases
  // where the context might not be available during hot module replacement
  const authContext = useContext(AuthContext);
  const isAuthenticated = authContext?.isAuthenticated ?? false;
  const initializingRef = useRef(false);
  
  const [syncState, setSyncState] = useState<SyncState>(() => {
    // Initialize from deltaSyncManager if already initialized
    const currentState = deltaSyncManager.getState();
    return currentState;
  });

  // Token refresh callback for WebSocket reconnection
  const fetchWebSocketToken = useCallback(async (): Promise<string | null> => {
    try {
      const response = await apiFetch('/api/auth/ws-token');
      if (response.success && response.token) {
        return response.token;
      }
    } catch (error) {
      console.warn('[SyncContext] Failed to fetch WebSocket token:', error);
    }
    return null;
  }, []);

  // Always subscribe to deltaSyncManager state changes when authenticated
  // This is separate from initialization to handle React StrictMode and navigation
  useEffect(() => {
    if (!isAuthenticated) return;

    // Subscribe to state changes - always do this, even if already initialized
    const unsubscribe = deltaSyncManager.subscribe((state) => {
      setSyncState(state);
    });

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated]);

  // Initialize delta sync connection (WebSocket) when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      // Reset state when logged out
      initializingRef.current = false;
      deltaSyncManager.shutdown();
      return;
    }

    // If the manager is already initialized AND connected, nothing to do.
    if (deltaSyncManager.isReady()) {
      const state = deltaSyncManager.getState();
      if (state.connectionStatus === 'connected') {
        return; // Already connected — no action needed
      }
      // Manager is initialized but WebSocket is not connected — shut down
      // and re-initialize to get a fresh connection.
      console.info('[SyncContext] Manager initialized but WebSocket not connected, re-initializing...');
      deltaSyncManager.shutdown();
    }

    // Guard against duplicate concurrent initialization attempts (e.g. React
    // StrictMode double-invoke). We reset this guard in the cleanup so a
    // subsequent mount can proceed. `deltaSyncManager.initialize()` has its
    // own `isInitialized` guard, so even if two attempts race, only the
    // first will actually connect; the second will no-op.
    if (initializingRef.current) {
      return;
    }

    // Use AbortController-style flag so async work aborts if cleanup runs
    // (logout or StrictMode teardown) before the async init completes.
    let cancelled = false;

    const initializeSync = async () => {
      initializingRef.current = true;

      try {
        console.info('[SyncContext] Fetching WebSocket token...');
        const token = await fetchWebSocketToken();

        // If auth was revoked while we were fetching, abort
        if (cancelled) {
          initializingRef.current = false;
          return;
        }
        
        if (token) {
          console.info('[SyncContext] WebSocket token obtained, initializing delta sync');
          await deltaSyncManager.initialize(token, fetchWebSocketToken);
        } else {
          console.warn('[SyncContext] Failed to get WebSocket token, running in manual sync mode');
        }
      } catch (error) {
        console.warn('[SyncContext] Failed to initialize real-time sync:', error);
      } finally {
        // Always reset the guard so a future re-mount (StrictMode or after
        // a failed attempt) can retry. `deltaSyncManager.isReady()` is the
        // source of truth for whether initialization succeeded.
        initializingRef.current = false;
      }
    };

    initializeSync();

    return () => {
      cancelled = true;
      // Reset the initializing guard on cleanup so a subsequent mount
      // (e.g. React StrictMode double-invoke or re-render after a failed
      // attempt) can re-run initialization. Without this, the guard stays
      // true forever if the async init is cancelled mid-flight, which
      // prevents the WebSocket from ever connecting after a page refresh.
      initializingRef.current = false;
    };
  }, [isAuthenticated, fetchWebSocketToken]);

  // Manual sync trigger
  const triggerSync = useCallback(async (): Promise<DeltaSyncResult> => {
    try {
      return await deltaSyncManager.manualSync();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[SyncContext] Manual sync failed:', error);
      return {
        success: false,
        tables: [],
        updated: 0,
        deleted: 0,
        error: message
      };
    }
  }, []);

  // Full sync trigger
  const triggerFullSync = useCallback(async (): Promise<DeltaSyncResult> => {
    try {
      return await deltaSyncManager.fullSync();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[SyncContext] Full sync failed:', error);
      return {
        success: false,
        tables: [],
        updated: 0,
        deleted: 0,
        error: message
      };
    }
  }, []);

  // Sent-mails-only sync trigger
  const triggerSentSync = useCallback(async (): Promise<DeltaSyncResult> => {
    try {
      return await deltaSyncManager.syncSentMailsOnly();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[SyncContext] Sent sync failed:', error);
      return {
        success: false,
        tables: [],
        updated: 0,
        deleted: 0,
        error: message
      };
    }
  }, []);

  // Refresh connection (force reconnect with new token)
  const refreshConnection = useCallback(async (): Promise<void> => {
    if (!isAuthenticated) return;
    
    try {
      // If the manager was shut down (e.g. after a disconnect or navigation),
      // fully re-initialize it with a fresh token instead of trying to
      // reconnect on a dead instance.
      if (!deltaSyncManager.isReady()) {
        console.info('[SyncContext] Sync manager not initialized, doing full re-init...');
        const token = await fetchWebSocketToken();
        if (token) {
          await deltaSyncManager.initialize(token, fetchWebSocketToken);
          return;
        }
        console.warn('[SyncContext] Failed to fetch token for re-init');
        return;
      }

      // Manager is still alive — try token refresh first
      const refreshed = await deltaSyncManager.refreshTokenAndReconnect();
      if (!refreshed) {
        const token = await fetchWebSocketToken();
        if (token) {
          const rebound = deltaSyncManager.reconnectWithToken(token, fetchWebSocketToken);
          if (!rebound) {
            console.warn('[SyncContext] Failed to reconnect with fallback token');
          }
        } else {
          console.warn('[SyncContext] Failed to fetch fallback token');
        }
      }
    } catch (error) {
      console.error('[SyncContext] Error refreshing connection:', error);
    }
  }, [isAuthenticated, fetchWebSocketToken]);

  // Computed values
  const isRealTimeActive = syncState.connectionStatus === 'connected';
  const isSyncing = syncState.isSyncing;

  const value = useMemo<SyncContextValue>(() => ({
    syncState,
    isRealTimeActive,
    isSyncing,
    triggerSync,
    triggerFullSync,
    triggerSentSync,
    refreshConnection
  }), [syncState, isRealTimeActive, isSyncing, triggerSync, triggerFullSync, triggerSentSync, refreshConnection]);

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
};

// ============================================================================
// Hook
// ============================================================================

// eslint-disable-next-line react-refresh/only-export-components
export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  
  if (!context) {
    // Return a default value if used outside provider (graceful degradation)
    // Use debug level to avoid noise during React StrictMode double-render
    console.debug('[useSync] Used outside SyncProvider, returning default state');
    return {
      syncState: {
        isOnline: navigator.onLine,
        connectionStatus: 'disconnected',
        lastSync: null,
        lastSyncError: null,
        pendingChanges: 0,
        isSyncing: false
      },
      isRealTimeActive: false,
      isSyncing: false,
      triggerSync: async () => ({ success: false, tables: [], updated: 0, deleted: 0, error: 'No SyncProvider' }),
      triggerFullSync: async () => ({ success: false, tables: [], updated: 0, deleted: 0, error: 'No SyncProvider' }),
      triggerSentSync: async () => ({ success: false, tables: [], updated: 0, deleted: 0, error: 'No SyncProvider' }),
      refreshConnection: async () => {}
    };
  }
  
  return context;
}

// ============================================================================
// Utility Hook: Connection Status
// ============================================================================

/**
 * Simple hook for connection status only
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useConnectionStatus(): {
  isOnline: boolean;
  isRealTime: boolean;
  status: string;
} {
  const { syncState, isRealTimeActive } = useSync();
  
  return {
    isOnline: syncState.isOnline,
    isRealTime: isRealTimeActive,
    status: isRealTimeActive ? 'Live' : (syncState.isOnline ? 'Online' : 'Offline')
  };
}

export default SyncContext;
