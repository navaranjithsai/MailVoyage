/**
 * WebSocket Service for MailVoyage API
 * 
 * Provides real-time signaling for delta sync with graceful degradation.
 * - Lightweight signals only (no heavy data transfer)
 * - Heartbeat for connection status
 * - Debounced batch signaling
 * - Multi-tab support: multiple connections per user
 * - Graceful handling when WebSocket unavailable
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { logger } from '../utils/logger.js';
import jwt from 'jsonwebtoken';
import { config } from '../utils/config.js';

// ============================================================================
// Types
// ============================================================================

interface AuthenticatedClient {
  ws: WebSocket;
  userId: string;
  lastHeartbeat: number;
  isAlive: boolean;
}

export interface SyncSignal {
  type: 'sync_required' | 'heartbeat' | 'pong' | 'connected' | 'error' 
      | 'inbox_sync_complete' | 'settings_updated' | 'inbox_new_mail';
  tables?: string[];       // Which tables have updates
  since?: string;          // Timestamp of oldest change
  message?: string;        // Optional message
  timestamp: string;       // Signal timestamp
  data?: Record<string, any>;  // Optional payload data
}

interface PendingSignal {
  userId: string;
  tables: Set<string>;
  since: string;
  timeout: NodeJS.Timeout | null;
}

// ============================================================================
// WebSocket Server Class
// ============================================================================

class WebSocketService {
  private wss: WebSocketServer | null = null;
  /** userId → Set of active connections (supports multiple tabs) */
  private clients: Map<string, Set<AuthenticatedClient>> = new Map();
  private pendingSignals: Map<string, PendingSignal> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;
  
  // Debounce settings
  private readonly DEBOUNCE_MS = 2000; // 2 seconds debounce
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly CLIENT_TIMEOUT = 60000; // 60 seconds without heartbeat = disconnect
  private readonly MAX_CONNECTIONS_PER_USER = 5; // prevent runaway tabs

  /**
   * Initialize WebSocket server attached to HTTP server
   */
  initialize(server: HttpServer): void {
    if (this.isInitialized) {
      logger.warn('[WebSocket] Already initialized');
      return;
    }

    try {
      this.wss = new WebSocketServer({ 
        server,
        path: '/ws',
        verifyClient: (info, callback) => {
          callback(true);
        }
      });

      this.wss.on('connection', this.handleConnection.bind(this));
      this.wss.on('error', (error) => {
        logger.error('[WebSocket] Server error:', error);
      });

      this.startHeartbeat();

      this.isInitialized = true;
      logger.info('[WebSocket] Server initialized on /ws path');
    } catch (error) {
      logger.error('[WebSocket] Failed to initialize:', error);
      this.isInitialized = false;
    }
  }

  /** Total number of active WebSocket connections across all users */
  private get totalConnections(): number {
    let count = 0;
    for (const clientSet of this.clients.values()) {
      count += clientSet.size;
    }
    return count;
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: any): void {
    logger.info('[WebSocket] New connection attempt');

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch (error) {
        logger.warn('[WebSocket] Invalid message format');
        this.sendError(ws, 'Invalid message format');
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(ws);
    });

    ws.on('error', (error) => {
      logger.warn('[WebSocket] Client error:', error.message);
    });

    this.send(ws, {
      type: 'connected',
      message: 'WebSocket connected. Please authenticate.',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(ws: WebSocket, message: any): void {
    switch (message.type) {
      case 'auth':
        this.handleAuth(ws, message.token);
        break;
      
      case 'ping':
        this.handlePing(ws);
        break;
      
      default:
        logger.debug('[WebSocket] Unknown message type:', message.type);
    }
  }

  /**
   * Authenticate client with JWT token.
   * Supports multiple connections per user (multi-tab).
   */
  private handleAuth(ws: WebSocket, token: string): void {
    if (!token) {
      this.sendError(ws, 'No token provided');
      return;
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; id?: string };
      const userId = decoded.userId || decoded.id;

      if (!userId) {
        this.sendError(ws, 'Invalid token payload');
        return;
      }

      // Get or create the set for this user
      let clientSet = this.clients.get(userId);
      if (!clientSet) {
        clientSet = new Set();
        this.clients.set(userId, clientSet);
      }

      // Enforce per-user connection limit (close oldest if exceeded)
      if (clientSet.size >= this.MAX_CONNECTIONS_PER_USER) {
        const oldest = clientSet.values().next().value;
        if (oldest) {
          logger.info(`[WebSocket] User ${userId} exceeded max connections (${this.MAX_CONNECTIONS_PER_USER}), closing oldest`);
          oldest.ws.close(1000, 'Too many connections');
          clientSet.delete(oldest);
        }
      }

      const client: AuthenticatedClient = {
        ws,
        userId,
        lastHeartbeat: Date.now(),
        isAlive: true
      };

      clientSet.add(client);
      logger.info(`[WebSocket] User ${userId} authenticated (${clientSet.size} tab(s)). Total connections: ${this.totalConnections}`);

      this.send(ws, {
        type: 'connected',
        message: 'Authentication successful',
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      logger.warn('[WebSocket] Auth failed:', error.message);
      this.sendError(ws, 'Authentication failed');
    }
  }

  /**
   * Handle ping from client (keep-alive)
   */
  private handlePing(ws: WebSocket): void {
    for (const clientSet of this.clients.values()) {
      for (const client of clientSet) {
        if (client.ws === ws) {
          client.lastHeartbeat = Date.now();
          client.isAlive = true;
          this.send(ws, {
            type: 'pong',
            timestamp: new Date().toISOString()
          });
          return;
        }
      }
    }
    // Not authenticated yet, still send pong
    this.send(ws, {
      type: 'pong',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(ws: WebSocket): void {
    for (const [userId, clientSet] of this.clients) {
      for (const client of clientSet) {
        if (client.ws === ws) {
          clientSet.delete(client);

          // Clean up empty sets and pending signals when last tab closes
          if (clientSet.size === 0) {
            this.clients.delete(userId);
            const pending = this.pendingSignals.get(userId);
            if (pending?.timeout) {
              clearTimeout(pending.timeout);
              this.pendingSignals.delete(userId);
            }
          }

          logger.info(`[WebSocket] User ${userId} tab disconnected (${clientSet.size} remaining). Total connections: ${this.totalConnections}`);
          return;
        }
      }
    }
  }

  /**
   * Start heartbeat interval to detect dead connections
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      
      for (const [userId, clientSet] of this.clients) {
        const toRemove: AuthenticatedClient[] = [];

        for (const client of clientSet) {
          if (now - client.lastHeartbeat > this.CLIENT_TIMEOUT) {
            logger.info(`[WebSocket] User ${userId} tab timed out`);
            client.ws.terminate();
            toRemove.push(client);
            continue;
          }

          if (client.ws.readyState === WebSocket.OPEN) {
            this.send(client.ws, {
              type: 'heartbeat',
              timestamp: new Date().toISOString()
            });
          }
        }

        for (const dead of toRemove) {
          clientSet.delete(dead);
        }
        if (clientSet.size === 0) {
          this.clients.delete(userId);
        }
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Send a signal to ALL tabs of a specific user (debounced)
   */
  signalUser(userId: string, tables: string[], since?: string): void {
    if (!this.isInitialized) {
      logger.debug('[WebSocket] Not initialized, skipping signal');
      return;
    }

    const clientSet = this.clients.get(userId);
    if (!clientSet || clientSet.size === 0) {
      logger.debug(`[WebSocket] User ${userId} not connected, skipping signal`);
      return;
    }

    let pending = this.pendingSignals.get(userId);
    
    if (!pending) {
      pending = {
        userId,
        tables: new Set(),
        since: since || new Date().toISOString(),
        timeout: null
      };
      this.pendingSignals.set(userId, pending);
    }

    tables.forEach(t => pending!.tables.add(t));
    
    if (since && since < pending.since) {
      pending.since = since;
    }

    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    pending.timeout = setTimeout(() => {
      this.flushSignal(userId);
    }, this.DEBOUNCE_MS);
  }

  /**
   * Flush pending signal to ALL tabs of a user
   */
  private flushSignal(userId: string): void {
    const pending = this.pendingSignals.get(userId);
    if (!pending) return;

    const signal: SyncSignal = {
      type: 'sync_required',
      tables: Array.from(pending.tables),
      since: pending.since,
      timestamp: new Date().toISOString()
    };

    this.sendToAllTabs(userId, signal);
    logger.info(`[WebSocket] Sent sync signal to user ${userId} for tables: ${signal.tables?.join(', ')}`);
    
    this.pendingSignals.delete(userId);
  }

  /**
   * Send an immediate (non-debounced) signal to ALL tabs of a user.
   */
  sendToUser(userId: string, signal: SyncSignal): void {
    if (!this.isInitialized) return;
    this.sendToAllTabs(userId, signal);
    logger.info(`[WebSocket] Sent ${signal.type} to user ${userId}`);
  }

  /**
   * Internal: send a signal to every open tab for a user.
   */
  private sendToAllTabs(userId: string, signal: SyncSignal): void {
    const clientSet = this.clients.get(userId);
    if (!clientSet) return;
    for (const client of clientSet) {
      if (client.ws.readyState === WebSocket.OPEN) {
        this.send(client.ws, signal);
      }
    }
  }

  /**
   * Broadcast a signal to all connected users (all their tabs)
   */
  broadcast(tables: string[], since?: string): void {
    if (!this.isInitialized) return;

    for (const [userId] of this.clients) {
      this.signalUser(userId, tables, since);
    }
  }

  /**
   * Send message to WebSocket
   */
  private send(ws: WebSocket, data: SyncSignal): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  /**
   * Send error message
   */
  private sendError(ws: WebSocket, message: string): void {
    this.send(ws, {
      type: 'error',
      message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Check if a user has at least one connected tab
   */
  isUserConnected(userId: string): boolean {
    const clientSet = this.clients.get(userId);
    if (!clientSet) return false;
    for (const client of clientSet) {
      if (client.ws.readyState === WebSocket.OPEN) return true;
    }
    return false;
  }

  /**
   * Get count of unique connected users
   */
  getConnectedCount(): number {
    return this.clients.size;
  }

  /**
   * Shutdown WebSocket server
   */
  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    for (const pending of this.pendingSignals.values()) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
    }
    this.pendingSignals.clear();

    for (const clientSet of this.clients.values()) {
      for (const client of clientSet) {
        client.ws.close(1001, 'Server shutting down');
      }
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    this.isInitialized = false;
    logger.info('[WebSocket] Server shutdown complete');
  }
}

// Singleton instance
export const wsService = new WebSocketService();

export default wsService;
