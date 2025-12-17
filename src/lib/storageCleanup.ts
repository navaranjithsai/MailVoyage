/**
 * Storage Cleanup Utilities
 * 
 * Provides functions to completely clear all application data including
 * localStorage, sessionStorage, and IndexedDB on logout.
 */

import { clearAllCache, clearAllDrafts } from './mailCache';

// IndexedDB database name
const DB_NAME = 'MailVoyageCache';

/**
 * Clear all localStorage data
 */
export const clearLocalStorage = (): void => {
  try {
    // Get all keys to log what we're clearing
    const keys = Object.keys(localStorage);
    console.log('🧹 Clearing localStorage items:', keys);
    
    // Clear everything
    localStorage.clear();
    
    console.log('✅ localStorage cleared successfully');
  } catch (error) {
    console.error('❌ Error clearing localStorage:', error);
  }
};

/**
 * Clear all sessionStorage data
 */
export const clearSessionStorage = (): void => {
  try {
    const keys = Object.keys(sessionStorage);
    console.log('🧹 Clearing sessionStorage items:', keys);
    
    sessionStorage.clear();
    
    console.log('✅ sessionStorage cleared successfully');
  } catch (error) {
    console.error('❌ Error clearing sessionStorage:', error);
  }
};

/**
 * Delete the entire IndexedDB database
 * This is more thorough than clearing individual stores
 */
export const deleteIndexedDB = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      console.log('🧹 Deleting IndexedDB database:', DB_NAME);
      
      const request = indexedDB.deleteDatabase(DB_NAME);
      
      request.onsuccess = () => {
        console.log('✅ IndexedDB database deleted successfully');
        resolve();
      };
      
      request.onerror = () => {
        console.error('❌ Error deleting IndexedDB:', request.error);
        reject(request.error);
      };
      
      request.onblocked = () => {
        console.warn('⚠️ IndexedDB deletion blocked - database in use');
        // Still resolve, as this might happen if there are open connections
        resolve();
      };
    } catch (error) {
      console.error('❌ Error initiating IndexedDB deletion:', error);
      reject(error);
    }
  });
};

/**
 * Clear all IndexedDB stores without deleting the database
 * Use this as a fallback if deleteDatabase is blocked
 */
export const clearIndexedDBStores = async (): Promise<void> => {
  try {
    console.log('🧹 Clearing all IndexedDB stores...');
    
    // Clear main cache
    await clearAllCache();
    console.log('  ✓ Main cache cleared');
    
    // Clear drafts
    await clearAllDrafts();
    console.log('  ✓ Drafts cleared');
    
    console.log('✅ All IndexedDB stores cleared successfully');
  } catch (error) {
    console.error('❌ Error clearing IndexedDB stores:', error);
    // Don't throw - we want to continue with other cleanup
  }
};

/**
 * Clear all cookies (that are accessible via JavaScript)
 * Note: HttpOnly cookies cannot be cleared via JavaScript
 */
export const clearCookies = (): void => {
  try {
    console.log('🧹 Clearing accessible cookies...');
    
    const cookies = document.cookie.split(';');
    
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i];
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      
      // Clear cookie by setting expiry to past date
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    }
    
    console.log('✅ Accessible cookies cleared');
  } catch (error) {
    console.error('❌ Error clearing cookies:', error);
  }
};

/**
 * Clear all application caches (if using Cache API)
 */
export const clearCacheAPI = async (): Promise<void> => {
  try {
    if ('caches' in window) {
      console.log('🧹 Clearing Cache API...');
      
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      );
      
      console.log('✅ Cache API cleared');
    }
  } catch (error) {
    console.error('❌ Error clearing Cache API:', error);
  }
};

/**
 * Complete logout cleanup - removes ALL application data
 * Call this function when user logs out to ensure complete data removal
 */
export const performCompleteLogout = async (): Promise<void> => {
  console.log('🚀 Starting complete logout cleanup...');
  
  try {
    // 1. Clear localStorage first (most critical - contains auth data)
    clearLocalStorage();
    
    // 2. Clear sessionStorage
    clearSessionStorage();
    
    // 3. Clear IndexedDB - try delete first, fallback to clearing stores
    try {
      await deleteIndexedDB();
    } catch (dbError) {
      console.warn('⚠️ Could not delete IndexedDB, falling back to clearing stores');
      await clearIndexedDBStores();
    }
    
    // 4. Clear accessible cookies
    clearCookies();
    
    // 5. Clear Cache API (service worker caches)
    await clearCacheAPI();
    
    console.log('✅ Complete logout cleanup finished successfully');
    
  } catch (error) {
    console.error('❌ Error during complete logout cleanup:', error);
    // Don't throw - logout should still proceed even if cleanup partially fails
  }
};

/**
 * Get storage usage statistics
 * Useful for debugging and monitoring
 */
export const getStorageStats = async (): Promise<{
  localStorage: { count: number; keys: string[] };
  sessionStorage: { count: number; keys: string[] };
  indexedDB: { exists: boolean };
}> => {
  const localStorageKeys = Object.keys(localStorage);
  const sessionStorageKeys = Object.keys(sessionStorage);
  
  // Check if IndexedDB exists
  let indexedDBExists = false;
  try {
    const databases = await indexedDB.databases();
    indexedDBExists = databases.some(db => db.name === DB_NAME);
  } catch {
    // databases() not supported in all browsers
    indexedDBExists = true; // Assume it exists
  }
  
  return {
    localStorage: { count: localStorageKeys.length, keys: localStorageKeys },
    sessionStorage: { count: sessionStorageKeys.length, keys: sessionStorageKeys },
    indexedDB: { exists: indexedDBExists }
  };
};
