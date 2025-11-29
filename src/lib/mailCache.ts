/**
 * MailVoyage IndexedDB Cache Library
 * 
 * Handles caching of sent mails with:
 * - Efficient storage using IndexedDB
 * - Blob compression for attachments
 * - Smart refresh logic to avoid unnecessary API calls
 * - Background sync capabilities
 */

const DB_NAME = 'MailVoyageCache';
const DB_VERSION = 2; // Incremented for drafts store

// Store names
const STORES = {
  SENT_MAILS: 'sent_mails',
  SENT_MAILS_LIST: 'sent_mails_list',
  CACHE_META: 'cache_meta',
  DRAFTS: 'drafts',
} as const;

// Cache expiry times (in milliseconds)
// Using longer expiry times to reduce API calls - similar to Gmail's approach
const CACHE_EXPIRY = {
  SENT_LIST: 15 * 60 * 1000, // 15 minutes for list (stale-while-revalidate will handle freshness)
  SENT_MAIL: 60 * 60 * 1000, // 1 hour for individual mails (they rarely change)
  BACKGROUND_REFRESH: 5 * 60 * 1000, // 5 minutes before background refresh triggers
} as const;

// Session-level tracking to prevent redundant fetches within the same browser session
// This persists across component mounts/unmounts
const sessionCache = {
  // Track which pages have been fetched this session
  fetchedPages: new Set<number>(),
  // Track which mail threads have been fetched this session
  fetchedThreads: new Set<string>(),
  // Track last fetch timestamps for intelligent refresh
  lastListFetch: 0,
  lastMailFetch: new Map<string, number>(),
  // Track if a background refresh is in progress
  isBackgroundRefreshing: false,
};

// Types
export interface CachedSentMail {
  id: string;
  threadId: string;
  fromEmail: string;
  toEmails: string[];
  subject: string;
  textBody: string | null;
  sentAt: string;
  status: 'pending' | 'sent' | 'failed';
}

export interface CachedSentMailDetail {
  id: string;
  threadId: string;
  fromEmail: string;
  toEmails: string[];
  cc: string[] | null;
  bcc: string[] | null;
  subject: string;
  htmlBody: string | null;
  textBody: string | null;
  attachmentsMetadata: Array<{
    filename: string;
    contentType: string;
    size: number;
    content?: string;
  }> | null;
  messageId: string | null;
  status: 'pending' | 'sent' | 'failed';
  sentAt: string;
  createdAt: string;
}

export interface CacheMeta {
  key: string;
  timestamp: number;
  page?: number;
  total?: number;
  totalPages?: number;
}

export interface PaginatedSentMails {
  mails: CachedSentMail[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================================================
// DRAFT TYPES
// ============================================================================

export interface DraftAttachment {
  id: string;
  name: string;
  size: number;
  sizeFormatted: string;
  type: string;
  content: string; // Base64 encoded
}

export interface EmailDraft {
  id: string; // Unique draft ID using pattern: draft_<timestamp>_<random>
  fromAccountId: string | null;
  fromEmail: string | null;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  attachments: DraftAttachment[];
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  charCount: number;
}

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize the IndexedDB database
 */
const initDB = (): Promise<IDBDatabase> => {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }
  
  if (dbInitPromise) {
    return dbInitPromise;
  }

  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      dbInitPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Store for individual sent mail details (keyed by threadId)
      if (!db.objectStoreNames.contains(STORES.SENT_MAILS)) {
        const sentMailsStore = db.createObjectStore(STORES.SENT_MAILS, { keyPath: 'threadId' });
        sentMailsStore.createIndex('sentAt', 'sentAt', { unique: false });
      }

      // Store for sent mails list (paginated, keyed by page number)
      if (!db.objectStoreNames.contains(STORES.SENT_MAILS_LIST)) {
        db.createObjectStore(STORES.SENT_MAILS_LIST, { keyPath: 'page' });
      }

      // Store for cache metadata (timestamps, etc.)
      if (!db.objectStoreNames.contains(STORES.CACHE_META)) {
        db.createObjectStore(STORES.CACHE_META, { keyPath: 'key' });
      }

      // Store for email drafts (keyed by unique draft ID)
      if (!db.objectStoreNames.contains(STORES.DRAFTS)) {
        const draftsStore = db.createObjectStore(STORES.DRAFTS, { keyPath: 'id' });
        draftsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        draftsStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });

  return dbInitPromise;
};

/**
 * Get cache metadata
 */
