# Unread Badge + Read State Persistence Report

Date: 2026-04-28

## Summary
The red unread badge reflects `EmailContext.unreadCount`, which is computed from Dexie inbox records. Read/unread updates are performed locally only, but inbox syncs and page reloads rehydrate from server cache data that does not preserve those local read flags. As a result, messages that were marked read locally are reloaded as unread after refresh or relogin, and the unread badge reappears.

The application already has a WebSocket connection (`wsClient`) for real-time sync signals. This connection can be leveraged to push small flag updates (read/unread/starred/deleted and similar lightweight mailbox state changes) to the server immediately when online, avoiding unnecessary API calls. The queue should only drain after a server ACK. If the WebSocket drops, pending items stay intact and are replayed through the REST fallback on reconnect. When offline or WebSocket is unavailable, a smart batching + cooldown strategy can batch multiple flag changes and flush them periodically.

## Expected Behavior
- When a user opens or marks an email as read, that read state should persist across refresh/relogin.
- Unread badge should reflect the latest local read state without requiring a full reload.
- Flag updates should be sent efficiently: real-time via WebSocket when connected, batched when offline or during cooldown.

## Current Behavior
- Opening a mail marks it as read locally, but the read state is lost after refresh/relogin or a server sync.
- The unread badge often reappears because the cached inbox data reverts to `isRead = false`.
- No server endpoint exists to persist `is_read`/`is_starred`.
- WebSocket is used only for receiving sync signals, not for sending flag updates.

## Files Reviewed (Frontend)
- src/contexts/EmailContext.tsx
- src/pages/EmailPage.tsx
- src/pages/InboxPage.tsx
- src/lib/db.ts
- src/lib/deltaSync.ts
- src/lib/dataSync.ts
- src/contexts/SyncContext.tsx
- src/lib/websocket.ts

## Files Reviewed (Backend)
- api/src/routes/inbox.router.ts
- api/src/controllers/inbox.controller.ts
- api/src/services/inbox.service.ts
- api/src/db/migrations/20260209000000_create_inbox_cache_and_user_settings.ts

## Key Findings

### 1) Read state is stored only in Dexie (client)
- EmailPage calls `markAsRead()` which only updates Dexie (`updateMailReadStatus`) and local context.
- InboxPage read toggle also only updates Dexie via `updateMailReadStatus`.
- There is no client path that persists read/unread state to the server.

### 2) Server cache overwrites local read state during sync
- `deltaSync.syncInboxMails()` fetches `/api/inbox/cached` and maps server rows to `InboxMailRecord` using `isRead = is_read ?? false`.
- This upserts into Dexie, overwriting local `isRead` values each sync or reload.
- POP3 path preserves local flags (since POP3 has no flags), but IMAP overwrites them.

### 3) Backend does not expose a read/unread update route
- `/api/inbox` routes include cached/fetch/sync/search/settings only.
- No `PUT /api/inbox/read` or similar endpoint to update `inbox_cache.is_read`.
- `inbox_cache` table does store `is_read` and `is_starred`, but they are only updated by IMAP/POP3 fetch.

### 4) IMAP flags are treated as authoritative but never updated
- IMAP fetch sets `isRead = flags.includes('\\Seen')`.
- The app does not set IMAP flags when a user reads mail locally.
- Result: server cache keeps `is_read = false`, rehydration resets to unread.

### 5) Unread badge can go stale when toggling read in Inbox list
- InboxPage uses `updateMailReadStatus`, but does not notify EmailContext.
- EmailContext unread count is not auto-refreshed on Dexie writes.
- This can leave `unreadCount` out of sync until the next reload/refresh.

### 6) WebSocket is available but underutilized for flag pushes
- `wsClient` is a singleton WebSocket client used by `SyncContext` for receiving sync signals.
- It supports sending arbitrary messages (`wsClient.send()`) but is only used for auth/ping/pong/sync_required.
- Could be used to push small flag deltas to the server in real time.

