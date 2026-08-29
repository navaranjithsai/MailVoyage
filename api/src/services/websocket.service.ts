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
import pool from '../db/index.js';
import * as inboxService from './inbox.service.js';
import { pollUserNow, cleanupUserCache } from './mail-poller.service.js';

// ============================================================================
// Types
// ============================================================================

interface AuthenticatedClient {
  ws: WebSocket;
  userId: string;
  lastHeartbeat: number;
  isAlive: boolean;
  sessionVersion: number;
}

export interface SyncSignal {
  type: 'sync_required' | 'heartbeat' | 'pong' | 'connected' | 'error' 
      | 'inbox_sync_complete' | 'settings_updated' | 'inbox_new_mail' | 'flag_update_ack';
  tables?: string[];       // Which tables have updates
  since?: string;          // Timestamp of oldest change
  message?: string;        // Optional message
  timestamp: string;       // Signal timestamp
  data?: Record<string, unknown>;  // Optional payload data
  batchId?: string;
  acceptedIds?: number[];
  rejectedIds?: number[];
  success?: boolean;
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
  private socketIndex: Map<WebSocket, AuthenticatedClient> = new Map();
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
  private handleConnection(ws: WebSocket, _req: unknown): void {
    logger.info('[WebSocket] New connection attempt');

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch (_error) {
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
  private handleMessage(ws: WebSocket, message: Record<string, unknown>): void {
    switch (message.type) {
      case 'auth':
        void this.handleAuth(ws, message.token as string);
        break;
      
      case 'ping':
        this.handlePing(ws);
        break;

      case 'flag_update':
        void this.handleFlagUpdate(ws, message);
        break;
      
      default:
        logger.debug('[WebSocket] Unknown message type:', message.type);
    }
  }

  /**
   * Authenticate client with JWT token.
   * Supports multiple connections per user (multi-tab).
   */
  private async handleAuth(ws: WebSocket, token: string): Promise<void> {
    if (!token) {
      this.sendError(ws, 'No token provided');
      return;
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { userId?: string; id?: string; sessionVersion?: number };
      const userIdRaw = decoded.userId || decoded.id;
      const sessionVersion = decoded.sessionVersion;

      if (!userIdRaw) {
        this.sendError(ws, 'Invalid token payload');
        return;
      }

      if (typeof sessionVersion !== 'number') {
        this.sendError(ws, 'Invalid session');
        return;
      }

      const userIdNum = Number(userIdRaw);
      if (!Number.isFinite(userIdNum)) {
        this.sendError(ws, 'Invalid user id');
        return;
      }

      const dbClient = await pool.connect();
      try {
        const result = await dbClient.query(
          'SELECT session_version FROM users WHERE id = $1',
          [userIdNum]
        );

        if (result.rows.length === 0) {
          this.sendError(ws, 'User not found');
          return;
        }

        const currentVersion = result.rows[0].session_version ?? 0;
        if (currentVersion !== sessionVersion) {
          this.sendError(ws, 'Session revoked');
          ws.close(1008, 'Session revoked');
          return;
        }
      } finally {
        dbClient.release();
      }

      // Get or create the set for this user
      const userId = String(userIdRaw);
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
          this.socketIndex.delete(oldest.ws);
        }
      }

      const authedClient: AuthenticatedClient = {
        ws,
        userId,
        lastHeartbeat: Date.now(),
        isAlive: true,
        sessionVersion
      };

      clientSet.add(authedClient);
      this.socketIndex.set(ws, authedClient);
      logger.info(`[WebSocket] User ${userId} authenticated (${clientSet.size} tab(s)). Total connections: ${this.totalConnections}`);

      this.send(ws, {
        type: 'connected',
        message: 'Authentication successful',
        timestamp: new Date().toISOString()
      });

      // Trigger an immediate mail poll for this user on their first connection.
      // If they already have other tabs connected, skip (already being polled).
      if (clientSet.size === 1) {
        pollUserNow(userId);
      }

    } catch (error: unknown) {
      logger.warn('[WebSocket] Auth failed:', error instanceof Error ? error.message : String(error));
      this.sendError(ws, 'Authentication failed');
    }
  }

