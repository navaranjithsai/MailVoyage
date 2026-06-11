/**
 * Auto-sync helpers shared across contexts and pages.
 */

import { getCacheValue, setCacheValue } from './db';

const AUTO_SYNC_CACHE_KEY = 'lastAutoSyncAt';
const AUTO_SYNC_IN_FLIGHT_KEY = 'autoSyncInFlight';

export async function getLastAutoSyncAt(): Promise<number | null> {
  return getCacheValue<number>(AUTO_SYNC_CACHE_KEY);
}

export async function setLastAutoSyncAt(timestamp: number): Promise<void> {
  await setCacheValue(AUTO_SYNC_CACHE_KEY, timestamp);
}

export function isAutoSyncInFlight(): boolean {
  try {
    return sessionStorage.getItem(AUTO_SYNC_IN_FLIGHT_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAutoSyncInFlight(inFlight: boolean): void {
  try {
    if (inFlight) {
      sessionStorage.setItem(AUTO_SYNC_IN_FLIGHT_KEY, 'true');
      return;
    }
    sessionStorage.removeItem(AUTO_SYNC_IN_FLIGHT_KEY);
  } catch {
    // Ignore storage errors (private mode or disabled storage).
  }
}
