import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode
} from 'react';
import { apiFetch } from '@/lib/apiFetch';

interface ServerStatusContextValue {
  isServerDown: boolean;
  lastError: string | null;
  lastStatus: number | null;
  firstDetectedAt: number | null;
  lastDetectedAt: number | null;
  retryIntervalMs: number;
  minimized: boolean;
  setMinimized: (value: boolean) => void;
  clearServerDown: () => void;
}

const SERVER_MINIMIZED_KEY = 'mailvoyage-server-down-minimized';
const SERVER_RETRY_INTERVAL_MS = 60 * 1000;

const ServerStatusContext = createContext<ServerStatusContextValue | null>(null);

export function ServerStatusProvider({ children }: { children: ReactNode }) {
  const [isServerDown, setIsServerDown] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<number | null>(null);
  const [firstDetectedAt, setFirstDetectedAt] = useState<number | null>(null);
  const [lastDetectedAt, setLastDetectedAt] = useState<number | null>(null);
  const [minimized, setMinimizedState] = useState(() => {
    try {
      return localStorage.getItem(SERVER_MINIMIZED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const setMinimized = useCallback((value: boolean) => {
    setMinimizedState(value);
    try {
      localStorage.setItem(SERVER_MINIMIZED_KEY, value ? 'true' : 'false');
    } catch {
      // Ignore storage errors.
    }
  }, []);

  const clearServerDown = useCallback(() => {
    setIsServerDown(false);
    setLastError(null);
    setLastStatus(null);
    setFirstDetectedAt(null);
    setLastDetectedAt(null);
  }, []);

  useEffect(() => {
    const handleServerDown = (event: Event) => {
      const customEvent = event as CustomEvent<{ message?: string; status?: number }>;
      const now = Date.now();

      setIsServerDown(true);
      setLastDetectedAt(now);
      setLastError(customEvent.detail?.message || 'Server unavailable');
      setLastStatus(typeof customEvent.detail?.status === 'number' ? customEvent.detail.status : null);
      setFirstDetectedAt(prev => prev ?? now);
    };

    const handleServerUp = () => {
      clearServerDown();
    };

    window.addEventListener('server:down', handleServerDown as EventListener);
    window.addEventListener('server:up', handleServerUp as EventListener);

    return () => {
      window.removeEventListener('server:down', handleServerDown as EventListener);
      window.removeEventListener('server:up', handleServerUp as EventListener);
    };
  }, [clearServerDown]);

  const retryInFlightRef = useRef(false);
  useEffect(() => {
    if (!isServerDown) return;

    const intervalId = window.setInterval(() => {
      if (!navigator.onLine || retryInFlightRef.current) return;
      retryInFlightRef.current = true;

      apiFetch('/api/auth/validate-token')
        .catch(() => {
          // Ignore - server:down stays until a successful response clears it.
        })
        .finally(() => {
          retryInFlightRef.current = false;
        });
    }, SERVER_RETRY_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [isServerDown]);

  const value = useMemo<ServerStatusContextValue>(() => ({
    isServerDown,
    lastError,
    lastStatus,
    firstDetectedAt,
    lastDetectedAt,
    retryIntervalMs: SERVER_RETRY_INTERVAL_MS,
    minimized,
    setMinimized,
    clearServerDown
  }), [isServerDown, lastError, lastStatus, firstDetectedAt, lastDetectedAt, minimized, setMinimized, clearServerDown]);

  return (
    <ServerStatusContext.Provider value={value}>
      {children}
    </ServerStatusContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useServerStatus(): ServerStatusContextValue {
  const context = useContext(ServerStatusContext);

  if (!context) {
    throw new Error('useServerStatus must be used within ServerStatusProvider');
  }

  return context;
}