  /**
   * Handle ping from client (keep-alive)
   */
  private handlePing(ws: WebSocket): void {
    const client = this.socketIndex.get(ws);
    if (client) {
      client.lastHeartbeat = Date.now();
      client.isAlive = true;
      this.send(ws, {
        type: 'pong',
        timestamp: new Date().toISOString()
      });
      return;
    }
    // Not authenticated yet, still send pong
    this.send(ws, {
      type: 'pong',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle flag updates sent from client over WebSocket.
   */
  private async handleFlagUpdate(ws: WebSocket, message: Record<string, unknown>): Promise<void> {
    const client = this.socketIndex.get(ws);
    if (!client) {
      this.sendError(ws, 'Not authenticated');
      return;
    }

    const batchId = typeof message.batchId === 'string' ? message.batchId : '';
    const updates = Array.isArray(message.updates) ? message.updates : [];
    if (!batchId || updates.length === 0) {
      this.sendError(ws, 'Invalid flag update payload');
      return;
    }

    const userIdNum = Number(client.userId);
    if (!Number.isFinite(userIdNum)) {
      this.sendError(ws, 'Invalid user id');
      return;
    }

    const dbClient = await pool.connect();
    try {
      const result = await dbClient.query(
        'SELECT session_version FROM users WHERE id = $1',
        [userIdNum]
      );

      // SECURITY FIX (C3/L4): explicitly reject DELETED users. Previously
      // `rows[0]?.session_version ?? 0` made a deleted user compare equal to
      // a client whose sessionVersion happened to be 0, so flag updates could
      // slip through for a non-existent account.
      if (result.rows.length === 0) {
        this.sendError(ws, 'User not found');
        ws.close(1008, 'User not found');
        return;
      }

      const currentVersion = result.rows[0].session_version ?? 0;
      if (currentVersion !== client.sessionVersion) {
        this.sendError(ws, 'Session revoked');
        ws.close(1008, 'Session revoked');
        return;
      }
    } finally {
      dbClient.release();
    }

    try {
      const ack = await inboxService.applyFlagUpdates(
        client.userId,
        batchId,
        updates as inboxService.FlagUpdateInput[],
        client.sessionVersion
      );

      this.send(ws, ack);

      if (ack.acceptedIds.length > 0) {
        this.signalUser(client.userId, ['inbox_mails'], ack.timestamp);
      }
    } catch (error) {
      logger.warn('[WebSocket] Failed to apply flag updates:', error);
      this.sendError(ws, 'Failed to apply flag updates');
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(ws: WebSocket): void {
    const client = this.socketIndex.get(ws);
    if (!client) return;

    const userId = client.userId;
    const clientSet = this.clients.get(userId);
    if (clientSet) {
      clientSet.delete(client);

      if (clientSet.size === 0) {
        this.clients.delete(userId);
        const pending = this.pendingSignals.get(userId);
        if (pending?.timeout) {
          clearTimeout(pending.timeout);
          this.pendingSignals.delete(userId);
        }
        // Clean up the mail poller's cached counts for this user
        cleanupUserCache(userId);
      }
    }

    this.socketIndex.delete(ws);
    logger.info(`[WebSocket] User ${userId} tab disconnected (${clientSet?.size ?? 0} remaining). Total connections: ${this.totalConnections}`);
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
          this.socketIndex.delete(dead.ws);
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
   * Get all user IDs that currently have at least one connected tab.
   * Used by the background mail poller to check for new mail on
   * behalf of online users.
   */
  getConnectedUserIds(): string[] {
    const userIds: string[] = [];
    for (const [userId, clientSet] of this.clients.entries()) {
      for (const client of clientSet) {
        if (client.ws.readyState === WebSocket.OPEN) {
          userIds.push(userId);
          break; // Only need one open tab per user
        }
      }
    }
    return userIds;
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
    this.socketIndex.clear();

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
