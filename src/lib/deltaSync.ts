/**
 * Delta Sync Library for MailVoyage
 * 
 * Implements offline-first architecture with delta synchronization.
 * - Uses Dexie.js (IndexedDB) as source of truth for UI
 * - Implements debounced sync to prevent API flooding
 * - Tracks sync checkpoints for efficient delta updates
 */

import { apiFetch } from './apiFetch';
import { 
  db, 
  getLastSyncTimestamp, 
  updateSyncCheckpoint,
  upsertSentMails,
  upsertInboxMails,
  trimInboxToLimit,
  getAllSentMails,
  getAllInboxMails,
  getPendingSyncCount,
  getCacheValue,
  setCacheValue,
  type SentMailRecord,
  type InboxMailRecord
} from './db';
import { wsClient, type SyncSignal, type ConnectionStatus } from './websocket';

// ============================================================================
// Types
// ============================================================================

export interface DeltaSyncResult {
  success: boolean;
  tables: string[];
  updated: number;
  deleted: number;
  error?: string;
}

export interface SyncState {
  isOnline: boolean;
  connectionStatus: ConnectionStatus;
  lastSync: string | null;
  lastSyncError: string | null;
  pendingChanges: number;
  isSyncing: boolean;
}

type SyncStateListener = (state: SyncState) => void;
type SyncTable = 'sent_mails' | 'inbox_mails' | 'email_accounts' | 'smtp_accounts';
type TokenRefreshCallback = () => Promise<string | null>;

// ============================================================================
// Constants
// ============================================================================

const LAST_SYNC_CACHE_KEY = 'lastSyncTime';
const DEBOUNCE_MS = 2000; // 2 seconds debounce window
const MIN_SYNC_INTERVAL_MS = 30000; // Minimum 30 seconds between manual syncs
const INITIAL_SYNC_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes - skip sync if synced recently

// ============================================================================
// Debounce Implementation
// ============================================================================

interface DebouncedCall {
  tables: Set<SyncTable>;
  since: string | null;
  timeout: ReturnType<typeof setTimeout> | null;
}

const pendingSync: DebouncedCall = {
  tables: new Set(),
  since: null,
  timeout: null
};

/**
 * Debounced sync trigger - collects signals and executes one sync
 */
function debouncedSync(tables: SyncTable[], since?: string): void {
  // Add tables to pending
  tables.forEach(t => pendingSync.tables.add(t));
  
  // Update 'since' to earliest timestamp
  if (since && (!pendingSync.since || since < pendingSync.since)) {
    pendingSync.since = since;
  }

  // Clear existing timeout
  if (pendingSync.timeout) {
    clearTimeout(pendingSync.timeout);
  }

  // Set new timeout
  pendingSync.timeout = setTimeout(() => {
    const tablesToSync = Array.from(pendingSync.tables);
    const syncSince = pendingSync.since;
    
    // Clear pending
    pendingSync.tables.clear();
    pendingSync.since = null;
    pendingSync.timeout = null;
    
    // Execute sync
    if (tablesToSync.length > 0) {
      console.info(`[DeltaSync] Executing debounced sync for: ${tablesToSync.join(', ')}`);
      executeDeltaSync(tablesToSync, syncSince || undefined);
    }
  }, DEBOUNCE_MS);
}

// ============================================================================
// Delta Sync Manager Class
// ============================================================================

class DeltaSyncManager {
  private listeners: Set<SyncStateListener> = new Set();
  private state: SyncState = {
    isOnline: navigator.onLine,
    connectionStatus: 'disconnected',
    lastSync: null,
    lastSyncError: null,
    pendingChanges: 0,
    isSyncing: false
  };
  private isInitialized = false;
  private unsubscribeWs: (() => void) | null = null;
  private unsubscribeStatus: (() => void) | null = null;
  private unsubscribeAuthFailure: (() => void) | null = null;
  private currentToken: string | null = null;
  private tokenRefreshCallback: TokenRefreshCallback | null = null;
  private lastManualSyncTime: number = 0;
  private isRefreshingToken = false;

