import { apiFetch } from './apiFetch';
import {
  addFlagUpdate,
  bulkUpsertFlagUpdates,
  clearFlagUpdatesForUser,
  clearFlagUpdatesForOtherUsers,
  deleteFlagUpdates,
  getFlagUpdatesByStatus,
  getPendingFlagUpdateByCacheId,
  resetInFlightFlagUpdates,
  updateFlagUpdate,
  type FlagUpdateRecord,
  type FlagUpdateStatus,
} from './db';
import { wsClient, type ConnectionStatus, type SyncSignal } from './websocket';

export interface FlagUpdateInput {
  cacheId: string | number;
  isRead?: boolean;
  isStarred?: boolean;
}

interface FlagUpdateAck {
  type: 'flag_update_ack';
  batchId: string;
  acceptedIds: number[];
  rejectedIds: number[];
  timestamp: string;
  success?: boolean;
}

interface InFlightBatch {
  batchId: string;
  recordIds: string[];
  cacheIds: number[];
  transport: 'ws' | 'rest';
}

const BATCH_SIZE = 6;
const COOLDOWN_MS = 5 * 60 * 1000;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 30 * 1000;
const BACKOFF_MAX_MS = 30 * 60 * 1000;
const WS_ACK_TIMEOUT_MS = 30 * 1000;

class FlagSyncManager {
  private userId: string | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: InFlightBatch | null = null;
  private abortController: AbortController | null = null;
  private fireAndForgetTimeout: ReturnType<typeof setTimeout> | null = null;
  private ackTimeout: ReturnType<typeof setTimeout> | null = null;
  private backoffUntil: number | null = null;
  private backoffStep = 0;
  private isInitialized = false;
  private wsUnsubscribe: (() => void) | null = null;
  private wsStatusUnsubscribe: (() => void) | null = null;
  private broadcastChannel: BroadcastChannel | null = null;

  private readonly onOnline = () => {
    void this.scheduleFlush();
  };

  private readonly onPageHide = () => {
    void this.flush({ keepalive: true, fireAndForget: true });
  };

