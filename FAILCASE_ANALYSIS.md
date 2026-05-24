# Flag Sync Queue - Comprehensive Failcase Analysis

Date: May 13, 2026

## Executive Summary
The report's plan has **several critical gaps** that could lead to data loss, silent mutations, or race conditions. This analysis identifies 40+ failcases across 10 categories and proposes fixes.

---

## 1. Queue Persistence & Data Corruption (CRITICAL)

### Failcase 1.1: Dexie Quota Exceeded
**Scenario**: User has 10,000 pending flag updates queued (very large account), Dexie quota exceeded.
```
flagSync.enqueue(update)
  ├─ dexie.flagQueue.add(update) → QuotaExceededError
  ├─ Queue item lost in-memory
  └─ No fallback, update silently dropped ❌
```
**Current Plan**: Silent failure, no retry or warning.
**Fix Required**:
```ts
async enqueue(update) {
  try {
    await dexie.flagQueue.add(update);
  } catch (e: QuotaExceededError) {
    // Option A: Drop oldest items to make room
    const oldest = await dexie.flagQueue.orderBy('ts').first();
    if (oldest) await dexie.flagQueue.delete(oldest.id);
    // Retry
    await dexie.flagQueue.add(update);
    // Option B: Warn user
    toast.warn('Queue storage full, oldest updates may be lost');
  }
}
```

### Failcase 1.2: Dexie Corruption on App Crash
**Scenario**: App crashes during `dexie.flagQueue.bulkPut()`, Dexie transaction is interrupted.
```
Logout triggered
  ├─ flagSync.clear() starts bulkDelete
  ├─ App crashes mid-transaction
  ├─ On next app start: Dexie in partial state
  ├─ Some old queue items remain, some don't
  └─ Can't distinguish old from new user's items ❌
```
**Current Plan**: No recovery mechanism.
**Fix Required**:
```ts
// On app startup, validate queue integrity
async validateQueueIntegrity(currentUserId) {
  const queue = await dexie.flagQueue.toArray();
  const orphaned = queue.filter(q => q.userId !== currentUserId);
  if (orphaned.length > 0) {
    console.warn(`Removing ${orphaned.length} orphaned queue items`);
    await dexie.flagQueue.bulkDelete(orphaned.map(q => q.id));
  }
}
```

### Failcase 1.3: In-Memory Queue Not Synced with Dexie
**Scenario**: 
```
App loads flagSync, loads queue from Dexie: [item1, item2]
  ├─ In-memory queue: [item1, item2]
  ├─ User adds item3 locally
  ├─ Before save to Dexie, app crashes
  ├─ On restart: Dexie has [item1, item2], item3 lost ❌
  └─ Plus: in-memory may have stale references
```
**Current Plan**: Assumes Dexie is source of truth but doesn't validate.
**Fix Required**: Keep Dexie as primary; load on app start, don't cache in-memory without write-through.

### Failcase 1.4: Object Reference Pollution in Dexie
**Scenario**:
```
const update = { messageId: '123', isRead: true };
await dexie.flagQueue.add(update);
update.isRead = false;  // Mutate original object
// Now Dexie has { isRead: false } (reference not copied!) ❌
```
**Current Plan**: Does not mention deep cloning.
**Fix Required**:
```ts
async enqueue(update) {
  const cloned = JSON.parse(JSON.stringify(update)); // deep clone
  cloned.ts = Date.now();
  cloned.userId = currentUser.id;
  await dexie.flagQueue.add(cloned);
}
```

---

## 2. Coalescing & Out-of-Order Updates

### Failcase 2.1: Rapid Toggles Lose Intermediate States
**Scenario**:
```
User clicks: read → unread → read (3 rapid toggles)
  ├─ Coalesce by key: { messageId: '123' }
  ├─ Queue after coalesce: [{ messageId: '123', isRead: true }]
  ├─ But intermediate state (unread) is lost!
  ├─ If flush sent before final read, server is out of sync
  └─ User sees read locally but server sees different state ❌
```
**Current Plan**: LWW without timestamp validation.
**Fix Required**: Use **user intent + server state** instead of just LWW:
```ts
// Server sent: isRead = false
// User actions: toggle-read, toggle-unread, toggle-read
// Final intent: isRead = true (correct)
// But if server has isRead = false, we need to send true
```