const getCacheMeta = async (key: string): Promise<CacheMeta | null> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.CACHE_META], 'readonly');
    const store = transaction.objectStore(STORES.CACHE_META);
    const request = store.get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
};

// setCacheMeta is used internally by other cache functions
// keeping metadata update inline in each function for efficiency

/**
 * Check if cache is valid (not expired)
 */
const isCacheValid = async (key: string, expiryMs: number): Promise<boolean> => {
  const meta = await getCacheMeta(key);
  if (!meta) return false;
  
  const now = Date.now();
  return (now - meta.timestamp) < expiryMs;
};

/**
 * Get the latest cached timestamp for sent mails list
 */
export const getLastSentMailsRefresh = async (): Promise<number | null> => {
  const meta = await getCacheMeta('sent_mails_list_page_1');
  return meta?.timestamp || null;
};

/**
 * Check if sent mails list needs refresh
 */
export const shouldRefreshSentMails = async (): Promise<boolean> => {
  const isValid = await isCacheValid('sent_mails_list_page_1', CACHE_EXPIRY.SENT_LIST);
  return !isValid;
};

/**
 * Get cached sent mails list for a page
 */
export const getCachedSentMailsList = async (page: number = 1): Promise<PaginatedSentMails | null> => {
  const db = await initDB();
  
  // Check if cache is valid
  const cacheKey = `sent_mails_list_page_${page}`;
  const isValid = await isCacheValid(cacheKey, CACHE_EXPIRY.SENT_LIST);
  
  if (!isValid) {
    return null;
  }
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.SENT_MAILS_LIST], 'readonly');
    const store = transaction.objectStore(STORES.SENT_MAILS_LIST);
    const request = store.get(page);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        resolve({
          mails: result.mails,
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        });
      } else {
        resolve(null);
      }
    };
  });
};

/**
 * Cache sent mails list for a page
 */
export const cacheSentMailsList = async (data: PaginatedSentMails): Promise<void> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.SENT_MAILS_LIST, STORES.CACHE_META], 'readwrite');
    const listStore = transaction.objectStore(STORES.SENT_MAILS_LIST);
    const metaStore = transaction.objectStore(STORES.CACHE_META);
    
    // Store the paginated data
    listStore.put({
      page: data.page,
      mails: data.mails,
      total: data.total,
      limit: data.limit,
      totalPages: data.totalPages,
    });

    // Update cache metadata
    const cacheKey = `sent_mails_list_page_${data.page}`;
    metaStore.put({
      key: cacheKey,
      timestamp: Date.now(),
      page: data.page,
      total: data.total,
      totalPages: data.totalPages,
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

/**
 * Get cached sent mail detail by threadId
 */
export const getCachedSentMail = async (threadId: string): Promise<CachedSentMailDetail | null> => {
  const db = await initDB();
  
  // Check if cache is valid
  const cacheKey = `sent_mail_${threadId}`;
  const isValid = await isCacheValid(cacheKey, CACHE_EXPIRY.SENT_MAIL);
  
  if (!isValid) {
    return null;
  }
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.SENT_MAILS], 'readonly');
    const store = transaction.objectStore(STORES.SENT_MAILS);
    const request = store.get(threadId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
};

/**
 * Cache sent mail detail
 */
export const cacheSentMail = async (mail: CachedSentMailDetail): Promise<void> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.SENT_MAILS, STORES.CACHE_META], 'readwrite');
    const mailStore = transaction.objectStore(STORES.SENT_MAILS);
    const metaStore = transaction.objectStore(STORES.CACHE_META);
    
    // Store the mail
    mailStore.put(mail);

    // Update cache metadata
    const cacheKey = `sent_mail_${mail.threadId}`;
    metaStore.put({
      key: cacheKey,
      timestamp: Date.now(),
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

/**
 * Invalidate all sent mails cache (call when new mail is sent)
 */
export const invalidateSentMailsCache = async (): Promise<void> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.SENT_MAILS_LIST, STORES.CACHE_META], 'readwrite');
    const listStore = transaction.objectStore(STORES.SENT_MAILS_LIST);
    const metaStore = transaction.objectStore(STORES.CACHE_META);
    
    // Clear the list cache
    listStore.clear();
    
    // Clear list-related metadata
    const cursorRequest = metaStore.openCursor();
    cursorRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        if (cursor.value.key.startsWith('sent_mails_list_')) {
          cursor.delete();
        }
        cursor.continue();
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

/**
 * Add a newly sent mail to the cache (optimistic update)
 */
