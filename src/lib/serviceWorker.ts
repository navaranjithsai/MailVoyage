/**
 * Service Worker Registration & Offline Queue Management
 * 
 * Handles:
 * - Service worker registration
 * - Offline queue storage and processing
 * - Online/offline status tracking
 * - Background sync triggers
 */

// Offline queue storage key
const OFFLINE_QUEUE_KEY = 'mailvoyage-offline-queue';

// Types
export interface OfflineQueueItem {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  timestamp: number;
  description?: string;
}

export interface OfflineQueueState {
  queue: OfflineQueueItem[];
  isProcessing: boolean;
  lastProcessed: number | null;
}

// Callbacks for queue updates
type QueueUpdateCallback = (queue: OfflineQueueItem[]) => void;
const queueUpdateCallbacks: Set<QueueUpdateCallback> = new Set();

/**
 * Register the service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service workers are not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    });

    console.log('[SW] Service worker registered:', registration.scope);

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version available
            console.log('[SW] New service worker available');
            // Could show update notification here
          }
        });
      }
    });

    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);

    return registration;
  } catch (error) {
    console.error('[SW] Service worker registration failed:', error);
    return null;
  }
}

/**
 * Handle messages from the service worker
 */
function handleServiceWorkerMessage(event: MessageEvent) {
  const { type, queue, results, queueLength } = event.data || {};

  switch (type) {
    case 'SAVE_OFFLINE_QUEUE':
      if (queue) {
        saveOfflineQueue(queue);
      }
      break;

    case 'OFFLINE_QUEUE_UPDATED':
      console.log('[SW] Queue updated, length:', queueLength);
      notifyQueueUpdate();
      break;

    case 'OFFLINE_QUEUE_PROCESSED':
      console.log('[SW] Queue processed:', results);
      handleQueueProcessed(results);
      break;

    case 'TRIGGER_QUEUE_SYNC':
      processOfflineQueue();
      break;

    default:
      break;
  }
}

/**
 * Get the offline queue from localStorage
 */
export function getOfflineQueue(): OfflineQueueItem[] {
  try {
    const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('[OfflineQueue] Error reading queue:', error);
    return [];
  }
}

/**
 * Save the offline queue to localStorage
 */
export function saveOfflineQueue(queue: OfflineQueueItem[]): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    notifyQueueUpdate();
  } catch (error) {
    console.error('[OfflineQueue] Error saving queue:', error);
  }
}

/**
 * Add an item to the offline queue
 */
export function addToOfflineQueue(item: Omit<OfflineQueueItem, 'id' | 'timestamp'>): void {
  const queue = getOfflineQueue();
  
  const newItem: OfflineQueueItem = {
    ...item,
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now()
  };
  
  queue.push(newItem);
  saveOfflineQueue(queue);
  
  console.log('[OfflineQueue] Added item:', newItem.id);
}

/**
 * Remove an item from the offline queue
 */
export function removeFromOfflineQueue(id: string): void {
  const queue = getOfflineQueue();
  const filteredQueue = queue.filter(item => item.id !== id);
  saveOfflineQueue(filteredQueue);
  
  console.log('[OfflineQueue] Removed item:', id);
}

/**
 * Clear the entire offline queue
 */
export function clearOfflineQueue(): void {
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
  notifyQueueUpdate();
  console.log('[OfflineQueue] Queue cleared');
}

/**
 * Get the number of items in the queue
 */
export function getOfflineQueueCount(): number {
  return getOfflineQueue().length;
}

/**
 * Process the offline queue (send queued requests)
 */
export async function processOfflineQueue(): Promise<void> {
  if (!navigator.onLine) {
    console.log('[OfflineQueue] Cannot process - still offline');
    return;
  }

  const queue = getOfflineQueue();
  if (queue.length === 0) {
    console.log('[OfflineQueue] Queue is empty');
    return;
  }

  console.log('[OfflineQueue] Processing queue:', queue.length, 'items');

  const processedIds: string[] = [];
  const failedIds: string[] = [];

  for (const item of queue) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body || undefined,
        credentials: 'include'
      });

      if (response.ok) {
        processedIds.push(item.id);
        console.log('[OfflineQueue] Successfully processed:', item.id);
      } else {
        failedIds.push(item.id);
        console.warn('[OfflineQueue] Failed to process:', item.id, response.status);
      }
    } catch (error) {
      failedIds.push(item.id);
      console.error('[OfflineQueue] Error processing:', item.id, error);
    }
  }

  // Remove successfully processed items
  if (processedIds.length > 0) {
    const remainingQueue = queue.filter(item => !processedIds.includes(item.id));
    saveOfflineQueue(remainingQueue);
  }

  console.log('[OfflineQueue] Processed:', processedIds.length, 'Failed:', failedIds.length);
}

/**
 * Handle queue processing results from service worker
 */
function handleQueueProcessed(results: Array<{ id: string; success: boolean }>) {
  const successIds = results.filter(r => r.success).map(r => r.id);
  
  if (successIds.length > 0) {
    const queue = getOfflineQueue();
    const remainingQueue = queue.filter(item => !successIds.includes(item.id));
    saveOfflineQueue(remainingQueue);
  }
}

/**
 * Subscribe to queue updates
 */
export function subscribeToQueueUpdates(callback: QueueUpdateCallback): () => void {
  queueUpdateCallbacks.add(callback);
  
  // Return unsubscribe function
  return () => {
    queueUpdateCallbacks.delete(callback);
  };
}

/**
 * Notify all subscribers about queue updates
 */
function notifyQueueUpdate() {
  const queue = getOfflineQueue();
  queueUpdateCallbacks.forEach(callback => {
    try {
      callback(queue);
    } catch (error) {
      console.error('[OfflineQueue] Error in callback:', error);
    }
  });
}

/**
 * Setup online/offline listeners
 */
export function setupOnlineListeners(
  onOnline?: () => void,
  onOffline?: () => void
): () => void {
  const handleOnline = () => {
    console.log('[Network] Back online');
    onOnline?.();
    
    // Process offline queue when back online
    setTimeout(() => {
      processOfflineQueue();
    }, 1000); // Small delay to ensure network is stable
  };

  const handleOffline = () => {
    console.log('[Network] Gone offline');
    onOffline?.();
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * Check if online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Request background sync (if supported)
 */
export async function requestBackgroundSync(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('sync' in window.ServiceWorkerRegistration.prototype)) {
    console.log('[BackgroundSync] Not supported');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await (registration as any).sync.register('sync-offline-queue');
    console.log('[BackgroundSync] Registered');
    return true;
  } catch (error) {
    console.error('[BackgroundSync] Registration failed:', error);
    return false;
  }
}

/**
 * Skip waiting for new service worker
 */
export function skipWaiting(): void {
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
  }
}

/**
 * Clear all service worker caches
 */
export function clearServiceWorkerCaches(): void {
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
  }
}