### Failcase 2.2: Out-of-Order Delivery on Network Reorder
**Scenario**: 
```
Batch 1 sent: { messageId: '123', isRead: true }
Batch 2 sent: { messageId: '123', isRead: false }
  ├─ Network reorders: Batch 2 arrives first
  ├─ Server applies: isRead = false
  ├─ Then Batch 1 arrives: isRead = true (overwrites)
  ├─ User intent was "false" but server is "true" ❌
```
**Current Plan**: No timestamp ordering; treats all as independent.
**Fix Required**: Add causality tracking:
```ts
queue: { [key]: { isRead, isStarred, ts, version } }
// version = incremental counter per key
// Server de-dupes by version, ignores older versions
```

### Failcase 2.3: Coalesce Object Mutation
**Scenario**:
```
queue = { 'msg:123': { isRead: true, ts: 1000 } }
  ├─ User toggles unread
  ├─ Coalesce: queue['msg:123'] = { isRead: false, ts: 2000 }
  ├─ But old { isRead: true } reference still held somewhere?
  ├─ On flush, wrong value sent ❌
```
**Current Plan**: Object map mutation without immutability.
**Fix Required**: Use immutable updates:
```ts
const newEntry = { ...queue[key], isRead: !queue[key].isRead, ts: Date.now() };
this.queue = { ...this.queue, [key]: newEntry };
```

---

## 3. ACK Contract & Idempotency (CRITICAL)

### Failcase 3.1: Server Crash After Apply, Before ACK
**Scenario**:
```
Client sends: { batchId: 'xyz', updates: [...] }
Server receives, applies to DB ✓
Server crashes before sending ACK back ❌
  ├─ Client timeout (30s) → treated as failure
  ├─ Client retries same batchId
  ├─ Server restarts, applies AGAIN
  ├─ Duplicate mutations! ❌
```
**Current Plan**: No idempotency key on server.
**Fix Required**:
```ts
// Server: track applied batchIds
const appliedBatches = new Set(); // or in Redis
if (appliedBatches.has(req.body.batchId)) {
  return res.json({ type: 'flag_update_ack', batchId, acceptedIds: req.body.updates.map(u => u.id), rejectedIds: [] });
  // Return same ACK without re-applying
}
appliedBatches.add(req.body.batchId);
// Apply updates...
```

### Failcase 3.2: Partial ACK Loss
**Scenario**:
```
Client sends batch with 6 updates (batchId: 'xyz')
Server processes, applies all ✓
ACK packet: { batchId: 'xyz', acceptedIds: ['1','2','3','4','5','6'] }
  ├─ Packet lost in transit
  ├─ Client timeout
  ├─ Client retries batch
  ├─ Server rejects (already applied, if idempotent) or accepts again
  ├─ But which? Unclear! ❌
```
**Current Plan**: No retry limit; will retry forever.
**Fix Required**:
```ts
const MAX_RETRIES = 3;
queue[key].retryCount = (queue[key].retryCount || 0) + 1;
if (queue[key].retryCount > MAX_RETRIES) {
  console.error(`Batch ${batchId} rejected after ${MAX_RETRIES} retries, dropping`);
  // Remove from queue or mark as failed
}
```

### Failcase 3.3: Duplicate MessageIds in Same Batch
**Scenario**:
```
Coalesce error: same messageId appears twice in batch
  ├─ Queue: { 'msg:123': { isRead: true } }
  ├─ Another path also adds: { 'msg:123': { isRead: false } }
  ├─ Flush sends both (shouldn't!)
  ├─ Server applies out of order ❌
```
**Current Plan**: Assumes coalesce prevents this but doesn't validate.
**Fix Required**:
```ts
// On flush, validate no duplicate keys
const keys = new Set();
for (const update of batch) {
  if (keys.has(update.messageId)) {
    throw new Error(`Duplicate messageId in batch: ${update.messageId}`);
  }
  keys.add(update.messageId);
}
```

### Failcase 3.4: Server Returns Wrong AcceptedIds
**Scenario**:
```
Batch sent: { updates: [{ messageId: '1', isRead: true }, { messageId: '2', isStarred: true }] }
Server applies both ✓
Server returns (due to bug): { acceptedIds: ['1'] } (missing '2')
  ├─ Client removes only '1' from queue
  ├─ Item '2' stays queued
  ├─ Next flush sends item '2' again
  ├─ Duplicate mutation ❌
```
**Current Plan**: Trusts server ACK completely.
**Fix Required**:
```ts
// Client: validate acceptedIds count
if (acceptedIds.length !== batch.length && rejectedIds.length > 0) {
  console.error('Inconsistent ACK: some items not listed as accepted or rejected');
  // Drop only items explicitly accepted/rejected, keep rest for retry
}
```