  /**
   * Initialize delta sync with authentication token
   */
  async initialize(token: string, tokenRefresh?: TokenRefreshCallback): Promise<void> {
    if (this.isInitialized) {
      console.debug('[DeltaSync] Already initialized');
      return;
    }

    console.info('[DeltaSync] Initializing...');

    this.currentToken = token;
    this.tokenRefreshCallback = tokenRefresh || null;

    // Set up online/offline listeners
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Load last sync timestamp from IndexedDB
    const cachedLastSync = await getCacheValue<string>(LAST_SYNC_CACHE_KEY);
    if (cachedLastSync) {
      this.state.lastSync = cachedLastSync;
    }

    // Load pending changes count
    const pendingChanges = await getPendingSyncCount();
    this.updateState({ pendingChanges, lastSync: cachedLastSync });

    // Connect WebSocket with token refresh capability
    this.connectWebSocket(token);

    this.isInitialized = true;
    console.info('[DeltaSync] Initialized');

    // Perform initial sync
    this.performInitialSync();
  }

  /**
   * Shutdown delta sync (preserves lastSync time)
   */
  shutdown(): void {
    if (!this.isInitialized) return;

    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);

    if (this.unsubscribeWs) {
      this.unsubscribeWs();
      this.unsubscribeWs = null;
    }

    if (this.unsubscribeStatus) {
      this.unsubscribeStatus();
      this.unsubscribeStatus = null;
    }

    if (this.unsubscribeAuthFailure) {
      this.unsubscribeAuthFailure();
      this.unsubscribeAuthFailure = null;
    }

    wsClient.disconnect();

    this.isInitialized = false;
    this.currentToken = null;
    this.tokenRefreshCallback = null;
    this.isRefreshingToken = false;
    
    // Only reset connection-related state, preserve lastSync
    this.updateState({
      connectionStatus: 'disconnected',
      isSyncing: false
    });
    