export const addNewSentMailToCache = async (mail: CachedSentMailDetail): Promise<void> => {
  // Cache the individual mail
  await cacheSentMail(mail);
  
  // Invalidate the list cache so it fetches fresh data on next visit
  await invalidateSentMailsCache();
};

/**
 * Clear all cache
 */
export const clearAllCache = async (): Promise<void> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [STORES.SENT_MAILS, STORES.SENT_MAILS_LIST, STORES.CACHE_META], 
      'readwrite'
    );
    
    transaction.objectStore(STORES.SENT_MAILS).clear();
    transaction.objectStore(STORES.SENT_MAILS_LIST).clear();
    transaction.objectStore(STORES.CACHE_META).clear();

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

/**
 * Get cache statistics
 */
export const getCacheStats = async (): Promise<{
  sentMailsCount: number;
  listPagesCount: number;
  oldestEntry: number | null;
}> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.SENT_MAILS, STORES.SENT_MAILS_LIST, STORES.CACHE_META], 'readonly');
    
    let sentMailsCount = 0;
    let listPagesCount = 0;
    let oldestEntry: number | null = null;

    const sentMailsRequest = transaction.objectStore(STORES.SENT_MAILS).count();
    sentMailsRequest.onsuccess = () => {
      sentMailsCount = sentMailsRequest.result;
    };

    const listRequest = transaction.objectStore(STORES.SENT_MAILS_LIST).count();
    listRequest.onsuccess = () => {
      listPagesCount = listRequest.result;
    };

    const metaRequest = transaction.objectStore(STORES.CACHE_META).getAll();
    metaRequest.onsuccess = () => {
      const metas = metaRequest.result as CacheMeta[];
      if (metas.length > 0) {
        oldestEntry = Math.min(...metas.map(m => m.timestamp));
      }
    };

    transaction.oncomplete = () => {
      resolve({ sentMailsCount, listPagesCount, oldestEntry });
    };
    transaction.onerror = () => reject(transaction.error);
  });
};

// ============================================================================
// SMART CACHING API - Gmail/ProtonMail-like behavior
// ============================================================================

/**
 * Check if we've already fetched this page in the current browser session.
 * This prevents redundant API calls when navigating back and forth.
 */
export const hasPageBeenFetchedThisSession = (page: number): boolean => {
  return sessionCache.fetchedPages.has(page);
};

/**
 * Mark a page as fetched in the current session
 */
export const markPageFetched = (page: number): void => {
  sessionCache.fetchedPages.add(page);
  sessionCache.lastListFetch = Date.now();
};

/**
 * Check if we've already fetched this thread in the current browser session
 */
export const hasThreadBeenFetchedThisSession = (threadId: string): boolean => {
  return sessionCache.fetchedThreads.has(threadId);
};

/**
 * Mark a thread as fetched in the current session
 */
export const markThreadFetched = (threadId: string): void => {
  sessionCache.fetchedThreads.add(threadId);
  sessionCache.lastMailFetch.set(threadId, Date.now());
};

/**
 * Check if a background refresh should be triggered.
 * Returns true if data is stale but still usable.
 */
export const shouldTriggerBackgroundRefresh = async (): Promise<boolean> => {
  // Don't trigger if already refreshing
  if (sessionCache.isBackgroundRefreshing) return false;
  
  const meta = await getCacheMeta('sent_mails_list_page_1');
  if (!meta) return false;
  
  const now = Date.now();
  const timeSinceLastFetch = now - meta.timestamp;
  
  // Trigger background refresh if data is older than BACKGROUND_REFRESH threshold
  // but still within SENT_LIST expiry (stale-while-revalidate)
  return timeSinceLastFetch > CACHE_EXPIRY.BACKGROUND_REFRESH && 
         timeSinceLastFetch < CACHE_EXPIRY.SENT_LIST;
};

/**
 * Set background refresh status
 */
export const setBackgroundRefreshing = (status: boolean): void => {
  sessionCache.isBackgroundRefreshing = status;
};

/**
 * Get whether background refresh is in progress
 */
export const isBackgroundRefreshing = (): boolean => {
  return sessionCache.isBackgroundRefreshing;
};

/**
 * Smart fetch for sent mails list with stale-while-revalidate pattern.
 * Returns cached data immediately if available, and optionally triggers background refresh.
 * 
 * @param page Page number to fetch
 * @param options.forceRefresh Force a fresh fetch from API
 * @param options.skipSessionCheck Skip the session cache check
 * @returns Object with data and refresh status
 */