## Primary Root Cause
Local read/unread changes are never persisted beyond Dexie, and sync logic overwrites local flags with server cache values. This makes unread state non-durable across reloads or sync events. The existing WebSocket infrastructure is not used to push flag updates, and no batching/cooldown strategy exists for offline scenarios.

## Current WebSocket + Manual Sync Flow (Verified)
- The WebSocket channel is used for lightweight signals only (`sync_required`, `inbox_new_mail`, `inbox_sync_complete`, `settings_updated`).
- `deltaSync` listens to those signals and triggers a debounced API sync; no mail payloads are pushed over WebSocket.
- When WebSocket is connected, the Dashboard shows **Live**. If it disconnects, the UI shows **Manual Sync** and offers **Sync Now** / **Reconnect** actions.
- Manual sync is rate-limited (minimum 30 seconds between manual sync attempts).
- On reconnect, `deltaSync` does **not** auto-sync; it waits for server signals to avoid API flooding. If the server never emits a signal, users must trigger manual sync.

## Missing Pieces / Gaps
1) No server endpoint to update `inbox_cache.is_read` / `is_starred`.
2) No API to set IMAP flags when reading (if server-side truth is intended).
3) No merge strategy to preserve local read state when syncing from `/api/inbox/cached`.
4) EmailContext unread count is not updated when InboxPage toggles read/unread.
5) No batching/cooldown mechanism for flag updates when WebSocket is unavailable.
6) No ACK contract yet for safe queue removal after server confirmation.
7) `wsClient` has no public send method for custom messages; `send()` is currently private.
8) WebSocket server only handles `auth` and `ping` today, so `flag_update` would be ignored.
9) Flag updates currently identify rows by `messageId` only, which may be missing or non-unique across accounts.

## Optimized Plan: Smart Flag Sync with WebSocket + Batching

Leverage the existing `wsClient` for real-time flag pushes, and implement a local queue with batching and cooldown for offline/backup scenarios.

### Architecture
The same queue manager owns both transport paths so ACK handling stays identical whether the update goes over WebSocket or REST.

#### ACK Contract
- Every batch gets a stable `batchId` / mutation id.
- The client keeps queued items until the server replies with `flag_update_ack`.
- The ack should include the `batchId`, `acceptedIds`, `rejectedIds`, and a server timestamp.
- Partial ack removes only confirmed mutations; rejected items stay queued for retry.
- A WebSocket disconnect before ACK is treated as "not delivered yet", not as success.
- The same contract should be mirrored by the REST fallback so the client can use one queue state machine for both transports.

#### A) Real-time path (WebSocket connected)
- When user toggles read/unread/starred/delete, push a small delta message immediately via WebSocket with a `batchId`:
  ```ts
  wsClient.send({
    type: 'flag_update',
    batchId: '...',
    updates: [
      { messageId: '...', isRead: true, isStarred: false }
    ]
  })
  ```
- Server receives and applies to `inbox_cache` (and optionally updates IMAP flags).
- Server responds with `flag_update_ack` after the batch is committed.
- The client removes only the ACKed items from the queue, not on send.
- Server can also broadcast `inbox_sync_complete` or a lightweight sync signal so other tabs/devices stay in sync.
- No API call overhead, minimal latency, single small message.

#### B) Offline / Cooldown path (WebSocket disconnected or fallback)
- Maintain a local Dexie "flag_updates" queue (or in-memory + persisted).
- When a flag change occurs and WebSocket is not ready, enqueue the update with timestamp.
- Flush conditions (whichever comes first):
  1. **Batch size**: queue reaches N items (e.g., 5-6 changes) → flush immediately via single API call.
  2. **Cooldown timer**: oldest item in queue is older than T (e.g., 5 minutes) → flush regardless of size.
  3. **WebSocket reconnect**: on reconnect, flush entire queue via WebSocket or API.
  4. **App visibility/page hide**: flush before page unload.