    console.info('[DeltaSync] Shutdown');
  }

  /**
   * Check if delta sync is ready (initialized)
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get current sync state
   */
  getState(): SyncState {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: SyncStateListener): () => void {
    this.listeners.add(listener);
    // Immediately call with current state
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /**
   * Manual sync trigger (with rate limiting)
   */
  async manualSync(): Promise<DeltaSyncResult> {
    // Rate limit manual syncs to prevent API flooding
    const now = Date.now();
    const timeSinceLastSync = now - this.lastManualSyncTime;
    
    if (timeSinceLastSync < MIN_SYNC_INTERVAL_MS && this.lastManualSyncTime > 0) {
      const waitTime = Math.ceil((MIN_SYNC_INTERVAL_MS - timeSinceLastSync) / 1000);
      console.info(`[DeltaSync] Rate limited - wait ${waitTime}s before next sync`);
      return {
        success: false,
        tables: [],
        updated: 0,
        deleted: 0,
        error: `Please wait ${waitTime} seconds before syncing again`
      };
    }
    
    this.lastManualSyncTime = now;
    console.info('[DeltaSync] Manual sync triggered');
    return executeDeltaSync(['sent_mails', 'inbox_mails']);
  }

  /**
   * Force full sync (ignore checkpoints)
   */
  async fullSync(): Promise<DeltaSyncResult> {
    console.info('[DeltaSync] Full sync triggered');
    // Clear checkpoints to force full sync
    await db.syncCheckpoints.clear();
    return executeDeltaSync(['sent_mails', 'inbox_mails']);
  }

  /**
   * Get cached data for immediate render
   */
  async getCachedSentMails(): Promise<SentMailRecord[]> {
    return getAllSentMails();
  }

  async getCachedInboxMails(): Promise<InboxMailRecord[]> {
    return getAllInboxMails();
  }

  /**
   * Refresh WebSocket token and reconnect
   */
  async refreshTokenAndReconnect(): Promise<boolean> {
    // Prevent multiple simultaneous refresh attempts
    if (this.isRefreshingToken) {
      console.debug('[DeltaSync] Token refresh already in progress');
      return false;
    }
    
    if (!this.tokenRefreshCallback) {
      console.warn('[DeltaSync] No token refresh callback configured');
      return false;
    }

    this.isRefreshingToken = true;
    
    try {
      console.info('[DeltaSync] Refreshing WebSocket token...');
      const newToken = await this.tokenRefreshCallback();
      
      if (newToken) {
        this.currentToken = newToken;
        wsClient.updateToken(newToken);
        this.isRefreshingToken = false;
        return true;
      }
    } catch (error) {
      console.warn('[DeltaSync] Failed to refresh token:', error);
    }
    
    this.isRefreshingToken = false;
    return false;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private connectWebSocket(token: string): void {
    // Subscribe to connection status
    this.unsubscribeStatus = wsClient.onStatusChange((status) => {
      console.info(`[DeltaSync] WebSocket status: ${status}`);      this.updateState({ connectionStatus: status });
      
      // Clear refreshing flag when connected
      if (status === 'connected') {
        this.isRefreshingToken = false;
        this.updateState({ lastSyncError: null });
      }
    });

    // Subscribe to sync signals
    this.unsubscribeWs = wsClient.onSignal((signal) => {
      this.handleSyncSignal(signal);
    });

    // Subscribe to auth failures for token refresh (store for cleanup)
    this.unsubscribeAuthFailure = wsClient.onAuthFailure(async () => {
      // Prevent multiple handlers from triggering simultaneously
      if (this.isRefreshingToken) {
        console.debug('[DeltaSync] Auth failure handler: already refreshing token');
        return;
      }
      
      console.info('[DeltaSync] WebSocket auth failed, attempting token refresh...');
      const refreshed = await this.refreshTokenAndReconnect();
      if (!refreshed) {
        this.updateState({ 
          lastSyncError: 'Authentication failed. Please re-login.' 
        });
      }
    });

    // Connect
    wsClient.connect(token);
  }

  private handleSyncSignal = (signal: SyncSignal): void => {
    if (signal.type === 'sync_required' && signal.tables) {
      console.info(`[DeltaSync] Received sync signal for tables: ${signal.tables.join(', ')}`);
      debouncedSync(signal.tables as SyncTable[], signal.since);
    }

    if (signal.type === 'inbox_sync_complete') {
      console.info(`[DeltaSync] Inbox sync complete: ${signal.message}`);
      // Trigger an inbox_mails sync so the client refreshes its local cache
      debouncedSync(['inbox_mails']);
      // Dispatch a custom event so InboxPage can refresh immediately
      window.dispatchEvent(new CustomEvent('inbox:sync-complete', { detail: signal.data }));
    }

    if (signal.type === 'inbox_new_mail') {
      console.info(`[DeltaSync] New mail notification: ${signal.message}`);
      debouncedSync(['inbox_mails']);
      window.dispatchEvent(new CustomEvent('inbox:new-mail', { detail: signal.data }));
    }

    if (signal.type === 'settings_updated') {
      console.info(`[DeltaSync] Settings updated: ${signal.data?.changedKeys?.join(', ')}`);
      window.dispatchEvent(new CustomEvent('settings:updated', { detail: signal.data }));
    }
  };

  private handleOnline = (): void => {
    console.info('[DeltaSync] Network online');
    this.updateState({ isOnline: true });
    
    // Reconnect WebSocket if we have a token
    // WebSocket will signal if there are updates to sync
    if (this.isInitialized && this.currentToken) {
      wsClient.reconnect();
      // Don't auto-sync - wait for WebSocket to signal updates
      // This prevents unnecessary API calls on every network change
    }
  };

  private handleOffline = (): void => {
    console.info('[DeltaSync] Network offline');
    this.updateState({ isOnline: false });
  };

  private async performInitialSync(): Promise<void> {
    console.info('[DeltaSync] Performing initial sync...');
    
    // Load cached data first (instant render)
    const [sentMails, inboxMails] = await Promise.all([
      this.getCachedSentMails(),
      this.getCachedInboxMails()
    ]);

    console.info(`[DeltaSync] Loaded from cache: ${sentMails.length} sent, ${inboxMails.length} inbox`);

    // Check if we need to sync from API
    // Skip if we have cached data AND synced recently (within grace period)
    const lastSyncTimestamp = await getCacheValue<number>('lastSyncTimestamp');
    const now = Date.now();
    const hasRecentSync = lastSyncTimestamp && (now - lastSyncTimestamp) < INITIAL_SYNC_GRACE_PERIOD_MS;
    const hasCachedData = sentMails.length > 0 || inboxMails.length > 0;
    
    if (hasRecentSync && hasCachedData) {
      console.info(`[DeltaSync] Skipping initial API sync - last sync was ${Math.round((now - lastSyncTimestamp!) / 1000)}s ago`);
      return;
    }

    // Only sync with server if online AND we need fresh data
    // WebSocket will trigger sync when server has updates
    if (this.state.isOnline && !hasCachedData) {
      console.info('[DeltaSync] No cached data, performing initial API sync...');
      await this.manualSync();
    } else if (this.state.isOnline) {
      console.info('[DeltaSync] Waiting for WebSocket to signal updates (cache available)');
    }
  }

  // Made public so executeDeltaSync can access it
  updateState(partial: Partial<SyncState>): void {
    this.state = { ...this.state, ...partial };
    this.notifyListeners();
  }

  /**
   * Set last sync time (persists to IndexedDB)
   */
  async setLastSyncTime(time: string): Promise<void> {
    this.state.lastSync = time;
    this.state.lastSyncError = null;
    await setCacheValue(LAST_SYNC_CACHE_KEY, time);
    this.notifyListeners();
  }

  /**
   * Set sync error (does NOT update lastSync)
   */
  setSyncError(error: string): void {
    this.state.lastSyncError = error;
    this.notifyListeners();
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.state);
      } catch (error) {
        console.warn('[DeltaSync] Error in listener:', error);
      }
    });
  }
}

