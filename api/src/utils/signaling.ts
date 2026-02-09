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

/**
 * Signal that an inbox sync has completed (non-debounced, immediate).
 * Tells the client to refresh its local inbox view.
 */
export function signalInboxSyncComplete(
  userId: string,
  accountCode: string,
  fetchedCount: number
): void {
  wsService.sendToUser(userId, {
    type: 'inbox_sync_complete',
    tables: ['inbox_mails'],
    message: `Synced ${fetchedCount} email${fetchedCount !== 1 ? 's' : ''}`,
    data: { accountCode, fetchedCount },
    timestamp: new Date().toISOString(),
  });
  logger.debug(`[Signal] Sent inbox_sync_complete to user ${userId} (${fetchedCount} mails)`);
}

/**
 * Signal that user settings have been updated (non-debounced, immediate).
 * Tells the client to re-read settings from localStorage / API.
 */
export function signalSettingsUpdated(
  userId: string,
  changedKeys: string[]
): void {
  wsService.sendToUser(userId, {
    type: 'settings_updated',
    message: 'Settings updated',
    data: { changedKeys },
    timestamp: new Date().toISOString(),
  });
  logger.debug(`[Signal] Sent settings_updated to user ${userId}: ${changedKeys.join(', ')}`);
}

/**
 * Signal that new mail has arrived on the server (non-debounced, immediate).
 * Can be used as a push notification trigger.
 */
export function signalNewInboxMail(
  userId: string,
  accountCode: string,
  count: number,
  subject?: string
): void {
  wsService.sendToUser(userId, {
    type: 'inbox_new_mail',
    tables: ['inbox_mails'],
    message: count === 1
      ? `New email: ${subject || '(No Subject)'}`
      : `${count} new emails`,
    data: { accountCode, count, subject },
    timestamp: new Date().toISOString(),
  });
  logger.debug(`[Signal] Sent inbox_new_mail to user ${userId} (${count} mails)`);
}

export default {
  signalUserSync,
  signalNewSentMail,
  signalInboxUpdate,
  signalEmailAccountsUpdate,
  signalMultipleChanges,
  broadcastSync,
  isUserOnline,
  getOnlineUserCount,
  signalInboxSyncComplete,
  signalSettingsUpdated,
  signalNewInboxMail,
};