- Flush API: `POST /api/inbox/flag-updates` with batch payload:
  ```json
  { updates: [{ messageId, isRead, isStarred }, ...] }
  ```
- Server applies batch to `inbox_cache` in a single transaction and returns the same ACK contract.
- If the WebSocket disconnects before confirmation, the queue remains intact and is replayed through REST on reconnect.
- The REST response should be treated as the durable confirmation path for any mutations that were not ACKed over WebSocket.

#### C) Merge strategy for incoming syncs
- During `syncInboxMails` / `upsertInboxMails`, detect conflicts between server `is_read`/`is_starred` and local overrides.
- Options:
  - Prefer server for IMAP accounts (server flags are authoritative) but preserve local overrides for POP3.
  - Or maintain a "local_override" table: if a local override exists and is newer than server `updated_at`, keep local value and push it to server on next flush.
- This prevents server sync from clobbering local read state.
- The same pattern can extend to lightweight mailbox flags such as archive, label, or soft-delete state when those are stored as cached flags rather than hard deletes.

#### D) Cross-tab / EmailContext consistency
- When InboxPage toggles read/unread, also update EmailContext unread count (or have EmailContext listen to Dexie changes).
- Use BroadcastChannel or a simple event emitter so all tabs know about flag changes and can update their counts.
- On flush success, remove items from queue and update UI counts.
- When a batch is only partially ACKed, update counts for the confirmed subset only.

### Implementation Sketch

#### 1) New backend endpoint (api/src/routes/inbox.router.ts)
```ts
router.post('/flag-updates', auth, async (req, res) => {
  const { updates } = req.body; // { messageId, isRead?, isStarred? }[]
  const result = await inboxService.applyFlagUpdates(req.user.id, updates);
  res.json({
    type: 'flag_update_ack',
    batchId: req.body.batchId,
    acceptedIds: result.acceptedIds,
    rejectedIds: result.rejectedIds,
    timestamp: new Date().toISOString()
  });
});
```

#### 2) Service method (api/src/services/inbox.service.ts)
```ts
export async function applyFlagUpdates(userId: string, updates: FlagUpdate[]) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const u of updates) {
      await client.query(
        `UPDATE inbox_cache SET is_read = COALESCE($1, is_read), is_starred = COALESCE($2, is_starred), updated_at = NOW()
         WHERE user_id = $3 AND message_id = $4`,
        [u.isRead, u.isStarred, userId, u.messageId]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

#### 3) Frontend flag queue (src/lib/flagSync.ts)
```ts
class FlagSyncManager {
  private queue: FlagUpdate[] = [];
  private inFlightBatch: { batchId: string; updates: FlagUpdate[] } | null = null;
  private timer: any = null;
  private batchSize = 6;
  private cooldownMs = 5 * 60 * 1000;

  enqueue(update: FlagUpdate) {
    this.queue.push({ ...update, ts: Date.now() });
    this.scheduleFlush();
  }

  private scheduleFlush() {
    // Flush immediately if batch size reached
    if (this.queue.length >= this.batchSize) {
      this.flush();
      return;
    }
    // Otherwise schedule by cooldown
    if (this.timer) clearTimeout(this.timer);
    const oldest = this.queue[0];
    if (oldest) {
      const delay = Math.max(0, this.cooldownMs - (Date.now() - oldest.ts));
      this.timer = setTimeout(() => this.flush(), delay);
    }
  }

