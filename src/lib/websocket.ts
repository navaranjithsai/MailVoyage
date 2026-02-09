/**
 * WebSocket Client for MailVoyage
 * 
 * Graceful WebSocket connection with automatic reconnection and fallback.
 * Never crashes the app - logs warnings and degrades to manual sync mode.
 */

// ============================================================================
// Types
// ============================================================================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'auth_failed';

export interface SyncSignal {
  type: 'sync_required' | 'heartbeat' | 'pong' | 'connected' | 'error' | 'auth_failed'
      | 'inbox_sync_complete' | 'settings_updated' | 'inbox_new_mail';
  tables?: string[];
  since?: string;
  message?: string;
  timestamp: string;
  data?: Record<string, any>;
}

export interface WebSocketConfig {
  /** Base URL for WebSocket (defaults to window.location) */
  baseUrl?: string;
  /** Enable automatic reconnection */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Initial reconnection delay in ms */
  reconnectDelay?: number;
  /** Maximum reconnection delay in ms */
  maxReconnectDelay?: number;
  /** Heartbeat interval in ms */
  heartbeatInterval?: number;
}

type SignalHandler = (signal: SyncSignal) => void;
type StatusHandler = (status: ConnectionStatus) => void;
type AuthFailureHandler = () => void;

// ============================================================================
// WebSocket Client Class
// ============================================================================

class WebSocketClient {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketConfig>;
  private status: ConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private token: string | null = null;
  private isManualDisconnect = false;
  private authFailureCount = 0;
  private isRefreshingToken = false;
  private authFailureDebounceTimeout: ReturnType<typeof setTimeout> | null = null;

  // Event handlers
  private signalHandlers: Set<SignalHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private authFailureHandlers: Set<AuthFailureHandler> = new Set();

  // Default configuration
  private static readonly DEFAULT_CONFIG: Required<WebSocketConfig> = {
    baseUrl: '',
    autoReconnect: true,
    maxReconnectAttempts: 10,
    reconnectDelay: 1000,
    maxReconnectDelay: 30000,
    heartbeatInterval: 25000, // 25 seconds (server expects 30s)
  };

  constructor(config: WebSocketConfig = {}) {
    this.config = { ...WebSocketClient.DEFAULT_CONFIG, ...config };
  }

  /**
   * Connect to WebSocket server with authentication
   */
  connect(token: string): void {
    if (!token) {
      console.warn('[WebSocket] No token provided, cannot connect');
      return;
    }

    // Check if WebSocket is supported
    if (typeof WebSocket === 'undefined') {
      console.warn('[WebSocket] WebSocket not supported in this environment');
      this.setStatus('disconnected');
      return;
    }

    this.token = token;
    this.isManualDisconnect = false;
    this.authFailureCount = 0;
    this.doConnect();
  }

  /**
   * Update token for reconnection (used after token refresh)
   */
  updateToken(token: string): void {
    console.info('[WebSocket] Token updated, preparing to reconnect...');
    this.token = token;
    this.authFailureCount = 0;
    this.isRefreshingToken = false;
    
    // Always cleanup and reconnect with new token
    this.cleanup();
    
    // Small delay to ensure cleanup completes
    setTimeout(() => {
      this.doConnect();
    }, 100);
  }

  /**
   * Force reconnection (e.g., after network comes back online)
   */
  reconnect(): void {
    if (!this.token) {
      console.warn('[WebSocket] No token available for reconnection');
      return;
    }

    this.isManualDisconnect = false;
    this.reconnectAttempts = 0;
    
    // Close existing connection if any
    if (this.ws) {
      this.cleanup();
    }
    
    this.doConnect();
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.isManualDisconnect = true;
    this.cleanup();
    this.setStatus('disconnected');
    console.info('[WebSocket] Disconnected');
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.status === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Subscribe to sync signals
   */
  onSignal(handler: SignalHandler): () => void {
    this.signalHandlers.add(handler);
    return () => this.signalHandlers.delete(handler);
  }

  /**
   * Subscribe to status changes
   */
  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    // Immediately call with current status
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  /**
   * Subscribe to auth failures (for token refresh)
   */
  onAuthFailure(handler: AuthFailureHandler): () => void {
    this.authFailureHandlers.add(handler);
    return () => this.authFailureHandlers.delete(handler);
  }

  /**
   * Internal: Perform the connection
   */
  private doConnect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.setStatus('connecting');

    try {
      const wsUrl = this.getWebSocketUrl();
      console.info(`[WebSocket] Connecting to ${wsUrl}`);

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.info('[WebSocket] Connection opened, authenticating...');
        this.reconnectAttempts = 0;
        
        // Send auth message
        this.send({ type: 'auth', token: this.token });
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = () => {
        // Don't log full error to avoid noise - just warn
        console.warn('[WebSocket] Connection error (this is normal if server is unavailable)');
      };

      this.ws.onclose = (event) => {
        console.info(`[WebSocket] Connection closed: ${event.code} - ${event.reason || 'No reason'}`);
        this.handleDisconnect();
      };

    } catch (error) {
      console.warn('[WebSocket] Failed to create connection:', error);
      this.setStatus('disconnected');
      this.scheduleReconnect();
    }
  }

