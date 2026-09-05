import { useCallback, useEffect, useState } from 'react';
import {
  checkForUpdatesIfDue,
  dismissUpdate,
  type UpdateCheckResult,
} from '@/lib/versionCheck';

export interface UpdateCheckState {
  /** A newer version exists and the user hasn't dismissed it. */
  updateAvailable: boolean;
  latestTag: string | null;
  currentVersion: string;
  refresh: () => Promise<void>;
  dismiss: () => Promise<void>;
}

/**
 * Shared hook that runs the throttled update check once per app area and
 * exposes the dismissal action. Used by the dashboard banner and the sidebar
 * dot so both stay consistent.
 *
 * The check is deferred until the browser is idle so it never delays paint.
 */
export function useUpdateCheck(): UpdateCheckState {
  const [result, setResult] = useState<Pick<
    UpdateCheckResult,
    'updateAvailable' | 'latestTag' | 'currentVersion'
  >>({ updateAvailable: false, latestTag: null, currentVersion: '' });

  const run = useCallback(async () => {
    const r = await checkForUpdatesIfDue();
    setResult({
      updateAvailable: r.updateAvailable,
      latestTag: r.latestTag,
      currentVersion: r.currentVersion,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      // Prefer idle time; fall back to a short timeout.
      const win = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      };
      if (typeof win.requestIdleCallback === 'function') {
        win.requestIdleCallback(() => { if (!cancelled) void run(); }, { timeout: 5000 });
      } else {
        setTimeout(() => { if (!cancelled) void run(); }, 3000);
      }
    };

    schedule();
    return () => { cancelled = true; };
  }, [run]);

  const dismiss = useCallback(async () => {
    await dismissUpdate();
    setResult((prev) => ({ ...prev, updateAvailable: false }));
  }, []);

  return {
    updateAvailable: result.updateAvailable,
    latestTag: result.latestTag,
    currentVersion: result.currentVersion,
    refresh: run,
    dismiss,
  };
}

export default useUpdateCheck;