// ============================================================================
// Delta Sync Execution
// ============================================================================

/**
 * Execute delta sync for specified tables
 */
async function executeDeltaSync(
  tables: SyncTable[],
  since?: string
): Promise<DeltaSyncResult> {
  const result: DeltaSyncResult = {
    success: true,
    tables: tables,
    updated: 0,
    deleted: 0
  };

  // Check if already syncing to prevent duplicate syncs
  if (deltaSyncManager.getState().isSyncing) {
    console.debug('[DeltaSync] Sync already in progress, skipping');
    return { ...result, success: false, error: 'Sync already in progress' };
  }

  deltaSyncManager.updateState({ isSyncing: true, lastSyncError: null });

  try {
    for (const table of tables) {
      switch (table) {
        case 'sent_mails':
          const sentResult = await syncSentMails(since);
          result.updated += sentResult.updated;
          result.deleted += sentResult.deleted;
          break;

        case 'inbox_mails':
          const inboxResult = await syncInboxMails(since);
          result.updated += inboxResult.updated;
          result.deleted += inboxResult.deleted;
          break;

        case 'email_accounts':
        case 'smtp_accounts':
          // These are stored in localStorage, handled by existing dataSync
          await syncAccounts();
          break;
      }
    }

    // Update global checkpoint
    await updateSyncCheckpoint('global', new Date().toISOString());
    
    // Only update lastSync on SUCCESS - persist to IndexedDB
    const syncTime = new Date().toLocaleTimeString();
    await deltaSyncManager.setLastSyncTime(syncTime);
    
    // Also save timestamp for rate limiting initial sync check
    await setCacheValue('lastSyncTimestamp', Date.now());
    
    deltaSyncManager.updateState({ isSyncing: false });

    console.info(`[DeltaSync] Sync complete: ${result.updated} updated, ${result.deleted} deleted`);
    return result;

  } catch (error: any) {
    console.error('[DeltaSync] Sync failed:', error);
    result.success = false;
    result.error = error.message;
    
    // Set error but do NOT update lastSync time
    deltaSyncManager.updateState({ isSyncing: false });
    deltaSyncManager.setSyncError(error.message || 'Sync failed');
    
    return result;
  }
}

/**
 * Sync sent mails with delta logic
 */
async function syncSentMails(since?: string): Promise<{ updated: number; deleted: number }> {
  const checkpoint = since || await getLastSyncTimestamp('sent_mails');
  
  try {
    // Build query with checkpoint
    let url = '/api/sent-mails?limit=100';
    if (checkpoint) {
      url += `&since=${encodeURIComponent(checkpoint)}`;
    }

    const response = await apiFetch(url);
    
    if (response.success && response.data?.mails) {
      const mails: SentMailRecord[] = response.data.mails.map((mail: any) => ({
        id: mail.id,
        threadId: mail.threadId,
        fromEmail: mail.fromEmail,
        toEmails: mail.toEmails,
        cc: mail.cc,
        bcc: mail.bcc,
        subject: mail.subject,
        htmlBody: mail.htmlBody,
        textBody: mail.textBody,
        attachmentsMetadata: mail.attachmentsMetadata,
        messageId: mail.messageId,
        status: mail.status,
        sentAt: mail.sentAt,
        createdAt: mail.createdAt,
        updatedAt: mail.updatedAt || mail.sentAt
      }));

      // Upsert to IndexedDB
      await upsertSentMails(mails);
      
      // Update checkpoint
      if (mails.length > 0) {
        const latestTimestamp = mails.reduce((latest, mail) => {
          return mail.updatedAt > latest ? mail.updatedAt : latest;
        }, checkpoint || '');
        
        await updateSyncCheckpoint('sent_mails', latestTimestamp);
      }

      return { updated: mails.length, deleted: 0 };
    }

    return { updated: 0, deleted: 0 };

  } catch (error) {
    console.error('[DeltaSync] Failed to sync sent mails:', error);
    throw error;
  }
}