export const smartGetSentMailsList = async (
  page: number = 1,
  options: { forceRefresh?: boolean; skipSessionCheck?: boolean } = {}
): Promise<{
  data: PaginatedSentMails | null;
  source: 'cache' | 'api' | 'session';
  needsBackgroundRefresh: boolean;
  isStale: boolean;
}> => {
  const { forceRefresh = false, skipSessionCheck = false } = options;
  
  // If not forcing refresh and already fetched this session, return cached data
  if (!forceRefresh && !skipSessionCheck && hasPageBeenFetchedThisSession(page)) {
    const cachedData = await getCachedSentMailsListWithoutValidation(page);
    if (cachedData) {
      return {
        data: cachedData,
        source: 'session',
        needsBackgroundRefresh: false,
        isStale: false,
      };
    }
  }
  
  // Try to get from IndexedDB cache
  // Initialize DB to ensure it's ready for subsequent operations
  await initDB();
  const cacheKey = `sent_mails_list_page_${page}`;
  const meta = await getCacheMeta(cacheKey);
  
  if (meta && !forceRefresh) {
    const now = Date.now();
    const age = now - meta.timestamp;
    const isExpired = age >= CACHE_EXPIRY.SENT_LIST;
    const isStale = age >= CACHE_EXPIRY.BACKGROUND_REFRESH;
    
    if (!isExpired) {
      const cachedData = await getCachedSentMailsListWithoutValidation(page);
      if (cachedData) {
        // Mark as fetched for this session
        markPageFetched(page);
        
        return {
          data: cachedData,
          source: 'cache',
          needsBackgroundRefresh: isStale && !sessionCache.isBackgroundRefreshing,
          isStale,
        };
      }
    }
  }
  
  // No valid cache, will need API fetch
  return {
    data: null,
    source: 'api',
    needsBackgroundRefresh: false,
    isStale: false,
  };
};

/**
 * Get cached data without checking validity (for internal use)
 */
const getCachedSentMailsListWithoutValidation = async (page: number): Promise<PaginatedSentMails | null> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.SENT_MAILS_LIST], 'readonly');
    const store = transaction.objectStore(STORES.SENT_MAILS_LIST);
    const request = store.get(page);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        resolve({
          mails: result.mails,
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        });
      } else {
        resolve(null);
      }
    };
  });
};

/**
 * Smart fetch for individual sent mail with session caching
 */
export const smartGetSentMail = async (
  threadId: string,
  options: { forceRefresh?: boolean } = {}
): Promise<{
  data: CachedSentMailDetail | null;
  source: 'cache' | 'api' | 'session';
}> => {
  const { forceRefresh = false } = options;
  
  // Check session cache first
  if (!forceRefresh && hasThreadBeenFetchedThisSession(threadId)) {
    const cachedData = await getCachedSentMailWithoutValidation(threadId);
    if (cachedData) {
      return { data: cachedData, source: 'session' };
    }
  }
  
  // Check IndexedDB cache
  const cacheKey = `sent_mail_${threadId}`;
  const isValid = await isCacheValid(cacheKey, CACHE_EXPIRY.SENT_MAIL);
  
  if (isValid && !forceRefresh) {
    const cachedData = await getCachedSentMailWithoutValidation(threadId);
    if (cachedData) {
      markThreadFetched(threadId);
      return { data: cachedData, source: 'cache' };
    }
  }
  
  return { data: null, source: 'api' };
};

/**
 * Get cached mail without checking validity
 */
const getCachedSentMailWithoutValidation = async (threadId: string): Promise<CachedSentMailDetail | null> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.SENT_MAILS], 'readonly');
    const store = transaction.objectStore(STORES.SENT_MAILS);
    const request = store.get(threadId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
};

/**
 * Reset session cache (call on logout or when user explicitly refreshes)
 */
export const resetSessionCache = (): void => {
  sessionCache.fetchedPages.clear();
  sessionCache.fetchedThreads.clear();
  sessionCache.lastListFetch = 0;
  sessionCache.lastMailFetch.clear();
  sessionCache.isBackgroundRefreshing = false;
};

/**
 * Get session cache stats for debugging
 */
export const getSessionCacheStats = (): {
  fetchedPagesCount: number;
  fetchedThreadsCount: number;
  lastListFetch: number;
  isBackgroundRefreshing: boolean;
} => {
  return {
    fetchedPagesCount: sessionCache.fetchedPages.size,
    fetchedThreadsCount: sessionCache.fetchedThreads.size,
    lastListFetch: sessionCache.lastListFetch,
    isBackgroundRefreshing: sessionCache.isBackgroundRefreshing,
  };
};

