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

    // Skip if already initializing or initialized
    if (initializingRef.current || deltaSyncManager.isReady()) {
      return;
    }

    const initializeSync = async () => {
      initializingRef.current = true;

      try {
        console.info('[SyncContext] Fetching WebSocket token...');
        const token = await fetchWebSocketToken();
        
        if (token) {
          console.info('[SyncContext] WebSocket token obtained, initializing delta sync');
          await deltaSyncManager.initialize(token, fetchWebSocketToken);
        } else {
          console.warn('[SyncContext] Failed to get WebSocket token, running in manual sync mode');
          initializingRef.current = false;
        }
      } catch (error) {
        console.warn('[SyncContext] Failed to initialize real-time sync:', error);
        initializingRef.current = false;
      }
    };

    initializeSync();
  }, [isAuthenticated, fetchWebSocketToken]);

  // Manual sync trigger
  const triggerSync = useCallback(async (): Promise<DeltaSyncResult> => {
    try {
      return await deltaSyncManager.manualSync();
    } catch (error: any) {
      console.error('[SyncContext] Manual sync failed:', error);
      return {
        success: false,
        tables: [],
        updated: 0,
        deleted: 0,
        error: error.message
      };
    }
  }, []);

  // Full sync trigger
  const triggerFullSync = useCallback(async (): Promise<DeltaSyncResult> => {
    try {
      return await deltaSyncManager.fullSync();
    } catch (error: any) {
      console.error('[SyncContext] Full sync failed:', error);
      return {
        success: false,
        tables: [],
        updated: 0,
        deleted: 0,
        error: error.message
      };
    }
  }, []);

  // Refresh connection (force reconnect with new token)
  const refreshConnection = useCallback(async (): Promise<void> => {
    if (!isAuthenticated) return;
    
    try {
      const refreshed = await deltaSyncManager.refreshTokenAndReconnect();
      if (!refreshed) {
        console.warn('[SyncContext] Failed to refresh connection');
      }
    } catch (error) {
      console.error('[SyncContext] Error refreshing connection:', error);
    }
  }, [isAuthenticated]);

  // Computed values
  const isRealTimeActive = syncState.connectionStatus === 'connected';
  const isSyncing = syncState.isSyncing;

  const value = useMemo<SyncContextValue>(() => ({
    syncState,
    isRealTimeActive,
    isSyncing,
    triggerSync,
    triggerFullSync,
    refreshConnection
  }), [syncState, isRealTimeActive, isSyncing, triggerSync, triggerFullSync, refreshConnection]);

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
};

// ============================================================================
// Hook
// ============================================================================

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
