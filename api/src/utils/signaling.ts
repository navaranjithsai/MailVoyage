/**
 * Signaling Utility for MailVoyage API
 * 
 * Provides a simple interface for services to signal changes to connected clients.
 * Uses the WebSocket service internally with debouncing.
 */

import { wsService } from '../services/websocket.service.js';
import { logger } from './logger.js';

// ============================================================================
// Types
// ============================================================================

export type SignalTable = 
  | 'sent_mails' 
  | 'inbox_mails' 
  | 'email_accounts' 
  | 'smtp_accounts'
  | 'drafts';

export interface SignalOptions {
  /** The user to signal (required) */
  userId: string;
  /** Which tables have been modified */
  tables: SignalTable[];
  /** Timestamp of the change (defaults to now) */
  timestamp?: string;
}

// ============================================================================
// Signal Functions
// ============================================================================

/**
 * Signal a user that data has changed and they should sync
 * 
 * @example
 * // Signal that sent_mails table was updated
 * signalUserSync({
 *   userId: '123',
 *   tables: ['sent_mails'],
 *   timestamp: mail.updatedAt
 * });
 */
export function signalUserSync(options: SignalOptions): void {
  const { userId, tables, timestamp } = options;
  
  if (!userId || tables.length === 0) {
    logger.debug('[Signal] Invalid signal options, skipping');
    return;
  }

  wsService.signalUser(userId, tables, timestamp);
  logger.debug(`[Signal] Queued signal for user ${userId}: ${tables.join(', ')}`);
}

/**
 * Signal when a new email is sent
 */
export function signalNewSentMail(userId: string, updatedAt: string): void {
  signalUserSync({
    userId,
    tables: ['sent_mails'],
    timestamp: updatedAt
  });
}

/**
 * Signal when inbox is updated (new mail, read/unread, etc.)
 */
export function signalInboxUpdate(userId: string, updatedAt: string): void {
  signalUserSync({
    userId,
    tables: ['inbox_mails'],
    timestamp: updatedAt
  });
}

/**
 * Signal when email accounts are modified
 */
export function signalEmailAccountsUpdate(userId: string, updatedAt: string): void {
  signalUserSync({
    userId,
    tables: ['email_accounts', 'smtp_accounts'],
    timestamp: updatedAt
  });
}

/**
 * Signal multiple table changes at once
 */
export function signalMultipleChanges(
  userId: string, 
  tables: SignalTable[], 
  updatedAt: string
): void {
  signalUserSync({
    userId,
    tables,
    timestamp: updatedAt
  });
}

/**
 * Broadcast a signal to all connected users
 * Use sparingly - typically for system-wide updates
 */
export function broadcastSync(tables: SignalTable[], timestamp?: string): void {
  wsService.broadcast(tables, timestamp);
  logger.info(`[Signal] Broadcast queued for tables: ${tables.join(', ')}`);
}

/**
 * Check if WebSocket signaling is available for a user
 */
export function isUserOnline(userId: string): boolean {
  return wsService.isUserConnected(userId);
}

/**
 * Get count of connected users
 */
export function getOnlineUserCount(): number {
  return wsService.getConnectedCount();
}

export default {
  signalUserSync,
  signalNewSentMail,
  signalInboxUpdate,
  signalEmailAccountsUpdate,
  signalMultipleChanges,
  broadcastSync,
  isUserOnline,
  getOnlineUserCount
};
