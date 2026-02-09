/**
 * WebSocket Service for MailVoyage API
 * 
 * Provides real-time signaling for delta sync with graceful degradation.
 * - Lightweight signals only (no heavy data transfer)
 * - Heartbeat for connection status
 * - Debounced batch signaling
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
  private clients: Map<string, AuthenticatedClient> = new Map();
  private pendingSignals: Map<string, PendingSignal> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;
  
  // Debounce settings
  private readonly DEBOUNCE_MS = 2000; // 2 seconds debounce
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly CLIENT_TIMEOUT = 60000; // 60 seconds without heartbeat = disconnect

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
        // Verify client during upgrade
        verifyClient: (info, callback) => {
          // Allow all connections initially, auth happens after connect
          callback(true);
        }
      });

      this.wss.on('connection', this.handleConnection.bind(this));
      this.wss.on('error', (error) => {
        logger.error('[WebSocket] Server error:', error);
      });

      // Start heartbeat interval
      this.startHeartbeat();

      this.isInitialized = true;
      logger.info('[WebSocket] Server initialized on /ws path');
    } catch (error) {
      logger.error('[WebSocket] Failed to initialize:', error);
      // Don't crash - graceful degradation
      this.isInitialized = false;
    }
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: any): void {
    logger.info('[WebSocket] New connection attempt');

    // Set up message handler for authentication
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

    // Send connected signal (client needs to authenticate)
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
   * Authenticate client with JWT token
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

      // Remove any existing connection for this user
      const existingClient = this.clients.get(userId);
      if (existingClient) {
        logger.info(`[WebSocket] Replacing existing connection for user ${userId}`);
        existingClient.ws.close(1000, 'Replaced by new connection');
      }

      // Register the authenticated client
      const client: AuthenticatedClient = {
        ws,
        userId,
        lastHeartbeat: Date.now(),
        isAlive: true
      };

      this.clients.set(userId, client);
      logger.info(`[WebSocket] User ${userId} authenticated. Total clients: ${this.clients.size}`);

      // Send success response
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
    // Find the client and update heartbeat
    for (const [userId, client] of this.clients) {
      if (client.ws === ws) {
        client.lastHeartbeat = Date.now();
        client.isAlive = true;
        break;
      }
    }

    this.send(ws, {
      type: 'pong',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(ws: WebSocket): void {
    for (const [userId, client] of this.clients) {
      if (client.ws === ws) {
        this.clients.delete(userId);
        
        // Clean up any pending signals
        const pending = this.pendingSignals.get(userId);
        if (pending?.timeout) {
          clearTimeout(pending.timeout);
          this.pendingSignals.delete(userId);
        }
        
        logger.info(`[WebSocket] User ${userId} disconnected. Total clients: ${this.clients.size}`);
        break;
      }
    }
  }

  /**
   * Start heartbeat interval to detect dead connections
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      
      for (const [userId, client] of this.clients) {
        if (now - client.lastHeartbeat > this.CLIENT_TIMEOUT) {
          logger.info(`[WebSocket] User ${userId} timed out`);
          client.ws.terminate();
          this.clients.delete(userId);
          continue;
        }

        // Send heartbeat
        if (client.ws.readyState === WebSocket.OPEN) {
          this.send(client.ws, {
            type: 'heartbeat',
            timestamp: new Date().toISOString()
          });
        }
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Send a signal to a specific user (debounced)
   * Call this when database changes occur
   */
  signalUser(userId: string, tables: string[], since?: string): void {
    if (!this.isInitialized) {
      logger.debug('[WebSocket] Not initialized, skipping signal');
      return;
    }

    const client = this.clients.get(userId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      logger.debug(`[WebSocket] User ${userId} not connected, skipping signal`);
      return;
    }

    // Get or create pending signal
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

    // Add tables to the pending signal
    tables.forEach(t => pending!.tables.add(t));
    
    // Update 'since' to the earliest timestamp
    if (since && since < pending.since) {
      pending.since = since;
    }

    // Clear existing timeout and set new one (debounce)
    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    pending.timeout = setTimeout(() => {
      this.flushSignal(userId);
    }, this.DEBOUNCE_MS);
  }

  /**
   * Flush pending signal to user
   */
  private flushSignal(userId: string): void {
    const pending = this.pendingSignals.get(userId);
    if (!pending) return;

    const client = this.clients.get(userId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      this.pendingSignals.delete(userId);
      return;
    }

    const signal: SyncSignal = {
      type: 'sync_required',
      tables: Array.from(pending.tables),
      since: pending.since,
      timestamp: new Date().toISOString()
    };

    this.send(client.ws, signal);
    logger.info(`[WebSocket] Sent sync signal to user ${userId} for tables: ${signal.tables?.join(', ')}`);
    
    this.pendingSignals.delete(userId);
  }

  /**
   * Send an immediate (non-debounced) signal to a specific user.
   * Use for one-off notifications like settings changes or sync completion.
   */
  sendToUser(userId: string, signal: SyncSignal): void {
    if (!this.isInitialized) return;

    const client = this.clients.get(userId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      logger.debug(`[WebSocket] User ${userId} not connected, skipping direct signal`);
      return;
    }

    this.send(client.ws, signal);
    logger.info(`[WebSocket] Sent ${signal.type} to user ${userId}`);
  }

  /**
   * Broadcast a signal to all connected users
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
   * Check if a user is connected
   */
  isUserConnected(userId: string): boolean {
    const client = this.clients.get(userId);
    return client !== undefined && client.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connected users count
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

    // Clear all pending signals
    for (const pending of this.pendingSignals.values()) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
    }
    this.pendingSignals.clear();

    // Close all client connections
    for (const client of this.clients.values()) {
      client.ws.close(1001, 'Server shutting down');
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
