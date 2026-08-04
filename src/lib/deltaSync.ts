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
  getFlagOverrideMap,
  upsertSentMails,
  upsertInboxMails,
  trimInboxToLimit,
  getAllSentMails,
  getAllInboxMails,
  getPendingSyncCount,
  getCacheValue,
  setCacheValue,
  type SentMailRecord,
  type InboxMailRecord,
  type FlagUpdateRecord
} from './db';
import { wsClient, type SyncSignal, type ConnectionStatus } from './websocket';
import { getStoredUserId } from './authSession';

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

/** Shape of a raw sent mail from the API */
interface ApiSentMail {
  id: string;
  threadId: string;
  fromEmail: string;
  toEmails: string[];
  cc: string[] | null;
  bcc: string[] | null;
  subject: string;
  htmlBody: string | null;
  textBody: string | null;
  attachmentsMetadata: unknown;
  messageId: string | null;
  status: string;
  sentAt: string;
  createdAt: string;
  updatedAt?: string;
}

/** Shape of a raw inbox mail from the API (supports snake_case and camelCase) */
interface ApiInboxMail {
  id?: string | number;
  uid?: number;
  account_code?: string;
  accountCode?: string;
  accountId?: string;
  mailbox?: string;
  message_id?: string;
  messageId?: string;
  from_address?: string;
  fromAddress?: string;
  from_name?: string;
  fromName?: string;
  to_addresses?: string | string[];
  toAddresses?: string | string[];
  cc_addresses?: string | string[];
  ccAddresses?: string | string[];
  subject?: string;
  html_body?: string | null;
  htmlBody?: string | null;
  text_body?: string | null;
  textBody?: string | null;
  date?: string;
  is_read?: boolean;
  isRead?: boolean;
  is_starred?: boolean;
  isStarred?: boolean;
  has_attachments?: boolean;
  hasAttachments?: boolean;
  attachments_metadata?: unknown;
  attachmentsMetadata?: unknown;
  labels?: string[];
  created_at?: string;
  createdAt?: string;
}

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
    
    // Abort if manager was shut down while debouncing (e.g. user logged out)
    if (!deltaSyncManager.isReady()) {
      console.debug('[DeltaSync] Debounced sync skipped — manager shut down');
      return;
    }

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

    // Cancel any pending debounced sync
    if (pendingSync.timeout) {
      clearTimeout(pendingSync.timeout);
      pendingSync.timeout = null;
      pendingSync.tables.clear();
      pendingSync.since = null;
    }

    // Cancel any pending debounced live sync
    if (pendingLiveSync.timeout) {
      clearTimeout(pendingLiveSync.timeout);
      pendingLiveSync.timeout = null;
      pendingLiveSync.tables.clear();
      pendingLiveSync.since = null;
    }
    
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
   * Sync only sent mails (used by SentPage refresh)
   */
  async syncSentMailsOnly(): Promise<DeltaSyncResult> {
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
        error: `Please wait ${waitTime} seconds before syncing again`,
      };
    }

    this.lastManualSyncTime = now;
    console.info('[DeltaSync] Sent-mails-only sync triggered');
    return executeDeltaSync(['sent_mails']);
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

  /**
   * Reconnect WebSocket with an explicitly supplied fresh token.
   * Use this as a fallback when the stored refresh callback is unavailable.
   */
  reconnectWithToken(token: string, tokenRefresh?: TokenRefreshCallback): boolean {
    if (!this.isInitialized) {
      return false;
    }

    if (tokenRefresh) {
      this.tokenRefreshCallback = tokenRefresh;
    }

    this.currentToken = token;
    this.isRefreshingToken = false;
    wsClient.updateToken(token);
    return true;
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
      // Use the CACHE-based sync (not live IMAP) to refresh local Dexie.
      // The server-side cache was just updated by the sync, so reading from
      // cache is fast and reflects the latest state.
      // IMPORTANT: Do NOT use debouncedSyncLive() here — that would call
      // /api/inbox/sync again, which would send another inbox_sync_complete
      // signal, creating an infinite feedback loop.
      debouncedSync(['inbox_mails']);
      window.dispatchEvent(new CustomEvent('inbox:sync-complete', { detail: signal.data }));
    }

    if (signal.type === 'inbox_new_mail') {
      console.info(`[DeltaSync] New mail notification: ${signal.message}`);
      // Use LIVE sync to pull the new email from the mail server
      debouncedSyncLive(['inbox_mails']);
      window.dispatchEvent(new CustomEvent('inbox:new-mail', { detail: signal.data }));
    }

    if (signal.type === 'settings_updated') {
      const changedKeys = signal.data?.changedKeys;
      console.info(`[DeltaSync] Settings updated: ${Array.isArray(changedKeys) ? changedKeys.join(', ') : ''}`);
      window.dispatchEvent(new CustomEvent('settings:updated', { detail: signal.data }));
    }
  };

  private handleOnline = (): void => {
    console.info('[DeltaSync] Network online');
    this.updateState({ isOnline: true });

    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('lastOnlineReturn', String(Date.now()));
        window.dispatchEvent(new CustomEvent('network:online-return'));
      } catch {
        // Ignore storage or event errors.
      }
    }
    
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
    
    // Abort if shutdown has already been called
    if (!this.isInitialized) return;

    // Load cached data first (instant render)
    const [sentMails, inboxMails] = await Promise.all([
      this.getCachedSentMails(),
      this.getCachedInboxMails()
    ]);

    // Re-check after async — logout may have happened while loading cache
    if (!this.isInitialized) return;

    console.info(`[DeltaSync] Loaded from cache: ${sentMails.length} sent, ${inboxMails.length} inbox`);

    // Check if we need to sync from API
    // Skip if we have cached data AND synced recently (within grace period)
    const lastSyncTimestamp = await getCacheValue<number>('lastSyncTimestamp');
    const now = Date.now();
    const hasRecentSync = lastSyncTimestamp && (now - lastSyncTimestamp) < INITIAL_SYNC_GRACE_PERIOD_MS;
    const hasCachedData = sentMails.length > 0 || inboxMails.length > 0;
    let forceServerSync = false;

    try {
      const lastLoginAtRaw = sessionStorage.getItem('lastLoginAt');
      const lastLoginAt = lastLoginAtRaw ? Number(lastLoginAtRaw) : 0;
      if (Number.isFinite(lastLoginAt) && lastLoginAt > 0) {
        forceServerSync = !lastSyncTimestamp || lastLoginAt > lastSyncTimestamp;
        sessionStorage.removeItem('lastLoginAt');
      }
    } catch {
      // Ignore storage access failures and fall back to normal cache logic.
    }
    
    if (!forceServerSync && hasRecentSync && hasCachedData) {
      console.info(`[DeltaSync] Skipping initial API sync - last sync was ${Math.round((now - lastSyncTimestamp!) / 1000)}s ago`);
      return;
    }

    // Only sync with server if online AND we need fresh data
    // WebSocket will trigger sync when server has updates
    if (this.state.isOnline && (!hasCachedData || forceServerSync)) {
      console.info('[DeltaSync] Performing initial API sync (force=' + forceServerSync + ', hasCachedData=' + hasCachedData + ')...');
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

  // Abort if delta sync was shut down (e.g. user logged out)
  if (!deltaSyncManager.isReady()) {
    return { ...result, success: false, error: 'DeltaSync not initialized' };
  }

  // Check if already syncing to prevent duplicate syncs
  if (deltaSyncManager.getState().isSyncing) {
    console.debug('[DeltaSync] Sync already in progress, skipping');
    return { ...result, success: false, error: 'Sync already in progress' };
  }

  deltaSyncManager.updateState({ isSyncing: true, lastSyncError: null });

  try {
    for (const table of tables) {
      // Re-check readiness before each table sync (logout could happen mid-sync)
      if (!deltaSyncManager.isReady()) {
        console.info('[DeltaSync] Shutdown during sync, aborting');
        result.success = false;
        result.error = 'Sync aborted — shutdown';
        break;
      }

      switch (table) {
        case 'sent_mails': {
          const sentResult = await syncSentMails(since);
          result.updated += sentResult.updated;
          result.deleted += sentResult.deleted;
          break;
        }

        case 'inbox_mails': {
          const inboxResult = await syncInboxMails(since);
          result.updated += inboxResult.updated;
          result.deleted += inboxResult.deleted;
          break;
        }

        case 'email_accounts':
        case 'smtp_accounts':
          // These are stored in localStorage, handled by existing dataSync
          await syncAccounts();
          break;
      }
    }

    // Don't update checkpoints if aborted
    if (!deltaSyncManager.isReady()) {
      deltaSyncManager.updateState({ isSyncing: false });
      return result;
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

    // Notify the UI that local cache was refreshed so pages (Dashboard,
    // Inbox, etc.) can re-read from Dexie and update their views. This is
    // especially important for the `sync_required` signal path (triggered
    // by flag-updates), which does not dispatch `inbox:sync-complete` from
    // handleSyncSignal. Without this event, the dashboard would show stale
    // data even though Dexie was just updated.
    if (tables.includes('inbox_mails') && result.updated >= 0) {
      window.dispatchEvent(new CustomEvent('inbox:sync-complete'));
    }
    if (tables.includes('sent_mails') && result.updated >= 0) {
      window.dispatchEvent(new CustomEvent('sent:sync-complete'));
    }

    return result;

  } catch (error: unknown) {
    console.error('[DeltaSync] Sync failed:', error);
    result.success = false;
    result.error = error instanceof Error ? error.message : String(error);
    
    // Set error but do NOT update lastSync time
    deltaSyncManager.updateState({ isSyncing: false });
    deltaSyncManager.setSyncError(error instanceof Error ? error.message : 'Sync failed');
    
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
    const resObj = response as Record<string, unknown>;
    const resData = resObj?.data as Record<string, unknown> | undefined;
    
    if (resObj.success && resData?.mails) {
      const mails: SentMailRecord[] = (resData.mails as ApiSentMail[]).map((mail) => ({
        id: mail.id,
        threadId: mail.threadId,
        fromEmail: mail.fromEmail,
        toEmails: mail.toEmails,
        cc: mail.cc,
        bcc: mail.bcc,
        subject: mail.subject,
        htmlBody: mail.htmlBody,
        textBody: mail.textBody,
        attachmentsMetadata: mail.attachmentsMetadata as SentMailRecord['attachmentsMetadata'],
        messageId: mail.messageId,
        status: mail.status as SentMailRecord['status'],
        sentAt: mail.sentAt,
        createdAt: mail.createdAt,
        updatedAt: mail.updatedAt || mail.sentAt,
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

    const userId = getStoredUserId();
    const overrideMap = userId ? await getFlagOverrideMap(userId) : new Map<number, FlagUpdateRecord>();
    const accounts: Array<{ accountCode: string }> = JSON.parse(emailAccountsStr);
    let totalUpdated = 0;

    for (const acc of accounts) {
      try {
        // Use the cache endpoint (fast server-DB read, no IMAP connection).
        // The live /api/inbox/sync endpoint is only called by the explicit
        // sync/reload buttons in InboxPage to avoid slow IMAP connections
        // during page-load and login.
        const res = await apiFetch(
          `/api/inbox/cached?accountCode=${encodeURIComponent(acc.accountCode)}`
        );
        const resObj = res as Record<string, unknown>;
        const dataObj = resObj?.data as Record<string, unknown> | undefined;

        const serverMails = ((dataObj?.mails || resObj?.mails || []) as ApiInboxMail[]);
        if (serverMails.length) {
          const mails: InboxMailRecord[] = serverMails.map((m) => ({
            id: String(m.id ?? `${m.account_code || acc.accountCode}:${m.uid}`),
            uid: m.uid ?? 0,
            accountId: m.account_code || acc.accountCode,
            mailbox: m.mailbox || 'INBOX',
            messageId: m.message_id || m.messageId,
            fromAddress: m.from_address || m.fromAddress || '',
            fromName: m.from_name || m.fromName || '',
            toAddresses: (Array.isArray(m.to_addresses || m.toAddresses) ? (m.to_addresses || m.toAddresses) : []) as string[],
            ccAddresses: (Array.isArray(m.cc_addresses || m.ccAddresses) ? (m.cc_addresses || m.ccAddresses) : []) as string[],
            bccAddresses: [],
            subject: m.subject || '(No Subject)',
            htmlBody: m.html_body || m.htmlBody || null,
            textBody: m.text_body || m.textBody || null,
            date: m.date || new Date().toISOString(),
            isRead: (() => {
              const base = m.is_read ?? m.isRead ?? false;
              const cacheId = parseCacheId(m.id);
              const override = cacheId ? overrideMap.get(cacheId) : undefined;
              return override?.isRead ?? base;
            })(),
            isStarred: (() => {
              const base = m.is_starred ?? m.isStarred ?? false;
              const cacheId = parseCacheId(m.id);
              const override = cacheId ? overrideMap.get(cacheId) : undefined;
              return override?.isStarred ?? base;
            })(),
            hasAttachments: m.has_attachments ?? m.hasAttachments ?? false,
            attachmentsMetadata: (m.attachments_metadata || m.attachmentsMetadata || null) as InboxMailRecord['attachmentsMetadata'],
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
 * Live inbox sync — calls the /api/inbox/sync endpoint which connects to
 * the real IMAP/POP3 server and fetches new mails since the last known UID.
 * This is used by WebSocket push notifications (inbox_new_mail,
 * inbox_sync_complete) so newly arrived emails show up immediately.
 *
 * Unlike syncInboxMails() which reads from the server DB cache (fast but
 * may be stale), this triggers a real mail-server fetch — use sparingly.
 */
async function syncInboxMailsLive(): Promise<{ updated: number; deleted: number }> {
  try {
    const emailAccountsStr = localStorage.getItem('emailAccounts');
    if (!emailAccountsStr) {
      return { updated: 0, deleted: 0 };
    }

    const userId = getStoredUserId();
    const overrideMap = userId ? await getFlagOverrideMap(userId) : new Map<number, FlagUpdateRecord>();
    const accounts: Array<{ accountCode: string }> = JSON.parse(emailAccountsStr);
    let totalUpdated = 0;

    for (const acc of accounts) {
      try {
        // Get the highest UID we have locally
        const { getHighestUid } = await import('./db');
        const sinceUid = await getHighestUid(acc.accountCode);

        // Call the live sync endpoint (triggers IMAP/POP3 fetch)
        const res = await apiFetch('/api/inbox/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountCode: acc.accountCode,
            sinceUid: sinceUid > 0 ? sinceUid : undefined,
          }),
        });
        const resObj = res as Record<string, unknown>;
        const dataObj = resObj?.data as Record<string, unknown> | undefined;

        const serverMails = ((dataObj?.mails || resObj?.mails || []) as ApiInboxMail[]);
        if (serverMails.length) {
          const mails: InboxMailRecord[] = serverMails.map((m) => ({
            id: String(m.id ?? `${m.accountCode || acc.accountCode}:${m.uid}`),
            uid: m.uid ?? 0,
            accountId: m.accountCode || acc.accountCode,
            mailbox: m.mailbox || 'INBOX',
            messageId: m.message_id || m.messageId,
            fromAddress: m.from_address || m.fromAddress || '',
            fromName: m.from_name || m.fromName || '',
            toAddresses: (Array.isArray(m.to_addresses || m.toAddresses) ? (m.to_addresses || m.toAddresses) : []) as string[],
            ccAddresses: (Array.isArray(m.cc_addresses || m.ccAddresses) ? (m.cc_addresses || m.ccAddresses) : []) as string[],
            bccAddresses: [],
            subject: m.subject || '(No Subject)',
            htmlBody: m.html_body || m.htmlBody || null,
            textBody: m.text_body || m.textBody || null,
            date: m.date || new Date().toISOString(),
            isRead: (() => {
              const base = m.is_read ?? m.isRead ?? false;
              const cacheId = parseCacheId(m.id);
              const override = cacheId ? overrideMap.get(cacheId) : undefined;
              return override?.isRead ?? base;
            })(),
            isStarred: (() => {
              const base = m.is_starred ?? m.isStarred ?? false;
              const cacheId = parseCacheId(m.id);
              const override = cacheId ? overrideMap.get(cacheId) : undefined;
              return override?.isStarred ?? base;
            })(),
            hasAttachments: m.has_attachments ?? m.hasAttachments ?? false,
            attachmentsMetadata: (m.attachments_metadata || m.attachmentsMetadata || null) as InboxMailRecord['attachmentsMetadata'],
            labels: m.labels || [],
            syncedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdAt: m.created_at || m.createdAt || m.date || new Date().toISOString(),
          }));

          await upsertInboxMails(mails);
          totalUpdated += mails.length;
        }
      } catch (err) {
        console.warn(`[DeltaSync] Live sync failed for ${acc.accountCode}:`, err);
      }
    }

    return { updated: totalUpdated, deleted: 0 };
  } catch (error) {
    console.error('[DeltaSync] Failed to live-sync inbox mails:', error);
    throw error;
  }
}

/**
 * Debounced live sync — like debouncedSync but triggers the live IMAP
 * sync endpoint (syncInboxMailsLive) instead of the cache read.
 * Used for WebSocket push events (inbox_new_mail, inbox_sync_complete)
 * so newly arrived emails are fetched from the actual mail server.
 */
const pendingLiveSync: DebouncedCall = {
  tables: new Set(),
  since: null,
  timeout: null
};

function debouncedSyncLive(tables: SyncTable[]): void {
  tables.forEach(t => pendingLiveSync.tables.add(t));

  if (pendingLiveSync.timeout) {
    clearTimeout(pendingLiveSync.timeout);
  }

  pendingLiveSync.timeout = setTimeout(async () => {
    pendingLiveSync.tables.clear();
    pendingLiveSync.since = null;
    pendingLiveSync.timeout = null;

    if (!deltaSyncManager.isReady()) {
      console.debug('[DeltaSync] Debounced live sync skipped — manager shut down');
      return;
    }

    console.info('[DeltaSync] Executing debounced live sync for:', tables.join(', '));
    try {
      // Only inbox_mails supports the live sync path
      if (tables.includes('inbox_mails')) {
        const liveResult = await syncInboxMailsLive();
        // Notify the UI that the local cache was refreshed so pages
        // (Inbox, Dashboard) re-read from Dexie and show the new mail.
        // The 'inbox:new-mail' event dispatched in handleSyncSignal fires
        // BEFORE the sync completes; this event fires AFTER, ensuring the
        // UI refreshes with the freshly upserted data.
        if (liveResult.updated > 0) {
          window.dispatchEvent(new CustomEvent('inbox:sync-complete'));
        }
      }
      // For other tables (sent_mails, etc.), fall back to normal sync
      const otherTables = tables.filter(t => t !== 'inbox_mails');
      if (otherTables.length > 0) {
        await executeDeltaSync(otherTables);
      }
    } catch (error) {
      console.error('[DeltaSync] Debounced live sync error:', error);
    }
  }, DEBOUNCE_MS);
}

function parseCacheId(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return null;
  }
  return parsed;
}

/**
 * Sync email accounts (uses existing localStorage approach)
 */
async function syncAccounts(): Promise<void> {
  try {
    const response = await apiFetch('/api/email-accounts');
    const resObj = response as Record<string, unknown>;
    
    const emailAccounts = (Array.isArray(response) ? response : (resObj.emailAccounts || [])) as unknown[];
    const smtpAccounts = (Array.isArray(response) ? [] : (resObj.smtpAccounts || [])) as unknown[];
    
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