  /**
   * Get WebSocket URL based on current location
   */
  private getWebSocketUrl(): string {
    if (this.config.baseUrl) {
      return this.config.baseUrl;
    }

    // Auto-detect URL based on current page
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    
    // In development, API runs on port 3001
    const port = import.meta.env.DEV ? '3001' : window.location.port;
    
    return `${protocol}//${host}:${port}/ws`;
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    try {
      const signal: SyncSignal = JSON.parse(data);

      switch (signal.type) {
        case 'connected':
          if (signal.message === 'Authentication successful') {
            console.info('[WebSocket] Authenticated successfully');
            this.authFailureCount = 0;
            this.setStatus('connected');
            this.startHeartbeat();
          }
          break;

        case 'heartbeat':
          // Server heartbeat received, respond with ping
          this.send({ type: 'ping' });
          break;

        case 'pong':
          // Our ping was acknowledged
          break;

        case 'sync_required':
          console.info('[WebSocket] Sync signal received:', signal.tables);
          this.notifySignalHandlers(signal);
          break;

        case 'inbox_sync_complete':
        case 'inbox_new_mail':
        case 'settings_updated':
          console.info(`[WebSocket] ${signal.type} signal received:`, signal.message);
          this.notifySignalHandlers(signal);
          break;

        case 'error':
          console.warn('[WebSocket] Server error:', signal.message);
          // Check if it's an auth error
          if (signal.message?.toLowerCase().includes('auth') || 
              signal.message?.toLowerCase().includes('token') ||
              signal.message?.toLowerCase().includes('unauthorized')) {
            this.handleAuthFailure();
          }
          break;

        case 'auth_failed':
          console.warn('[WebSocket] Authentication failed:', signal.message);
          this.handleAuthFailure();
          break;

        default:
          console.debug('[WebSocket] Unknown message type:', signal.type);
      }
    } catch (error) {
      console.warn('[WebSocket] Failed to parse message:', data);
    }
  }

  /**
   * Handle authentication failure
   */
  private handleAuthFailure(): void {
    // Prevent multiple auth failure handling while refreshing
    if (this.isRefreshingToken) {
      console.debug('[WebSocket] Already refreshing token, ignoring auth failure');
      return;
    }
    
    this.authFailureCount++;
    this.setStatus('auth_failed');
    
    // Debounce auth failure notifications to prevent multiple rapid calls
    if (this.authFailureDebounceTimeout) {
      clearTimeout(this.authFailureDebounceTimeout);
    }
    
    // Notify handlers to potentially refresh token (debounced)
    if (this.authFailureCount <= 3) {
      this.isRefreshingToken = true;
      
      this.authFailureDebounceTimeout = setTimeout(() => {
        this.authFailureHandlers.forEach(handler => {
          try {
            handler();
          } catch (error) {
            console.warn('[WebSocket] Error in auth failure handler:', error);
          }
        });
      }, 500); // 500ms debounce
    } else {
      console.warn('[WebSocket] Max auth failures reached, giving up');
      this.isRefreshingToken = false;
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(): void {
    this.stopHeartbeat();

    if (this.isManualDisconnect) {
      this.setStatus('disconnected');
      return;
    }

    this.setStatus('disconnected');
    this.scheduleReconnect();
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (!this.config.autoReconnect || this.isManualDisconnect) {
      return;
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.warn('[WebSocket] Max reconnection attempts reached, falling back to manual sync mode');
      return;
    }

    // Exponential backoff with jitter
    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000,
      this.config.maxReconnectDelay
    );

    console.info(`[WebSocket] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts + 1}/${this.config.maxReconnectAttempts})`);

    this.setStatus('reconnecting');
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.doConnect();
    }, delay);
  }

  /**
   * Start heartbeat interval
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat interval
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Send message to server
   */
  private send(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /**
   * Set status and notify handlers
   */
  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.statusHandlers.forEach(handler => {
        try {
          handler(status);
        } catch (error) {
          console.warn('[WebSocket] Error in status handler:', error);
        }
      });
    }
  }

  /**
   * Notify signal handlers
   */
  private notifySignalHandlers(signal: SyncSignal): void {
    this.signalHandlers.forEach(handler => {
      try {
        handler(signal);
      } catch (error) {
        console.warn('[WebSocket] Error in signal handler:', error);
      }
    });
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.stopHeartbeat();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'Client disconnect');
      }
      
      this.ws = null;
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const wsClient = new WebSocketClient();

export default wsClient;