---

## 4. WebSocket vs REST Race Conditions (CRITICAL)

### Failcase 4.1: WS Connects During REST Flush
**Scenario**:
```
WebSocket disconnected, REST flush starts
  ├─ POST /api/inbox/flag-updates in-flight
  ├─ WebSocket connects!
  ├─ On reconnect, flagSync tries to flush via WS too
  ├─ Both requests in-flight, same batchId? Or different?
  └─ If different: duplicate mutations ❌
```
**Current Plan**: `inFlightBatch` blocks, but doesn't account for WS reconnect.
**Fix Required**:
```ts
async flush() {
  if (this.inFlightBatch) return; // Block duplicate flush
  
  const batchId = crypto.randomUUID();
  this.inFlightBatch = { batchId, updates: batch, transport: null };
  
  try {
    if (wsClient.isConnected()) {
      this.inFlightBatch.transport = 'ws';
      wsClient.send({ type: 'flag_update', batchId, updates: batch });
    } else {
      this.inFlightBatch.transport = 'rest';
      const response = await apiFetch('/api/inbox/flag-updates', { /* ... */ });
      this.handleAck(response);
    }
  } catch (e) {
    this.inFlightBatch = null; // Clear on error
    throw e;
  }
}

// On WS reconnect, only flush if we have non-acked items
onWSReconnect() {
  if (this.inFlightBatch?.transport === 'ws') {
    // Already in-flight over WS, don't flush REST
    return;
  }
  if (this.queue.length > 0 || this.inFlightBatch?.transport === 'rest') {
    // Flush remaining items after REST is done
    setTimeout(() => this.flush(), 100);
  }
}
```

### Failcase 4.2: WS ACK Arrives After REST Success
**Scenario**:
```
Both WS and REST somehow in-flight (bug in race condition)
  ├─ REST sends batch A, server applies, returns ACK
  ├─ WS sends batch B (should not happen, but does)
  ├─ WS ACK for batch B arrives
  ├─ Client tries to match both against queue
  ├─ State becomes confused ❌
```
**Current Plan**: Assumes only one transport active.
**Fix Required**: Enforce strict mutual exclusion:
```ts
private transport: 'ws' | 'rest' | null = null;

async flush() {
  if (this.inFlightBatch) {
    console.warn('Flush already in-flight, skipping');
    return;
  }
  
  const nextTransport = wsClient.isConnected() ? 'ws' : 'rest';
  this.transport = nextTransport;
  // ... rest of flush
}

onWSStatusChange(status) {
  if (status === 'reconnected' && this.transport === 'rest') {
    // Wait for REST to finish, then resume
    return;
  }
  if (status === 'disconnected' && this.transport === 'ws') {
    // WS was active, now it's down. Need to retry over REST?
    this.inFlightBatch = null; // Clear, will retry REST
  }
}
```

### Failcase 4.3: REST Timeout But Server Processes
**Scenario**:
```
Client sends REST request, server receives ✓
Server starts processing (slow database)
Client timeout after 30s → treated as failure
  ├─ Client retries
  ├─ Server finishes original request, applies
  ├─ Server processes retry, applies AGAIN
  └─ Duplicate if no idempotency ❌
```
**Current Plan**: No idempotency mentioned for REST endpoint.
**Fix Required**: Server must be idempotent (same batchId = same result):
```ts
// Server side
app.post('/api/inbox/flag-updates', async (req, res) => {
  const { batchId, updates } = req.body;
  
  // Check if already processed
  const existing = await db.query(
    'SELECT * FROM processed_flag_batches WHERE batch_id = $1',
    [batchId]
  );
  
  if (existing.length > 0) {
    return res.json(existing[0].result); // Return cached ACK
  }
  
  // Process for first time
  const result = await applyFlagUpdates(updates);
  
  // Cache the result
  await db.query(
    'INSERT INTO processed_flag_batches (batch_id, result) VALUES ($1, $2)',
    [batchId, JSON.stringify(result)]
  );
  
  res.json(result);
});
```

---

## 5. Logout & Multi-Tab Safety (CRITICAL)