  async flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.queue.length === 0 || this.inFlightBatch) return;

    const batchId = crypto.randomUUID();
    const batch = this.queue.slice(0, this.batchSize);
    this.inFlightBatch = { batchId, updates: batch };

    try {
      if (wsClient.isConnected()) {
        wsClient.send({ type: 'flag_update', batchId, updates: batch });
      } else {
        const response = await apiFetch('/api/inbox/flag-updates', { method: 'POST', body: { batchId, updates: batch } });
        this.handleAck(response);
      }
    } catch (e) {
      // Keep the queue intact on failure; retry later or after reconnect.
      this.inFlightBatch = null;
    }
  }

  handleAck(message: { type?: string; batchId?: string; acceptedIds?: string[]; rejectedIds?: string[] }) {
    if (message.type !== 'flag_update_ack' || message.batchId !== this.inFlightBatch?.batchId) {
      return;
    }

    const accepted = new Set(message.acceptedIds || []);
    this.queue = this.queue.filter(item => !accepted.has(item.messageId));

    // Rejected items remain queued for the next retry window.
    this.inFlightBatch = null;
    this.scheduleFlush();
  }
}
```

#### 4) Integrate with EmailContext / InboxPage
- Replace direct `updateMailReadStatus` calls with `flagSync.enqueue()` + local Dexie update.
- Keep the local UI optimistic, but only treat the server-side queue item as persisted after `flag_update_ack`.
- On EmailContext load, also load any pending flag_updates from Dexie to re-queue after reconnect.
- If reconnect happens after a disconnect, flush the queue through REST first, then resume real-time WS pushes.

## Feasibility Check (Current Codebase)
The plan is compatible with the current architecture but will not work without the following concrete code changes:

- **WebSocket client API**: `wsClient.send()` is private. A public method (e.g., `sendMessage`) is required for `flag_update`.
- **WebSocket server handling**: `WebSocketService` currently only accepts `auth` and `ping`. It must handle `flag_update` and respond with `flag_update_ack`.
- **Message typing**: `SyncSignal` on both client and server must include `flag_update` and `flag_update_ack`.
- **Keying updates**: `messageId` alone is not safe. Use a stable key like `accountCode + mailbox + uid`, or the cache `id`, and include those in updates.
  - **Explicit recommendation**: In server `applyFlagUpdates`, match rows by **server cache `id`** (numeric primary key) or composite `(user_id, account_code, mailbox, uid)`.
  - In Dexie, the `id` field is typically `accountCode:uid`; map to server cache `id` before sending or send both keys.
  - Return accepted/rejected as server cache `id` values in the ACK so client can correlate back to Dexie records.
- **Idempotency + coalescing**: queue should coalesce by message key (last-write-wins) to avoid out-of-order toggles and duplicate sends.
  - Implement as: `queue = { [key]: { isRead, isStarred, ts } }` object map, not array. Toggling same mail twice = single queue entry (LWW).
  - Drain by converting object to array, then back to array on ACK for iteration.
- **IMAP overwrite risk**: if IMAP flags remain authoritative, server-side flag updates must also update IMAP flags or the next IMAP sync will undo them.
  - For now, recommend: treat local flags as **user intent** and preserve them on sync (add to POP3-style "preserve" logic for IMAP too).
  - Or: add a migration step to set IMAP flags when user toggles read (requires IMAP server connectivity at that moment).
- **Delete semantics**: current delete uses dedicated API calls. Only include delete in the flag queue if it is implemented as a soft-delete flag.
  - For now: **exclude delete from flag queue**. Keep hard-delete API calls separate.
- **Logout safety**: queued updates should be cleared on logout to avoid cross-user mutation leaks.
  - Implement in `AuthContext.logout()`: call `flagSync.clear()` before `performCompleteLogout()`.
  - Or persist queue to Dexie (scoped by userId) and purge on login if userId changed.
- **Ack reliability**: server should return accepted/rejected IDs based on row updates; missing rows (trimmed cache) must be rejected to avoid silent drops.
  - Use `UPDATE ... WHERE ...` and check `rowCount > 0` to determine accepted vs. rejected.
  - Client should retry rejected items (they may be re-added after next sync) or drop if cache is persistently gone.

## Known Limitations / Risks
- **Server cache trimming**: `trimInboxToLimit` can remove rows; queued updates for trimmed rows will be rejected and should be dropped or migrated.
  - **Mitigation**: Persist flag queue to Dexie scoped by account+mailbox. On next sync, if trimmed row is re-fetched, replay the queued flag update.
- **Multi-tab conflicts**: two tabs can send conflicting updates. Prefer last-write-wins and broadcast updated flags to all tabs.
  - **Mitigation**: Use BroadcastChannel to send `flag_update_ack` + updated flags to all tabs after server accepts. Update local Dexie on all tabs.
  - **Scope note**: BroadcastChannel only works same-origin/same-browser. Multi-device sync relies on server as source of truth (next full sync).
- **Offline toggle churn**: without coalescing, rapid toggles will create redundant batches.
  - **Mitigation**: coalesce queue by key (see above).
- **REST fallback ordering**: if a batch is in-flight over WS and a REST flush occurs, ensure only one transport is active or use `batchId` de-duplication server-side.
  - **Mitigation**: client should block REST flush if `inFlightBatch` is non-null (WS in progress). Or server de-dupes by `batchId`.
  - **REST ACK format**: POST `/api/inbox/flag-updates` should return **identical** `flag_update_ack` JSON so client `handleAck()` works for both transports.

### Benefits
- Real-time sync via WebSocket when online: single small message, no API overhead.
- Efficient batching when offline: reduces API calls, respects cooldown.
- No lost updates: queue persists across reloads (if stored in Dexie) and only drains on ACK.
- Works with existing IMAP/POP3 logic: IMAP accounts can still have server flag updates; POP3 keeps local overrides.
- Cross-tab consistency via BroadcastChannel or Dexie observables.
- Safer retries: the ACK contract prevents false success when the socket disconnects mid-flight.

## Evidence Links (Code Pointers)
- WebSocket client: `src/lib/websocket.ts` — `wsClient.send()` available.
- Flag update local-only: `EmailContext.markAsRead`, `updateMailReadStatus` in db.ts.
- Sync overwrites flags: `deltaSync.syncInboxMails` and `dataSync.fetchInbox`.
- IMAP flags authoritative: `inbox.service.ts` IMAP fetch (`isRead = flags.includes('\\Seen')`).
- No batch flag endpoint: `api/src/routes/inbox.router.ts`.

## Conclusion
Unread state persistence breaks because local read flags are not persisted and are overwritten by server cache syncs. The app already has a WebSocket infrastructure that can be used to push flag updates in real time, avoiding per-change API calls. To make that safe, the queue must be ACK-driven: keep pending mutations until the server sends `flag_update_ack`, and do not drop items on send success alone. When WebSocket is unavailable, a batching + cooldown strategy (flush at 5–6 items or 5 minutes) ensures updates are sent efficiently. If the socket drops, the queue stays intact and is replayed through REST on reconnect. Combining this with a merge strategy during sync (prefer server for IMAP, preserve local overrides for POP3) and cross-tab consistency fixes will make unread/starred state durable and the unread badge reliable.

**⚠️ CRITICAL: A comprehensive failcase analysis identified 40+ edge cases and 10 critical issues. See [FAILCASE_ANALYSIS.md](FAILCASE_ANALYSIS.md) before implementation. Key issues**:
- Server-side **idempotency** (prevent duplicate mutations on retry)
- **Logout safety** (prevent in-flight batch from applying to next user)
- **WebSocket + REST race conditions** (prevent dual-transport conflicts)
- **Dexie quota & corruption** recovery
- **IMAP UID reuse** after cache trimming
- **State machine** robustness

## Final Review Notes (Scope + Open Questions)
- **Scope note**: This review focused on the sync, WebSocket, inbox cache, and dashboard status flows that affect unread/flag updates. A full line-by-line read of every file in the workspace was not performed.
- **Implementation priority**: 
  1. Add REST endpoint + service method first (no WS needed yet; simpler to test).
  2. Add queue + coalescing logic + Dexie persistence.
  3. Wire into EmailContext / InboxPage (`flagSync.enqueue()` on read/star toggle).
  4. Then add WebSocket client public `send()` + server handler + ACK loop (hardest part).
- **Open question**: Should server-side flag updates also set IMAP flags (true source of truth) or should local overrides be authoritative for IMAP too?
- **Open question**: On logout, should flag queue be persisted to Dexie (scoped by userId) or cleared immediately? (Persist = recover after crash; clear = simpler/safer for multi-user devices).
- **Potential edge**: Manual sync is rate-limited to 30 seconds, so rapid manual refreshes will be ignored.
- **Potential edge**: If the server does not emit `sync_required`/`inbox_new_mail`, reconnects will not auto-sync by design.
- **Potential edge**: If REST endpoint times out after 30s but succeeds server-side, client will treat as failed and retry. Server must handle duplicate `batchId` idempotently.

## Page Reload / Unload Edge Cases

**Problem**: In-memory queue is lost on page unload unless persisted.

- **WebSocket mode during unload**:
  - If `wsClient.send()` is sent but ACK doesn't arrive before disconnect, the in-memory queue item is lost.
  - **Fix**: Persist queue to Dexie immediately on enqueue, not after ACK.
  - If queue is in Dexie, it survives the reload and resumes on app start.

- **REST mode during unload**:
  - If a flush is queued but not yet sent (cooldown pending), the in-memory queue is lost on unload.
  - If a flush is in-flight (POST request pending), the browser may cancel it on unload.
  - **Fix**: Add `beforeunload` handler to flush immediately before page closes:
    ```ts
    window.addEventListener('beforeunload', () => {
      flagSync.flush(); // Don't wait for ACK, just send
    });
    ```
  - Alternatively, add `visibilitychange` listener to flush when tab hidden (no guarantee, but better than nothing).
  - **Caveat**: `beforeunload` flush is best-effort; browser may cancel the request anyway.

- **Cross-tab unload**:
  - If one tab unloads and broadcasts a flush via BroadcastChannel, other tabs may also flush, creating duplicate batches.
  - **Fix**: Use a shared `lastBatchId` in Dexie or localStorage to detect duplicates; server de-dupes by `batchId`.

## Logout Edge Cases

**Problem**: Queued items can leak to next user or apply silently after logout.

- **In-flight batch during logout**:
  - If a REST request is pending when `logout()` is called, the browser may cancel it but server may still process it.
  - After logout, the queue is cleared but the server mutation has already applied (SILENT MUTATION ❌).
  - **Fix**: On logout, immediately cancel in-flight XHR/Fetch requests:
    ```ts
    // In AuthContext.logout()
    flagSync.abortInFlightBatch(); // Cancel pending REST request
    flagSync.clear(); // Clear queue
    await performCompleteLogout();
    ```
  - Server should not apply mutations for users who are no longer authenticated (would reject requests anyway, but ensure this is the case).

- **Queue persistence across logout**:
  - If queue is stored in Dexie scoped by `userId`, old user's queued items may remain.
  - Next user logs in, starts fresh app, loads old queue accidentally.
  - **Fix**: On app start, in `EmailContext.init()` or `SyncContext.init()`:
    ```ts
    const currentUserId = user.id;
    const orphanedQueue = await dexie.flagQueue.where('userId').notEqual(currentUserId).toArray();
    if (orphanedQueue.length > 0) {
      await dexie.flagQueue.bulkDelete(orphanedQueue.map(q => q.id));
    }
    ```
  - Alternatively, clear flag queue entirely on logout (simpler but loses updates if app crashes during logout).

- **Multi-tab logout sync**:
  - User logs out in Tab A. Tab B is still open with pending queue items.
  - Tab B sees logout (via AuthContext or BroadcastChannel) but hasn't flushed yet.
  - Should Tab B flush queue for old user or discard it?
  - **Recommendation**: Discard. On logout broadcast, all tabs should:
    ```ts
    window.addEventListener('logoutEvent', () => {
      flagSync.abort(); // Cancel in-flight
      flagSync.clear(); // Clear queue
      // Then redirect to login
    });
    ```