// ============================================================================
// DRAFT MANAGEMENT API
// ============================================================================

/**
 * Generate a unique draft ID with pattern: draft_<timestamp>_<random>
 * This ensures uniqueness and allows easy identification of drafts
 */
export const generateDraftId = (): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  const extraRandom = Math.random().toString(36).substring(2, 6);
  return `draft_${timestamp}_${randomPart}${extraRandom}`;
};

/**
 * Save or update a draft in IndexedDB
 * If draft has an ID, it updates; otherwise creates new
 */
export const saveDraft = async (draft: Omit<EmailDraft, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string }): Promise<EmailDraft> => {
  const db = await initDB();
  
  const now = new Date().toISOString();
  const fullDraft: EmailDraft = {
    id: draft.id || generateDraftId(),
    fromAccountId: draft.fromAccountId,
    fromEmail: draft.fromEmail,
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    htmlContent: draft.htmlContent,
    textContent: draft.textContent,
    attachments: draft.attachments,
    createdAt: draft.createdAt || now,
    updatedAt: now,
    charCount: draft.charCount,
  };
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.DRAFTS], 'readwrite');
    const store = transaction.objectStore(STORES.DRAFTS);
    const request = store.put(fullDraft);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(fullDraft);
  });
};

/**
 * Get a specific draft by ID
 */
export const getDraft = async (draftId: string): Promise<EmailDraft | null> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.DRAFTS], 'readonly');
    const store = transaction.objectStore(STORES.DRAFTS);
    const request = store.get(draftId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
};

/**
 * Get all drafts sorted by updatedAt (most recent first)
 */
export const getAllDrafts = async (): Promise<EmailDraft[]> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.DRAFTS], 'readonly');
    const store = transaction.objectStore(STORES.DRAFTS);
    const index = store.index('updatedAt');
    const request = index.openCursor(null, 'prev'); // Sort by updatedAt descending
    
    const drafts: EmailDraft[] = [];
    
    request.onerror = () => reject(request.error);
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        drafts.push(cursor.value);
        cursor.continue();
      } else {
        resolve(drafts);
      }
    };
  });
};

/**
 * Delete a draft by ID
 */
export const deleteDraft = async (draftId: string): Promise<void> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.DRAFTS], 'readwrite');
    const store = transaction.objectStore(STORES.DRAFTS);
    const request = store.delete(draftId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

/**
 * Delete multiple drafts by IDs
 */
export const deleteDrafts = async (draftIds: string[]): Promise<void> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.DRAFTS], 'readwrite');
    const store = transaction.objectStore(STORES.DRAFTS);
    
    let completed = 0;
    let hasError = false;
    
    for (const draftId of draftIds) {
      const request = store.delete(draftId);
      request.onerror = () => {
        if (!hasError) {
          hasError = true;
          reject(request.error);
        }
      };
      request.onsuccess = () => {
        completed++;
        if (completed === draftIds.length && !hasError) {
          resolve();
        }
      };
    }
    
    // Handle empty array case
    if (draftIds.length === 0) {
      resolve();
    }
  });
};

/**
 * Get the count of drafts
 */
export const getDraftCount = async (): Promise<number> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.DRAFTS], 'readonly');
    const store = transaction.objectStore(STORES.DRAFTS);
    const request = store.count();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
};

/**
 * Clear all drafts (use with caution)
 */
export const clearAllDrafts = async (): Promise<void> => {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.DRAFTS], 'readwrite');
    const store = transaction.objectStore(STORES.DRAFTS);
    const request = store.clear();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

export default {
  initDB,
  shouldRefreshSentMails,
  getLastSentMailsRefresh,
  getCachedSentMailsList,
  cacheSentMailsList,
  getCachedSentMail,
  cacheSentMail,
  invalidateSentMailsCache,
  addNewSentMailToCache,
  clearAllCache,
  getCacheStats,
  // New smart caching API
  hasPageBeenFetchedThisSession,
  markPageFetched,
  hasThreadBeenFetchedThisSession,
  markThreadFetched,
  shouldTriggerBackgroundRefresh,
  setBackgroundRefreshing,
  isBackgroundRefreshing,
  smartGetSentMailsList,
  smartGetSentMail,
  resetSessionCache,
  getSessionCacheStats,
  // Draft management API
  generateDraftId,
  saveDraft,
  getDraft,
  getAllDrafts,
  deleteDraft,
  deleteDrafts,
  getDraftCount,
  clearAllDrafts,
};