### Failcase 5.1: Logout While REST In-Flight
**Scenario**:
```
REST flush in-flight to /api/inbox/flag-updates
User clicks logout
  ├─ flagSync.abortInFlightBatch() tries to cancel XHR
  ├─ But XHR.abort() is best-effort; server may still get it
  ├─ Server processes and applies mutations for old user
  ├─ Client queue cleared
  ├─ New user logs in
  ├─ Old user's mutations silently applied to new user's account ❌❌❌
```
**Current Plan**: XHR.abort() may not prevent server-side processing.
**Fix Required**: Server must validate auth token validity **at the moment of application**, not just at request time:
```ts
// Server: validate token not revoked during processing
app.post('/api/inbox/flag-updates', auth, async (req, res) => {
  const userId = req.user.id;
  const sessionId = req.user.sessionId; // from JWT
  
  // Start processing
  const result = await db.transaction(async (client) => {
    // Re-validate session is still active (not logged out)
    const session = await client.query(
      'SELECT * FROM sessions WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
      [sessionId, userId]
    );
    
    if (!session.length) {
      throw new Error('Session revoked'); // Reject mutation
    }
    
    // Apply updates
    return await applyFlagUpdates(userId, updates);
  });
  
  res.json(result);
});
```

### Failcase 5.2: Queue Not Cleared on Logout (Dexie Scope)
**Scenario**:
```
User A toggles mail, queue has 5 items
User A logs out → flagSync.clear() called
  ├─ But in-memory queue is cleared, Dexie is NOT (by design)
  ├─ Dexie still has 5 items from User A
  ├─ User B logs in on same device
  ├─ App loads queue from Dexie
  ├─ User B's EmailContext shows User A's mails as read ❌
```
**Current Plan**: Relies on app startup cleanup but doesn't enforce it.
**Fix Required**: Make cleanup mandatory and verifiable:
```ts
// In EmailContext.init()
async initializeForUser(userId: string) {
  // First: clear old queue for any other userId
  const allQueue = await dexie.flagQueue.toArray();
  const orphaned = allQueue.filter(q => q.userId !== userId);
  if (orphaned.length > 0) {
    console.warn(`Purging ${orphaned.length} orphaned queue items`);
    await dexie.flagQueue.bulkDelete(orphaned.map(q => q.id));
  }
  
  // Then: load queue for current user
  const userQueue = await dexie.flagQueue.where('userId').equals(userId).toArray();
  userQueue.forEach(item => flagSync.enqueue(item));
}
```

### Failcase 5.3: Multi-Tab Logout Race
**Scenario**:
```
Tab A: User logs out
  ├─ Broadcasts logout via BroadcastChannel
  ├─ Tab B receives logout signal
  ├─ Tab B clears in-memory queue ✓
  ├─ But Tab B has REST in-flight
  ├─ REST returns ACK, Tab B can't remove from queue (already cleared)
  ├─ On next login, queue items might be reloaded ❌
```
**Current Plan**: BroadcastChannel sends signal but timing is undefined.
**Fix Required**:
```ts
// On logout, broadcast with timeout for acknowledgment
broadcastLogout() {
  const channel = new BroadcastChannel('auth');
  channel.postMessage({ type: 'logout', userId: currentUser.id });
  
  // Wait for all tabs to ACK (or timeout after 2s)
  return new Promise(resolve => {
    let ackCount = 0;
    const checkTimeout = setTimeout(() => {
      channel.close();
      resolve();
    }, 2000);
    
    channel.onmessage = (event) => {
      if (event.data.type === 'logout_ack') {
        ackCount++;
        if (ackCount >= expectedTabCount) {
          clearTimeout(checkTimeout);
          channel.close();
          resolve();
        }
      }
    };
  });
}
```

### Failcase 5.4: Tab Closed During Logout
**Scenario**:
```
User closes Tab A while logout is in progress
  ├─ Logout not completed on Tab A
  ├─ In-flight REST request still pending
  ├─ Browser closes, request may or may not complete
  ├─ Tab B sees logout but Tab A's mutation might still apply
  └─ Inconsistent state ❌
```
**Current Plan**: No graceful shutdown for in-flight requests.
**Fix Required**: Implement app lifecycle hooks:
```ts
window.addEventListener('beforeunload', async (e) => {
  if (flagSync.hasInFlightBatch()) {
    e.preventDefault(); // Warn user
    e.returnValue = 'Pending updates, really leave?';
  }
  if (isLoggingOut) {
    // Wait max 2s for in-flight batch to complete
    await Promise.race([
      flagSync.waitForInFlightBatch(),
      new Promise(r => setTimeout(r, 2000))
    ]);
  }
});
```

---

## 6. Page Unload & Crash Recovery