  private readonly onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      void this.flush({ keepalive: true, fireAndForget: true });
    }
  };

  private readonly onBeforeUnload = () => {
    void this.flush({ keepalive: true, fireAndForget: true });
  };

  private readonly onWsSignal = (signal: SyncSignal) => {
    if (signal.type !== 'flag_update_ack') return;
    void this.handleWsAck(signal as FlagUpdateAck);
  };

  private readonly onWsStatus = (status: ConnectionStatus) => {
    if (status === 'connected') {
      void this.scheduleFlush();
      return;
    }

    if (!this.inFlight || this.inFlight.transport !== 'ws') return;
    if (status === 'disconnected' || status === 'auth_failed') {
      void this.handleWsFailure('WebSocket disconnected');
    }
  };

  async initialize(userId: string): Promise<void> {
    if (!userId) return;
    if (this.userId === userId && this.isInitialized) return;

    this.userId = userId;
    this.isInitialized = true;

    await clearFlagUpdatesForOtherUsers(userId);
    await resetInFlightFlagUpdates(userId);

    this.wsUnsubscribe = wsClient.onSignal(this.onWsSignal);
    this.wsStatusUnsubscribe = wsClient.onStatusChange(this.onWsStatus);

    if (typeof BroadcastChannel !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel('mailvoyage-flag-sync');
    }

    window.addEventListener('online', this.onOnline);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('beforeunload', this.onBeforeUnload);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    void this.scheduleFlush();
  }

  async shutdown(clearQueue: boolean = true): Promise<void> {
    this.isInitialized = false;

    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    this.clearTimer();
    this.abortInFlight();
    if (this.fireAndForgetTimeout) {
      clearTimeout(this.fireAndForgetTimeout);
      this.fireAndForgetTimeout = null;
    }
    this.clearAckTimeout();

    if (this.wsUnsubscribe) {
      this.wsUnsubscribe();
      this.wsUnsubscribe = null;
    }
    if (this.wsStatusUnsubscribe) {
      this.wsStatusUnsubscribe();
      this.wsStatusUnsubscribe = null;
    }

    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }

    if (clearQueue && this.userId) {
      await clearFlagUpdatesForUser(this.userId);
    }

    this.userId = null;
  }

  async enqueue(update: FlagUpdateInput): Promise<void> {
    if (!this.userId) return;

    const cacheId = this.parseCacheId(update.cacheId);
    const hasRead = typeof update.isRead === 'boolean';
    const hasStarred = typeof update.isStarred === 'boolean';

    if (!cacheId || (!hasRead && !hasStarred)) {
      return;
    }

    const existing = await this.findPendingByCacheId(this.userId, cacheId);
    const now = new Date().toISOString();

    if (existing) {
      await updateFlagUpdate(existing.id, {
        isRead: hasRead ? update.isRead : existing.isRead,
        isStarred: hasStarred ? update.isStarred : existing.isStarred,
        status: 'pending',
        batchId: null,
        retryCount: 0,
        updatedAt: now,
      });
    } else {
      const record: FlagUpdateRecord = {
        id: crypto.randomUUID(),
        userId: this.userId,
        cacheId,
        isRead: hasRead ? update.isRead : undefined,
        isStarred: hasStarred ? update.isStarred : undefined,
        status: 'pending',
        batchId: null,
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      await addFlagUpdate(record);
    }

    void this.scheduleFlush();
  }

  async flush(options?: { keepalive?: boolean; fireAndForget?: boolean; forceRest?: boolean }): Promise<void> {
    if (!this.userId || this.inFlight) return;
    if (!navigator.onLine) {
      void this.scheduleFlush();
      return;
    }

    if (this.backoffUntil && Date.now() < this.backoffUntil) {
      void this.scheduleFlush();
      return;
    }

    const batch = await this.selectBatch(this.userId);
    if (!batch) return;

    const { records, batchId } = batch;
    const now = new Date().toISOString();

    const inFlightRecords = records.map((record) => ({
      ...record,
      status: 'in-flight' as FlagUpdateStatus,
      batchId,
      updatedAt: now,
    }));

    await bulkUpsertFlagUpdates(inFlightRecords);

    const recordIds = records.map((record) => record.id);
    const cacheIds = records.map((record) => record.cacheId);
    const useWebSocket = !options?.fireAndForget && !options?.forceRest && wsClient.isConnected();
    this.inFlight = { batchId, recordIds, cacheIds, transport: useWebSocket ? 'ws' : 'rest' };

    try {
      const payload = {
        batchId,
        updates: records.map((record) => ({
          cacheId: record.cacheId,
          isRead: record.isRead,
          isStarred: record.isStarred,
        })),
      };

      if (useWebSocket) {
        const sent = wsClient.sendMessage({ type: 'flag_update', ...payload });
        if (!sent) {
          this.inFlight.transport = 'rest';
          await this.sendViaRest(payload, options);
        } else {
          this.setAckTimeout(batchId);
        }
        return;
      }

      await this.sendViaRest(payload, options);
    } catch (error) {
      await this.handleFlushError(error);
      return;
    }
  }

  abortInFlight(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.clearAckTimeout();
  }

  /**
   * Persist all queued changes before an explicit logout revokes the session.
   * REST is used deliberately because its ACK is awaitable; WebSocket flush()
   * returns after send and can still be awaiting an ACK when shutdown clears
   * IndexedDB. Returns false when the bounded drain cannot complete.
   */
  async drainBeforeLogout(timeoutMs: number = 8000): Promise<boolean> {
    if (!this.userId) return true;

    const deadline = Date.now() + timeoutMs;
    this.clearTimer();
    this.resetBackoff();

    while (Date.now() < deadline && this.userId) {
      if (this.inFlight) {
        const activeBatchId = this.inFlight.batchId;
        await this.waitForBatchToSettle(activeBatchId, Math.min(1000, deadline - Date.now()));

        if (this.inFlight?.batchId === activeBatchId) {
          await this.handleFlushError(new Error('Logout drain switching batch to REST'));
          this.finalizeInFlight();
          this.resetBackoff();
        }
      }

      await this.flush({ forceRest: true });

      const pending = await getFlagUpdatesByStatus(this.userId, 'pending');
      const inFlight = await getFlagUpdatesByStatus(this.userId, 'in-flight');
      if (pending.length === 0 && inFlight.length === 0 && !this.inFlight) {
        return true;
      }
    }

    return false;
  }

  private waitForBatchToSettle(batchId: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const check = () => {
        if (!this.inFlight || this.inFlight.batchId !== batchId || Date.now() - startedAt >= timeoutMs) {
          resolve();
          return;
        }
        setTimeout(check, 25);
      };
      check();
    });
  }

  private clearTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private setAckTimeout(batchId: string): void {
    this.clearAckTimeout();
    this.ackTimeout = setTimeout(() => {
      void this.handleWsTimeout(batchId);
    }, WS_ACK_TIMEOUT_MS);
  }

  private clearAckTimeout(): void {
    if (this.ackTimeout) {
      clearTimeout(this.ackTimeout);
      this.ackTimeout = null;
    }
  }

  private parseCacheId(value: string | number): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
      return null;
    }
    return parsed;
  }

  private async findPendingByCacheId(userId: string, cacheId: number): Promise<FlagUpdateRecord | undefined> {
    return getPendingFlagUpdateByCacheId(userId, cacheId);
  }

  private async selectBatch(userId: string): Promise<{ records: FlagUpdateRecord[]; batchId: string } | null> {
    const pending = await getFlagUpdatesByStatus(userId, 'pending');
    if (pending.length === 0) return null;

    const withBatchId = pending.filter((record) => record.batchId);
    if (withBatchId.length > 0) {
      const batchId = withBatchId[0].batchId as string;
      const records = withBatchId.filter((record) => record.batchId === batchId);
      return { records, batchId };
    }

    const coalesced = this.coalesceUpdates(pending);
    const sorted = coalesced.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    const records = sorted.slice(0, BATCH_SIZE);
    const batchId = crypto.randomUUID();

    return { records, batchId };
  }

  private coalesceUpdates(records: FlagUpdateRecord[]): FlagUpdateRecord[] {
    const map = new Map<number, FlagUpdateRecord>();
    for (const record of records) {
      const existing = map.get(record.cacheId);
      if (!existing) {
        map.set(record.cacheId, record);
        continue;
      }

      if (record.updatedAt >= existing.updatedAt) {
        map.set(record.cacheId, record);
      }
    }
    return Array.from(map.values());
  }

  private async handleAck(ack: FlagUpdateAck): Promise<boolean> {
    if (!this.inFlight || ack.type !== 'flag_update_ack') return false;
    if (ack.batchId !== this.inFlight.batchId) return false;

    this.resetBackoff();

    // Guard instead of `this.userId!`: shutdown() can nullify userId while an
    // async ACK is in flight. Dropping the update processing here is safe —
    // logout clears the queue intentionally.
    if (!this.userId) return false;

    const accepted = new Set(ack.acceptedIds || []);
    const pendingUpdates = await getFlagUpdatesByStatus(this.userId, 'in-flight');
    const batchRecords = pendingUpdates.filter((record) => this.inFlight?.recordIds.includes(record.id));

    const deleteIds: string[] = [];
    const retryRecords: FlagUpdateRecord[] = [];

    for (const record of batchRecords) {
      if (accepted.has(record.cacheId)) {
        deleteIds.push(record.id);
        continue;
      }

      const retryCount = (record.retryCount || 0) + 1;
      if (retryCount > MAX_RETRIES) {
        deleteIds.push(record.id);
        continue;
      }

      retryRecords.push({
        ...record,
        status: 'pending',
        batchId: null,
        retryCount,
        updatedAt: new Date().toISOString(),
      });
    }

    await deleteFlagUpdates(deleteIds);
    await bulkUpsertFlagUpdates(retryRecords);

    this.notifyAck(ack);
    return true;
  }

  private async handleFlushError(error?: unknown): Promise<void> {
    if (!this.inFlight || !this.userId) return;

    const status = typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as Record<string, unknown>).status)
      : undefined;

    if (status === 401) {
      this.applyBackoff('auth');
    } else if (status === 429) {
      this.applyBackoff('rate-limit');
    } else {
      this.applyBackoff('network');
    }

    const inFlightRecords = await getFlagUpdatesByStatus(this.userId, 'in-flight');
    const batchRecords = inFlightRecords.filter((record) => this.inFlight?.recordIds.includes(record.id));

    const deleteIds: string[] = [];
    const retryRecords: FlagUpdateRecord[] = [];

    for (const record of batchRecords) {
      const retryCount = (record.retryCount || 0) + 1;
      if (retryCount > MAX_RETRIES) {
        deleteIds.push(record.id);
        continue;
      }

      retryRecords.push({
        ...record,
        status: 'pending' as FlagUpdateStatus,
        batchId: record.batchId,
        retryCount,
        updatedAt: new Date().toISOString(),
      });
    }

    await deleteFlagUpdates(deleteIds);
    await bulkUpsertFlagUpdates(retryRecords);
  }

  private async handleWsAck(ack: FlagUpdateAck): Promise<void> {
    const applied = await this.handleAck(ack);
    if (!applied) return;
    this.finalizeInFlight();
    void this.scheduleFlush();
  }

  private async handleWsTimeout(batchId: string): Promise<void> {
    if (!this.inFlight || this.inFlight.batchId !== batchId) return;
    await this.handleFlushError(new Error('WebSocket ack timeout'));
    this.finalizeInFlight();
    void this.scheduleFlush();
  }

  private async handleWsFailure(_reason: string): Promise<void> {
    if (!this.inFlight || this.inFlight.transport !== 'ws') return;
    await this.handleFlushError(new Error('WebSocket disconnected'));
    this.finalizeInFlight();
    void this.scheduleFlush();
  }

  private applyBackoff(reason: 'rate-limit' | 'network' | 'auth'): void {
    const base = reason === 'rate-limit'
      ? Math.max(BACKOFF_BASE_MS, 60 * 1000)
      : reason === 'auth'
        ? 5 * 60 * 1000
        : BACKOFF_BASE_MS;
    const multiplier = Math.pow(2, Math.min(this.backoffStep, 5));
    const delay = Math.min(BACKOFF_MAX_MS, base * multiplier);
    this.backoffStep += 1;
    this.backoffUntil = Date.now() + delay;
  }

  private resetBackoff(): void {
    this.backoffStep = 0;
    this.backoffUntil = null;
  }

  private finalizeInFlight(): void {
    this.clearAckTimeout();
    this.abortController = null;
    this.inFlight = null;
  }

  private notifyAck(ack: FlagUpdateAck): void {
    if (typeof window === 'undefined') return;
    const detail = {
      batchId: ack.batchId,
      acceptedIds: ack.acceptedIds,
      rejectedIds: ack.rejectedIds,
      timestamp: ack.timestamp,
    };
    window.dispatchEvent(new CustomEvent('flag-sync:ack', { detail }));
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({ type: 'flag_update_ack', ...detail });
    }
  }

  private async scheduleFlush(): Promise<void> {
    if (!this.userId || this.inFlight) return;

    this.clearTimer();

    const pending = await getFlagUpdatesByStatus(this.userId, 'pending');
    if (pending.length === 0) return;

    // Online WebSocket mode is the real-time path: send immediately and keep
    // the record until the server ACKs it. The five-minute cooldown is only
    // for REST/offline batching; applying it here lets a page refresh race
    // ahead of the server update and restore stale read/star state.
    if (wsClient.isConnected() && navigator.onLine) {
      void this.flush();
      return;
    }

    const coalesced = this.coalesceUpdates(pending);
    if (coalesced.length >= BATCH_SIZE) {
      void this.flush();
      return;
    }

    const oldest = coalesced.reduce((min, record) => {
      return record.updatedAt < min.updatedAt ? record : min;
    }, coalesced[0]);

    const elapsed = Date.now() - new Date(oldest.updatedAt).getTime();
    let delay = Math.max(0, COOLDOWN_MS - elapsed);

    if (this.backoffUntil && this.backoffUntil > Date.now()) {
      delay = Math.max(delay, this.backoffUntil - Date.now());
    }

    this.flushTimer = setTimeout(() => {
      void this.flush();
    }, delay);
  }

  private async sendViaRest(
    payload: { batchId: string; updates: Array<{ cacheId: number; isRead?: boolean; isStarred?: boolean }> },
    options?: { keepalive?: boolean; fireAndForget?: boolean; forceRest?: boolean }
  ): Promise<void> {
    const controller = new AbortController();
    this.abortController = controller;

    if (options?.fireAndForget) {
      void apiFetch('/api/inbox/flag-updates', {
        method: 'POST',
        body: JSON.stringify(payload),
        signal: controller.signal,
        keepalive: options?.keepalive === true,
      }).catch(() => {
        /* best-effort only */
      });
      this.fireAndForgetTimeout = setTimeout(() => {
        this.fireAndForgetTimeout = null;
        if (this.inFlight && this.inFlight.batchId === payload.batchId) {
          void this.handleFlushError(new Error('Fire-and-forget timeout')).finally(() => {
            this.finalizeInFlight();
            void this.scheduleFlush();
          });
        }
      }, WS_ACK_TIMEOUT_MS);
      return;
    }

    try {
      const response = await apiFetch('/api/inbox/flag-updates', {
        method: 'POST',
        body: JSON.stringify(payload),
        signal: controller.signal,
        keepalive: options?.keepalive === true,
      });

      const ack = response as FlagUpdateAck;
      await this.handleAck(ack);
    } catch (error) {
      await this.handleFlushError(error);
    } finally {
      this.finalizeInFlight();
      void this.scheduleFlush();
    }
  }
}

export const flagSync = new FlagSyncManager();

export default flagSync;
