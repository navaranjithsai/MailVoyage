import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Info, RefreshCw, ExternalLink, CheckCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { toast } from '@/lib/toast';
import {
  APP_VERSION,
  FREQUENCY_OPTIONS,
  RELEASES_URL,
  checkForUpdatesNow,
  dismissUpdate,
  getUpdateState,
  saveUpdateState,
  type CheckFrequencyDays,
} from '@/lib/versionCheck';

/**
 * Privacy settings — currently hosts the optional update checker.
 *
 * All state is stored locally in IndexedDB (`cache_metadata`); nothing about
 * this feature is sent to the MailVoyage server.
 */
const PrivacySettings: React.FC = () => {
  const [enabled, setEnabled] = useState(true);
  const [frequency, setFrequency] = useState<CheckFrequencyDays>(1);
  const [latestTag, setLatestTag] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const infoRef = useRef<HTMLDivElement | null>(null);

  // Load persisted settings once.
  useEffect(() => {
    let cancelled = false;
    getUpdateState().then((s) => {
      if (cancelled) return;
      setEnabled(s.enabled);
      setFrequency(s.frequencyDays);
      setLatestTag(s.latestTag);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close the info tooltip on Escape, on outside click, or when focus leaves.
  useEffect(() => {
    if (!infoOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInfoOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (infoRef.current && !infoRef.current.contains(e.target as Node)) {
        setInfoOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [infoOpen]);

  const handleToggle = useCallback(async (next: boolean) => {
    setEnabled(next);
    await saveUpdateState({ enabled: next });
  }, []);

  const handleFrequency = useCallback(async (days: CheckFrequencyDays) => {
    setFrequency(days);
    await saveUpdateState({ frequencyDays: days });
    toast.success('Update check frequency saved');
  }, []);

  const handleCheckNow = useCallback(async () => {
    setChecking(true);
    const result = await checkForUpdatesNow();
    setChecking(false);
    setLatestTag(result.latestTag);

    if (result.error) {
      toast.error(result.error);
    } else if (result.hasNewer) {
      toast.success(`A new version (${result.latestTag}) is available`);
    } else {
      toast.success(`You're on the latest version (v${result.currentVersion})`);
    }
  }, []);

  const handleDismissCurrent = useCallback(async () => {
    await dismissUpdate();
    toast.success('Update notice dismissed');
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Privacy</h2>

      {/* Update checker card */}
      <div className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2 min-w-0">
            <div className="min-w-0">
              <div className="font-medium text-gray-900 dark:text-white flex items-center gap-1.5">
                Check for updates
                {/* Info icon + tooltip (hover / focus / click). Esc, outside
                    click, or focus loss closes it. */}
                <span className="relative inline-flex" ref={infoRef}>
                  <button
                    type="button"
                    aria-label="About update checks"
                    aria-expanded={infoOpen}
                    onMouseEnter={() => setInfoOpen(true)}
                    onMouseLeave={() => setInfoOpen(false)}
                    onFocus={() => setInfoOpen(true)}
                    onBlur={() => setInfoOpen(false)}
                    onClick={() => setInfoOpen((v) => !v)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                  {infoOpen && (
                    <div
                      role="tooltip"
                      className="absolute left-1/2 -translate-x-1/2 top-6 z-50 w-72 max-w-[80vw] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-3 shadow-xl text-xs font-normal text-gray-600 dark:text-gray-300 leading-relaxed"
                    >
                      <span className="block font-semibold text-gray-800 dark:text-gray-100 mb-1">
                        How update checks work
                      </span>
                      <ul className="list-disc pl-4 space-y-1">
                        <li>
                          Once per chosen interval it makes <strong>one read-only
                          request</strong> to GitHub to read the newest release tag and
                          compares it with your installed version.
                        </li>
                        <li>
                          <strong>No pings, analytics, or tracking.</strong> Nothing about
                          you is sent, and nothing is downloaded or installed automatically.
                        </li>
                        <li>
                          Staying current matters — new versions include bug fixes and
                          security upgrades.
                        </li>
                        <li>Completely optional — you can turn it off any time.</li>
                      </ul>
                    </div>
                  )}
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Get a notice when a newer MailVoyage version is released.
              </p>
            </div>
          </div>

          {/* Toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Toggle update checks"
            onClick={() => handleToggle(!enabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {enabled && (
          <>
            {/* Frequency selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Check frequency
              </label>
              <div className="grid grid-cols-3 gap-2">
                {FREQUENCY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleFrequency(opt.value)}
                    className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                      frequency === opt.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Status + actions */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                size="small"
                variant="outline"
                onClick={handleCheckNow}
                disabled={checking}
                className="flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                {checking ? 'Checking…' : 'Check for updates'}
              </Button>

              <a
                href={RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                View releases <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              <span>
                Installed version <strong>v{APP_VERSION}</strong>
                {latestTag && <> · Latest known <strong>{latestTag}</strong></>}
              </span>
            </div>

            {/* If there's an undismissed update, offer a dismiss link too */}
            {latestTag && (
              <button
                type="button"
                onClick={handleDismissCurrent}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline underline-offset-2"
              >
                Dismiss current update notice
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PrivacySettings;