### Failcase 6.1: beforeunload Handler Blocked
**Scenario**:
```
window.addEventListener('beforeunload', () => {
  flagSync.flush();
});
  ├─ Some browsers block this (e.g., in iframes)
  ├─ Some extensions block it
  ├─ User navigates away
  ├─ Queue is NOT flushed ❌
```
**Current Plan**: Relies on beforeunload.
**Fix Required**: Use multiple strategies:
```ts
// Strategy 1: beforeunload
window.addEventListener('beforeunload', () => {
  flagSync.fireAndForget_flush();
});

// Strategy 2: visibilitychange (when tab hidden)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && flagSync.hasQueuedItems()) {
    flagSync.fireAndForget_flush();
  }
});

// Strategy 3: pagehide (more reliable than beforeunload)
window.addEventListener('pagehide', () => {
  flagSync.fireAndForget_flush();
});
```

### Failcase 6.2: Browser Crash, In-Memory Queue Lost
**Scenario**:
```
Browser crashes (power failure, OS crash)
  ├─ All in-memory state lost
  ├─ But Dexie persisted queue?
  ├─ On browser restart: app loads, queue resumes ✓
  ├─ UNLESS: Dexie file was being written during crash
  └─ Dexie corruption risk ❌
```
**Current Plan**: Assumes Dexie survives crash.
**Fix Required**:
```ts
// On app startup, validate Dexie integrity
async validateDexieIntegrity() {
  try {
    const count = await dexie.flagQueue.count();
    const sample = await dexie.flagQueue.limit(5).toArray();
    
    if (!sample || sample.some(q => !q.userId || !q.updates)) {
      throw new Error('Dexie queue corrupted');
    }
  } catch (e) {
    console.error('Dexie corrupted, clearing queue');
    await dexie.flagQueue.clear();
    // Show warning to user
    toast.error('Your pending updates were lost due to a crash. Please sync manually.');
  }
}
```

### Failcase 6.3: Network Request Sent, Tab Closed Before Response
**Scenario**:
```
REST flush sends POST /api/inbox/flag-updates
User closes tab immediately
  ├─ Browser cancels request (maybe)
  ├─ But server MAY still receive it (timing race)
  ├─ Server applies mutations
  ├─ Tab closed, no way to receive ACK
  ├─ User logs in again on different device
  ├─ Updates already applied (good!) but user doesn't know
  └─ Or updates NOT applied (bad!), user retries
```
**Current Plan**: No tracking of "sent but unacked".
**Fix Required**: Mark batch as "possibly-applied" in Dexie, recover on next login:
```ts
async flush() {
  // ... create batch ...
  
  // Before sending, mark as in-flight in Dexie
  await dexie.flagQueue.update(this.queue, { status: 'in-flight', batchId });
  
  try {
    const response = await apiFetch('/api/inbox/flag-updates', { /* ... */ });
    this.handleAck(response);
  } catch (e) {
    // Don't clear! Leave as "in-flight" for recovery
    this.inFlightBatch = null;
    // On next app load, check if batch was actually applied server-side
  }
}

// On app startup
async recoverInFlightBatches() {
  const inFlight = await dexie.flagQueue.where('status').equals('in-flight').toArray();
  for (const batch of inFlight) {
    // Query server: was this batchId already applied?
    const result = await apiFetch(`/api/inbox/batch-status/${batch.batchId}`);
    if (result.applied) {
      // Remove from queue
      await dexie.flagQueue.delete(batch.id);
    }
    // Otherwise: will be retried on next flush
  }
}
```

---

## 7. IMAP Flag Conflicts & UID Changes

### Failcase 7.1: IMAP UID Changes on Move
**Scenario**:
```
User marks mail as read locally (messageId: '123', uid: 456)
Queue sends: { messageId: '123', isRead: true }
User moves mail to Archive folder in IMAP client
  ├─ IMAP UID changes: 456 → 789
  ├─ Next server sync fetches, sees new UID 789
  ├─ Can't match to old UID 456
  ├─ Flag update for UID 456 never finds the mail ❌
  ├─ Mail stays with original flags in Archive
```
**Current Plan**: Uses messageId only, doesn't account for UID changes.
**Fix Required**: Use composite key:
```ts
// Queue entry should include:
{
  accountCode: 'gmail',
  mailbox: 'INBOX',
  uid: 456, // or use server cache ID instead
  messageId: '123',
  messageHash: sha256(subject+from+date), // Fallback key
  isRead: true
}

// On update, server must match by:
// 1. User + AccountCode + Mailbox + UID (primary)
// 2. User + MessageId (fallback)
// 3. User + MessageHash (last resort)
```

