/**
 * Optional, privacy-respecting update checker.
 *
 * What it does:
 *  - Once per user-chosen interval (day / week / month) it performs ONE
 *    read-only GET to the public GitHub Releases API to learn the newest
 *    release tag, and compares it numerically against the version baked into
 *    this build.
 *  - It sends NO data (no headers identifying the user, no body, no
 *    analytics). It never downloads or installs anything.
 *  - The result and settings live only in the browser (IndexedDB); nothing
 *    is sent to the MailVoyage server.
 *
 * It can be disabled entirely from Settings → Privacy.
 */

import { getCacheValue, setCacheValue } from '@/lib/db';

declare const __APP_VERSION__: string;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const GITHUB_OWNER = 'navaranjithsai';
export const GITHUB_REPO = 'MailVoyage';
export const REPO_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
const API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

const DB_KEY = 'updateCheck';

/** Version baked in at build time via vite `define`. Falls back for tests. */
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

export type CheckFrequencyDays = 1 | 7 | 30;
export const FREQUENCY_OPTIONS: { value: CheckFrequencyDays; label: string }[] = [
  { value: 1, label: 'Every day' },
  { value: 7, label: 'Every week' },
  { value: 30, label: 'Every month' },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpdateCheckState {
  /** Master on/off switch. */
  enabled: boolean;
  /** Days between automatic checks. */
  frequencyDays: CheckFrequencyDays;
  /** Epoch ms of the most recent fetch attempt (throttles auto-checks). */
  lastCheckedAt: number | null;
  /** Newest tag seen on GitHub, e.g. "v2026.9.0". */
  latestTag: string | null;
  /** Tag the user explicitly dismissed; re-shows when a NEWER tag appears. */
  dismissedTag: string | null;
}

export interface UpdateCheckResult {
  /** True when a newer version exists AND it hasn't been dismissed. */
  updateAvailable: boolean;
  /** True when a newer version exists regardless of dismissal. */
  hasNewer: boolean;
  currentVersion: string;
  latestTag: string | null;
  /** True when the fresh fetch hit the network (vs. served from cache). */
  fetched: boolean;
  error?: string;
}

const DEFAULT_STATE: UpdateCheckState = {
  enabled: true,
  frequencyDays: 1,
  lastCheckedAt: null,
  latestTag: null,
  dismissedTag: null,
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function getUpdateState(): Promise<UpdateCheckState> {
  try {
    const stored = await getCacheValue<Partial<UpdateCheckState>>(DB_KEY);
    return { ...DEFAULT_STATE, ...(stored ?? {}) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function saveUpdateState(patch: Partial<UpdateCheckState>): Promise<UpdateCheckState> {
  const current = await getUpdateState();
  const next: UpdateCheckState = { ...current, ...patch };
  try {
    await setCacheValue(DB_KEY, next);
  } catch {
    // Non-fatal: storage may be full/blocked; keep in-memory result.
  }
  return next;
}

// ---------------------------------------------------------------------------
// Version comparison — our scheme is YYYY.M.D; plain string compare breaks
// on double-digit months, so parse to numbers and compare per-part.
// ---------------------------------------------------------------------------

function parseVersion(v: string): [number, number, number] | null {
  const m = v.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Returns true when `candidate` is strictly newer than `base`. */
export function isNewerVersion(candidate: string, base: string = APP_VERSION): boolean {
  const c = parseVersion(candidate);
  const b = parseVersion(base);
  if (!c || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (c[i] !== b[i]) return c[i] > b[i];
  }
  return false;
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

async function fetchLatestTag(): Promise<string | null> {
  try {
    // cache:'no-store' prevents a stale SW/browser layer from masking a new
    // release. The request carries no auth, cookies, or body.
    const res = await fetch(API_URL, {
      method: 'GET',
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const tag = (data as { tag_name?: unknown })?.tag_name;
    return typeof tag === 'string' && /^\s*v?\d+\.\d+\.\d+/.test(tag) ? tag.trim() : null;
  } catch {
    return null; // offline / rate-limited / CSP — treat as "no info", never error the UI
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Automatic check: honours the enabled toggle and the chosen frequency.
 * Safe to call on every app mount — it self-throttles.
 */
export async function checkForUpdatesIfDue(): Promise<UpdateCheckResult> {
  const state = await getUpdateState();
  const base = { currentVersion: APP_VERSION, latestTag: state.latestTag };

  if (!state.enabled) {
    return { ...base, updateAvailable: false, hasNewer: false, fetched: false };
  }

  const intervalMs = state.frequencyDays * 24 * 60 * 60 * 1000;
  const due = state.lastCheckedAt === null || Date.now() - state.lastCheckedAt >= intervalMs;
  if (!due || !navigator.onLine) {
    return evaluate(state, false);
  }

  const tag = await fetchLatestTag();
  const next = await saveUpdateState({
    lastCheckedAt: Date.now(),
    // Keep the highest tag we've ever seen rather than overwriting with null on failure.
    ...(tag ? { latestTag: tag } : {}),
  });
  return evaluate(next, !!tag);
}

/** Manual "Check for updates" — bypasses the frequency throttle. */
export async function checkForUpdatesNow(): Promise<UpdateCheckResult> {
  const tag = await fetchLatestTag();
  const next = await saveUpdateState({
    lastCheckedAt: Date.now(),
    ...(tag ? { latestTag: tag, dismissedTag: null } : {}),
  });
  return evaluate(next, !!tag, tag ? undefined : 'Could not reach GitHub. Check your connection.');
}

/** Dismiss the current update notice; it re-appears only for a NEWER tag. */
export async function dismissUpdate(): Promise<void> {
  const state = await getUpdateState();
  if (state.latestTag) await saveUpdateState({ dismissedTag: state.latestTag });
}

function evaluate(state: UpdateCheckState, fetched: boolean, error?: string): UpdateCheckResult {
  const hasNewer = state.latestTag !== null && isNewerVersion(state.latestTag);
  const dismissed = state.dismissedTag !== null && state.dismissedTag === state.latestTag;
  return {
    updateAvailable: hasNewer && !dismissed,
    hasNewer,
    currentVersion: APP_VERSION,
    latestTag: state.latestTag,
    fetched,
    error,
  };
}
