/**
 * MailVoyage Service Worker
 * 
 * Provides offline support with:
 * - Static asset caching (CSS, JS, images)
 * - API response caching with network-first strategy
 * - Offline queue for failed requests
 * - Background sync support
 */

const CACHE_NAME = 'mailvoyage-v1';
const API_CACHE_NAME = 'mailvoyage-api-v1';
const OFFLINE_QUEUE_KEY = 'mailvoyage-offline-queue';

// Static assets to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// API routes that should be cached
const CACHEABLE_API_ROUTES = [
  '/api/email-accounts',
  '/api/sent-mails',
  '/api/mail/fetch',
];

// API routes that should be queued when offline
const QUEUEABLE_API_ROUTES = [
  '/api/mail/send',
  '/api/auth/logout',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Service worker installed');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== API_CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - handle requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests for caching (but handle offline queue)
  if (request.method !== 'GET') {
    // Check if this is a queueable API request
    if (QUEUEABLE_API_ROUTES.some(route => url.pathname.startsWith(route))) {
      event.respondWith(handleQueueableRequest(request));
      return;
    }
    return;
  }
  
  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleAPIRequest(request));
    return;
  }
  
  // Handle static assets and navigation
  event.respondWith(handleStaticRequest(request));
});

/**
 * Handle API requests with network-first strategy
 */
async function handleAPIRequest(request) {
  const url = new URL(request.url);
  const isCacheable = CACHEABLE_API_ROUTES.some(route => url.pathname.startsWith(route));
  
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // Cache successful GET responses for cacheable routes
    if (networkResponse.ok && isCacheable) {
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache for:', url.pathname);
    
    // Try cache as fallback
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Add header to indicate this is cached data
      const headers = new Headers(cachedResponse.headers);
      headers.set('X-From-Cache', 'true');
      
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers
      });
    }
    
    // Return offline error response
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'You are offline and no cached data is available',
        offline: true 
      }),
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Handle static asset requests with cache-first strategy
 */
async function handleStaticRequest(request) {
  // Try cache first for static assets
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    // Fetch from network
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Failed to fetch:', request.url);
    
    // For navigation requests, return cached index.html
    if (request.mode === 'navigate') {
      const cachedIndex = await caches.match('/index.html');
      if (cachedIndex) {
        return cachedIndex;
      }
    }
    
    // Return offline page or error
    return new Response('Offline', { status: 503 });
  }
}

/**
 * Handle queueable requests (POST/PUT/DELETE that should be retried when online)
 */
async function handleQueueableRequest(request) {
  try {
    // Try to send the request
    const response = await fetch(request.clone());
    return response;
  } catch (error) {
    console.log('[SW] Request failed, adding to offline queue:', request.url);
    
    // Add to offline queue
    await addToOfflineQueue(request);
    
    // Return a response indicating the request was queued
    return new Response(
      JSON.stringify({
        success: false,
        queued: true,
        message: 'Request queued for when you are back online'
      }),
      {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Add a request to the offline queue
 */
async function addToOfflineQueue(request) {
  try {
    // Read request body
    const body = await request.clone().text();
    
    // Get existing queue
    const queue = await getOfflineQueue();
    
    // Add new item
    queue.push({
      id: Date.now().toString(),
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: body,
      timestamp: Date.now()
    });
    
    // Save queue (using IndexedDB through a message to the client)
    await saveOfflineQueue(queue);
    
    // Notify clients about queue update
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'OFFLINE_QUEUE_UPDATED',
        queueLength: queue.length
      });
    });
  } catch (error) {
    console.error('[SW] Failed to add to offline queue:', error);
  }
}

/**
 * Get offline queue from IndexedDB
 */
async function getOfflineQueue() {
  // For simplicity, we'll use a shared storage approach
  // The actual queue is managed by the client and synced here
  return [];
}

/**
 * Save offline queue
 */
async function saveOfflineQueue(queue) {
  // Notify client to save the queue
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'SAVE_OFFLINE_QUEUE',
      queue: queue
    });
  });
}

// Handle messages from clients
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME);
      caches.delete(API_CACHE_NAME);
      break;
      
    case 'PROCESS_OFFLINE_QUEUE':
      processOfflineQueue(payload);
      break;
      
    default:
      break;
  }
});

/**
 * Process offline queue when back online
 */
async function processOfflineQueue(queue) {
  if (!queue || queue.length === 0) return;
  
  console.log('[SW] Processing offline queue:', queue.length, 'items');
  
  const results = [];
  
  for (const item of queue) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
        credentials: 'include'
      });
      
      results.push({
        id: item.id,
        success: response.ok,
        status: response.status
      });
    } catch (error) {
      results.push({
        id: item.id,
        success: false,
        error: error.message
      });
    }
  }
  
  // Notify clients about processing results
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'OFFLINE_QUEUE_PROCESSED',
      results: results
    });
  });
}

// Background sync (if supported)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-queue') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(
      // Request client to process queue
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'TRIGGER_QUEUE_SYNC' });
        });
      })
    );
  }
});

console.log('[SW] Service worker loaded');