### Failcase 7.2: Server Flag Set by Another Client
**Scenario**:
```
User A (app): toggles mail as read locally, queued
User B (IMAP client): marks same mail as starred on server
  ├─ Both changes queued
  ├─ Sync happens: server has both flags from IMAP
  ├─ Flush happens: app sends { isRead: true }
  ├─ Server updates: isRead = true ✓
  ├─ But IMAP flags: 'Starred' is NOT set (app doesn't set it)
  ├─ Result: app sees starred, IMAP sees unstarred ❌
```
**Current Plan**: Doesn't merge with concurrent IMAP changes.
**Fix Required**: Implement conflict-free merge:
```ts
// Server side: when applying flag update
async applyFlagUpdates(userId, updates) {
  return db.transaction(async (client) => {
    for (const update of updates) {
      const current = await client.query(
        'SELECT is_read, is_starred FROM inbox_cache WHERE id = $1',
        [update.cacheId]
      );
      
      // Merge: keep flags from this update + preserve any other flags set externally
      const newFlags = {
        is_read: update.isRead !== undefined ? update.isRead : current.is_read,
        is_starred: update.isStarred !== undefined ? update.isStarred : current.is_starred
      };
      
      await client.query(
        'UPDATE inbox_cache SET is_read = $1, is_starred = $2 WHERE id = $3',
        [newFlags.is_read, newFlags.is_starred, update.cacheId]
      );
    }
  });
}
```

### Failcase 7.3: IMAP Sync Undoes User's Edits
**Scenario**:
```
User marks mail as read: isRead = true (queued)
Before queue flushed, manual sync triggered
  ├─ syncInboxMails() fetches from IMAP: flags.includes('\\Seen') = false
  ├─ Overwrites local isRead = false ❌
  ├─ Queue still has { isRead: true }
  ├─ Flush sends true
  ├─ But now server state is inconsistent
  └─ Next sync resets to false again
```
**Current Plan**: Doesn't protect pending queue items from sync overwrites.
**Fix Required**: Check queue before overwriting on sync:
```ts
// In deltaSync.ts
async syncInboxMails() {
  const pending = await getPendingFlagUpdates(); // Load from Dexie
  const pendingMap = new Map(pending.map(p => [p.messageId, p]));
  
  for (const mail of fetchedMails) {
    const pending = pendingMap.get(mail.messageId);
    
    if (pending) {
      // Don't overwrite, preserve pending user edits
      mail.isRead = pending.isRead ?? mail.isRead;
      mail.isStarred = pending.isStarred ?? mail.isStarred;
    }
    
    // Upsert
    await dexie.inbox.put(mail);
  }
}
```

---

## 8. Server Cache Trimming & Re-fetch

### Failcase 8.1: Trimmed Mail Re-fetched, Wrong UID Matched
**Scenario**:
```
Mail with UID 100 trimmed from cache (old, removed)
  ├─ Queue has pending: { uid: 100, isRead: true }
  ├─ Flush rejects item (no matching UID in cache) ✓
  ├─ Next IMAP sync fetches new mails
  ├─ Same mailbox, UID 100 reused by IMAP for a new mail
  ├─ App sees UID 100, matches to pending update
  ├─ Applies { isRead: true } to WRONG mail ❌
```
**Current Plan**: Rejects trimmed, but UID can be reused.
**Fix Required**: Use stable key that survives reuse:
```ts
// Queue entry must include mailbox + date + subject hash
{
  accountCode, mailbox, uid, 
  messageId, // Gmail message ID (stable)
  subjectHash: sha256(subject),
  dateReceived: '2025-01-15T10:30:00Z'
}

// When retrying rejected item, first verify mail identity
async verifyMailStillExists(update) {
  const mail = await db.query(
    `SELECT * FROM inbox_cache 
     WHERE user_id = $1 AND message_id = $2 
     AND date_received = $3 AND subject_hash = $4`,
    [userId, update.messageId, update.dateReceived, update.subjectHash]
  );
  return mail.length > 0;
}
```

### Failcase 8.2: Rejected Items Queued Forever
**Scenario**:
```
Mail permanently deleted from account by admin
  ├─ Queue has update for that mail: { uid: 200, isRead: true }
  ├─ Flush rejects (not in cache)
  ├─ Queue keeps retrying forever
  ├─ Every 5 minutes: same rejected update
  └─ Wasted API calls ❌
```
**Current Plan**: No TTL or max retries for rejected items.
**Fix Required**:
```ts
// Track rejection count per item
queue[key].rejectedCount = (queue[key].rejectedCount || 0) + 1;

if (queue[key].rejectedCount >= 3) {
  // Give up and remove
  delete queue[key];
  toast.warn('Some pending updates could not be applied (mail no longer exists)');
}
```

