import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, CheckCircle, AlertTriangle } from 'lucide-react';
import Button from '@/components/ui/Button';
import {
  NOTIFICATION_SETTINGS_EVENT,
  getDesktopNotificationsEnabled,
  getNotificationPermission,
  requestDesktopPermission,
} from '@/lib/notificationSettings';

type BannerState = 'hidden' | 'prompt' | 'requesting' | 'success' | 'denied';

const AUTO_DISMISS_MS = 30_000;

/**
 * Dashboard banner that nudges the user to enable browser notifications.
 *
 * Shows only when notifications are supported, not yet granted, and the user
 * hasn't enabled them in settings. On success it switches to a muted
 * dark-mode-safe color pulse, displays a thank-you message, and auto-closes
 * after 30 seconds. On denial it explains how to retry and keeps the
 * prompt buttons available so the user can try again.
 */
const DesktopNotificationBanner: React.FC = () => {
  const [state, setState] = useState<BannerState>('hidden');

  const decide = useCallback(() => {
    const permission = getNotificationPermission();
    const enabled = getDesktopNotificationsEnabled();

    if (permission === 'unsupported') setState('hidden');
    else if (permission === 'granted' && enabled) setState('hidden');
    else if (permission === 'granted' && !enabled) {
      // Permission exists but the user turned the pref off — respect that.
      setState('hidden');
    }
    else setState('prompt');
  }, []);

  // Initial decision + re-check whenever the permission or setting changes
  // (e.g. from the settings page in another tab, or a granted permission).
  useEffect(() => {
    decide();
    const onChanged = () => decide();
    window.addEventListener(NOTIFICATION_SETTINGS_EVENT, onChanged);

    // Some browsers expose permissionchange on navigator.permissions.
    let status: PermissionStatus | null = null;
    navigator.permissions
      ?.query?.({ name: 'notifications' as PermissionName })
      .then((s) => {
        status = s;
        const handler = () => decide();
        s.addEventListener('change', handler);
      })
      .catch(() => {});

    return () => {
      window.removeEventListener(NOTIFICATION_SETTINGS_EVENT, onChanged);
      if (status) status.onchange = null;
    };
  }, [decide]);

  // Auto-dismiss the success variant after 30 seconds.
  useEffect(() => {
    if (state !== 'success') return;
    const timer = setTimeout(() => setState('hidden'), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [state]);

  const handleGrant = useCallback(async () => {
    setState('requesting');
    const result = await requestDesktopPermission();
    if (result === 'granted') {
      setState('success');
    } else {
      // includes 'denied' and browser-dismissed
      setState('denied');
    }
  }, []);

  const handleCancel = useCallback(() => setState('hidden'), []);

  if (state === 'hidden') return null;

  const isSuccess = state === 'success';
  const isDenied = state === 'denied';

  return (
    <AnimatePresence>
      <motion.div
        key="desktop-notification-banner"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        role="status"
        className={[
          'relative mb-6 overflow-hidden rounded-lg border px-4 py-3 shadow-sm',
          isSuccess
            ? // Muted greens in light, muted slate-green in dark — stays
              // comfortably low-intensity on both themes.
              'border-emerald-300 dark:border-emerald-700/60 bg-emerald-50 dark:bg-emerald-950/40'
            : isDenied
              ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40'
              : 'border-blue-300 dark:border-blue-700/60 bg-blue-50 dark:bg-blue-950/40',
        ].join(' ')}
      >
        {/* Success pulse — gentle sweep inside the banner only, uses gray
            tones in dark mode so it never feels harsh. */}
        {isSuccess && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent dark:via-gray-500/20"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ duration: 1.2, repeat: 1, ease: 'easeOut' }}
          />
        )}

        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0">
            {isSuccess ? (
              <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            ) : isDenied ? (
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            ) : (
              <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            )}
          </span>

          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 dark:text-gray-100">
              {isSuccess
                ? 'Desktop notifications enabled'
                : isDenied
                  ? 'Permission was not granted'
                  : 'Never miss a new email'}
            </p>
            <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">
              {isSuccess
                ? "You'll now get system notifications for new mail — even when MailVoyage is in a background tab. You can turn this off in Settings → Notifications."
                : isDenied
                  ? 'The permission request was denied or dismissed. If it was intentional, nothing will change. Otherwise click "Give permission" to try again, or manage it in your browser site settings.'
                  : 'Allow MailVoyage to show a browser notification when new mail arrives. Only used for new-email alerts.'}
            </p>

            {!isSuccess && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="small"
                  onClick={handleGrant}
                  disabled={state === 'requesting'}
                >
                  {state === 'requesting' ? 'Requesting…' : isDenied ? 'Try again' : 'Give permission'}
                </Button>
                <Button
                  size="small"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={state === 'requesting'}
                >
                  {isDenied ? 'Dismiss' : 'Not now'}
                </Button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleCancel}
            aria-label="Close notification banner"
            className="shrink-0 rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default DesktopNotificationBanner;