/**
 * Sync inbox mails — fetches cached mails from server for each email account
 * and upserts them into local Dexie (encrypted).
 */
async function syncInboxMails(_since?: string): Promise<{ updated: number; deleted: number }> {
  try {
    const emailAccountsStr = localStorage.getItem('emailAccounts');
    if (!emailAccountsStr) {
      return { updated: 0, deleted: 0 };
    }

    const accounts: Array<{ accountCode: string }> = JSON.parse(emailAccountsStr);
    let totalUpdated = 0;

    for (const acc of accounts) {
      try {
        const res = await apiFetch(
          `/api/inbox/cached?accountCode=${encodeURIComponent(acc.accountCode)}`
        );

        const serverMails = res?.data?.mails || res?.mails || [];
        if (serverMails.length) {
          const mails: InboxMailRecord[] = serverMails.map((m: any) => ({
            id: m.id || `${m.account_code || acc.accountCode}:${m.uid}`,
            uid: m.uid,
            accountId: m.account_code || acc.accountCode,
            mailbox: m.mailbox || 'INBOX',
            messageId: m.message_id || m.messageId,
            fromAddress: m.from_address || m.fromAddress || '',
            fromName: m.from_name || m.fromName || '',
            toAddresses: Array.isArray(m.to_addresses || m.toAddresses) ? (m.to_addresses || m.toAddresses) : [],
            ccAddresses: Array.isArray(m.cc_addresses || m.ccAddresses) ? (m.cc_addresses || m.ccAddresses) : [],
            bccAddresses: [],
            subject: m.subject || '(No Subject)',
            htmlBody: m.html_body || m.htmlBody || null,
            textBody: m.text_body || m.textBody || null,
            date: m.date || new Date().toISOString(),
            isRead: m.is_read ?? m.isRead ?? false,
            isStarred: m.is_starred ?? m.isStarred ?? false,
            hasAttachments: m.has_attachments ?? m.hasAttachments ?? false,
            attachmentsMetadata: m.attachments_metadata || m.attachmentsMetadata || null,
            labels: m.labels || [],
            syncedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdAt: m.created_at || m.createdAt || m.date || new Date().toISOString(),
          }));

          await upsertInboxMails(mails);
          totalUpdated += mails.length;

          // Enforce local cache limit
          const cacheLimit = parseInt(localStorage.getItem('inbox_cache_limit') || '15', 10);
          await trimInboxToLimit(acc.accountCode, cacheLimit);
        }
      } catch (err) {
        console.warn(`[DeltaSync] Failed to sync inbox for ${acc.accountCode}:`, err);
      }
    }

    if (totalUpdated > 0) {
      await updateSyncCheckpoint('inbox_mails', new Date().toISOString());
    }

    return { updated: totalUpdated, deleted: 0 };
  } catch (error) {
    console.error('[DeltaSync] Failed to sync inbox mails:', error);
    throw error;
  }
}

/**
 * Sync email accounts (uses existing localStorage approach)
 */
async function syncAccounts(): Promise<void> {
  try {
    const response = await apiFetch('/api/email-accounts');
    
    const emailAccounts = Array.isArray(response) ? response : (response.emailAccounts || []);
    const smtpAccounts = Array.isArray(response) ? [] : (response.smtpAccounts || []);
    
    localStorage.setItem('emailAccounts', JSON.stringify(emailAccounts));
    localStorage.setItem('smtpAccounts', JSON.stringify(smtpAccounts));
    
    console.info(`[DeltaSync] Accounts synced: ${emailAccounts.length} email, ${smtpAccounts.length} SMTP`);
  } catch (error) {
    console.error('[DeltaSync] Failed to sync accounts:', error);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const deltaSyncManager = new DeltaSyncManager();

export default deltaSyncManager;