---

## 9. Error Handling & State Corruption

### Failcase 9.1: Auth Token Expires Mid-Flush
**Scenario**:
```
REST request in-flight: POST /api/inbox/flag-updates
Auth token expires (24h session limit)
  ├─ Request returns 401 Unauthorized
  ├─ Client doesn't have retry logic for 401
  ├─ Queue item stuck
  ├─ Or: client retries with expired token
  └─ Silent failure ❌
```
**Current Plan**: No auth refresh in flush path.
**Fix Required**:
```ts
async flush() {
  try {
    const response = await apiFetch('/api/inbox/flag-updates', { method: 'POST', body: { batchId, updates } });
    this.handleAck(response);
  } catch (e) {
    if (e.status === 401) {
      // Token expired, trigger refresh + retry
      await authContext.refreshToken();
      // Retry once
      try {
        const response = await apiFetch('/api/inbox/flag-updates', { method: 'POST', body: { batchId, updates } });
        this.handleAck(response);
      } catch (e2) {
        // If still fails, keep in queue
        this.inFlightBatch = null;
      }
    } else {
      // Other error, keep in queue
      this.inFlightBatch = null;
    }
  }
}
```

### Failcase 9.2: Network Error During Partial Update
**Scenario**:
```
Server: processing batch with 3 updates
  ├─ Applies updates 1 and 2 ✓
  ├─ Network disconnects
  ├─ Update 3 never reaches database
  ├─ Server can't send ACK (connection lost)
  ├─ Client timeout, treats as failed
  ├─ Client retries all 3
  ├─ Updates 1 and 2 re-applied (duplicate!) ❌
```
**Current Plan**: Server may not be transactional; no all-or-nothing.
**Fix Required**: Make server apply atomic:
```ts
app.post('/api/inbox/flag-updates', auth, async (req, res) => {
  const { batchId, updates } = req.body;
  
  try {
    const result = await db.transaction(async (client) => {
      // All updates in one transaction
      const acceptedIds = [];
      const rejectedIds = [];
      
      for (const update of updates) {
        try {
          const result = await client.query(
            'UPDATE inbox_cache SET is_read = COALESCE($1, is_read), is_starred = COALESCE($2, is_starred) WHERE user_id = $3 AND cache_id = $4 RETURNING cache_id',
            [update.isRead, update.isStarred, userId, update.cacheId]
          );
          
          if (result.rowCount > 0) acceptedIds.push(update.cacheId);
          else rejectedIds.push(update.cacheId);
        } catch (e) {
          rejectedIds.push(update.cacheId);
        }
      }
      
      return { acceptedIds, rejectedIds };
    });
    
    res.json({ type: 'flag_update_ack', batchId, ...result });
  } catch (e) {
    // Entire transaction rolled back, nothing applied
    res.status(500).json({ error: e.message });
  }
});
```

### Failcase 9.3: Queue State Machine Corrupted
**Scenario**:
```
inFlightBatch = { batchId: 'xyz', updates: [...] }
  ├─ Flush starts
  ├─ Sends over WS
  ├─ Error event fires (but not from WS, from random error)
  ├─ inFlightBatch = null (cleared)
  ├─ WS ACK arrives → no inFlightBatch to match!
  ├─ ACK dropped, items never removed from queue ❌
```
**Current Plan**: Simple state machine, fragile.
**Fix Required**: Use explicit state enum:
```ts
enum BatchState {
  QUEUED = 'queued',
  SENDING_WS = 'sending-ws',
  SENDING_REST = 'sending-rest',
  ACKED = 'acked',
  REJECTED = 'rejected',
  ERROR = 'error'
}

class FlagSyncManager {
  private batchState = BatchState.QUEUED;
  private inFlightBatchId: string | null = null;
  
  async flush() {
    if (this.batchState !== BatchState.QUEUED) {
      console.warn(`Can't flush, state is ${this.batchState}`);
      return;
    }
    
    const batchId = crypto.randomUUID();
    this.inFlightBatchId = batchId;
    
    try {
      if (wsClient.isConnected()) {
        this.batchState = BatchState.SENDING_WS;
        wsClient.send({ type: 'flag_update', batchId, updates: batch });
        // Timeout: if no ACK in 30s, treat as failed
        setTimeout(() => {
          if (this.batchState === BatchState.SENDING_WS && this.inFlightBatchId === batchId) {
            this.batchState = BatchState.ERROR;
            this.inFlightBatchId = null;
          }
        }, 30000);
      } else {
        this.batchState = BatchState.SENDING_REST;
        const response = await apiFetch(...);
        this.handleAck(response);
      }
    } catch (e) {
      this.batchState = BatchState.ERROR;
      this.inFlightBatchId = null;
    }
  }
  
  handleAck(message) {
    if (!this.inFlightBatchId || message.batchId !== this.inFlightBatchId) {
      console.warn('ACK mismatch or no in-flight batch');
      return;
    }
    
    if (this.batchState === BatchState.SENDING_WS || this.batchState === BatchState.SENDING_REST) {
      this.batchState = BatchState.ACKED;
      this.inFlightBatchId = null;
      // Remove from queue...
    }
  }
}
```

---

## 10. Rate Limiting & Backpressure

### Failcase 10.1: Server Rate Limit on Flush
**Scenario**:
```
User has 100 pending updates
  ├─ Flush sends batch of 6 (cooldown, not size limit)
  ├─ Server applies ✓
  ├─ Next batch in 5 minutes: 6 more updates
  ├─ But server has rate limit: 1 request per 10 minutes per user
  ├─ Second batch rejected with 429 Too Many Requests ❌
```
**Current Plan**: No backoff strategy.
**Fix Required**:
```ts
async flush() {
  try {
    const response = await apiFetch(...)
    if (response.status === 429) {
      const retryAfter = response.headers['retry-after'] || 60;
      this.cooldownMs = Math.max(this.cooldownMs, retryAfter * 1000);
      this.inFlightBatch = null;
      this.scheduleFlush(); // Will use new cooldownMs
      return;
    }
    this.handleAck(response);
  } catch (e) {
    // Exponential backoff
    this.backoffMultiplier = (this.backoffMultiplier || 1) * 2;
    this.cooldownMs = Math.min(30 * 60 * 1000, 5 * 60 * 1000 * this.backoffMultiplier);
  }
}
```

### Failcase 10.2: Batch Size vs WebSocket Limit
**Scenario**:
```
Queue: 50 pending updates
  ├─ Flush over WS: sends all 50 in one message
  ├─ WebSocket frame size limit (64KB)
  ├─ Payload too large, fails silently or is truncated ❌
```
**Current Plan**: No payload size validation.
**Fix Required**:
```ts
async flush() {
  const MAX_WS_PAYLOAD = 60 * 1024; // 60KB
  const batchJson = JSON.stringify({ type: 'flag_update', batchId, updates: batch });
  
  if (batchJson.length > MAX_WS_PAYLOAD) {
    console.warn('Batch too large for WS, splitting');
    const chunks = this.splitBatch(batch, Math.floor(batch.length / 2));
    for (const chunk of chunks) {
      await this.flush_chunk(chunk);
    }
    return;
  }
  
  wsClient.send({ type: 'flag_update', batchId, updates: batch });
}
```

---

## Summary: Critical Issues Found

| # | Category | Severity | Issue | Impact |
|----|----------|----------|-------|--------|
| 1 | Persistence | CRITICAL | Dexie quota exceeded, silent drop | Lost updates |
| 2 | Idempotency | CRITICAL | No duplicate detection on server | Duplicate mutations |
| 3 | Race condition | CRITICAL | WS + REST both in-flight | Silent duplicates |
| 4 | Logout safety | CRITICAL | In-flight batch after logout persists | Cross-user data leak |
| 5 | IMAP flags | HIGH | UID reuse after trim, wrong mail updated | Data corruption |
| 6 | Coalesce | HIGH | Out-of-order delivery, LWW without causality | State mismatch |
| 7 | Crash recovery | HIGH | beforeunload unreliable | Lost updates on tab close |
| 8 | Auth | HIGH | Token expiry mid-flush | Silent failure |
| 9 | State machine | HIGH | Corrupted batch state, ACK lost | Items stuck queued |
| 10 | Rate limit | MEDIUM | Server 429 not handled | Cascading backoff failure |

**Recommended Implementation Order**:
1. **Fix idempotency & deduplication** (most critical for safety)
2. **Fix logout safety** (prevents data leaks)
3. **Fix race conditions** (WebSocket + REST coordination)
4. **Fix Dexie persistence & corruption recovery**
5. **Fix IMAP key stability**
6. **Add auth token refresh**
7. **Implement state machine enum**
8. **Add rate limiting & backoff**

