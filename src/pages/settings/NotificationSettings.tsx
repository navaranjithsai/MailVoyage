import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Monitor, Mail, Info } from 'lucide-react';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useEmail } from '@/contexts/EmailContext';
import { toast } from '@/lib/toast';
import {
  NOTIFICATION_SETTINGS_EVENT,
  getDesktopNotificationsEnabled,
  getEmailNotificationsEnabled,
  getNotificationPermission,
  requestDesktopPermission,
  setDesktopNotificationsEnabled,
  setEmailNotificationsEnabled,
  type NotificationPermissionState,
} from '@/lib/notificationSettings';

/** Accessible toggle used by both settings rows. */
const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}> = ({ checked, onChange, disabled, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
      disabled ? 'opacity-50 cursor-not-allowed' : ''
    } ${checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

/**
 * Notification settings — now fully wired instead of the previous static demo
 * list. `Email notifications` gates the in-app toast shown when new mail
 * arrives. `Desktop notifications` additionally requests the browser
 * Notification permission and shows system-level banners.
 */
const NotificationSettings: React.FC = () => {
  const { showUnreadBadge, setShowUnreadBadge } = useEmail();

  const [emailOn, setEmailOn] = useState(true);
  const [desktopOn, setDesktopOn] = useState(false);
  const [permission, setPermission] = useState<NotificationPermissionState>('default');
  const [emailOffDialogOpen, setEmailOffDialogOpen] = useState(false);
  const [requestingPermission, setRequestingPermission] = useState(false);

  // Bootstrap from storage + live browser permission.
  useEffect(() => {
    setEmailOn(getEmailNotificationsEnabled());
    setDesktopOn(getDesktopNotificationsEnabled());
    setPermission(getNotificationPermission());
  }, []);

  // Keep in sync when another tab/component flips the same setting.
  useEffect(() => {
    const onChanged = () => {
      setEmailOn(getEmailNotificationsEnabled());
      setDesktopOn(getDesktopNotificationsEnabled());
      setPermission(getNotificationPermission());
    };
    window.addEventListener(NOTIFICATION_SETTINGS_EVENT, onChanged);
    return () => window.removeEventListener(NOTIFICATION_SETTINGS_EVENT, onChanged);
  }, []);

  // Turning email notifications OFF requires confirmation — the user might
  // otherwise miss new mail. ConfirmDialog handles cancel/confirm.
  const handleEmailToggle = useCallback((next: boolean) => {
    if (!next) {
      setEmailOffDialogOpen(true);
      return;
    }
    setEmailOn(true);
    setEmailNotificationsEnabled(true);
  }, []);

  const confirmEmailOff = useCallback(() => {
    setEmailOn(false);
    setEmailNotificationsEnabled(false);
    setEmailOffDialogOpen(false);
    toast.success('Email notifications disabled');
  }, []);

  // Desktop notifications need the browser permission. Toggling ON asks for
  // it; granted → turn the pref on, denied/dismissed → keep it off and inform.
  const handleDesktopToggle = useCallback(async (next: boolean) => {
    if (!next) {
      setDesktopOn(false);
      setDesktopNotificationsEnabled(false);
      return;
    }

    const current = getNotificationPermission();
    if (current === 'granted') {
      setDesktopOn(true);
      setDesktopNotificationsEnabled(true);
      return;
    }
    if (current === 'unsupported') {
      toast.error('This browser does not support desktop notifications');
      return;
    }
    if (current === 'denied') {
      toast.error('Notifications are blocked in your browser site settings');
      return;
    }

    setRequestingPermission(true);
    const result = await requestDesktopPermission();
    setRequestingPermission(false);
    setPermission(result);

    if (result === 'granted') {
      setDesktopOn(true);
      toast.success('Desktop notifications enabled');
    } else {
      toast.error('Permission not granted, so desktop notifications stay off');
    }
  }, []);

  const desktopBlocked = permission === 'denied';
  const desktopUnsupported = permission === 'unsupported';

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Notification Preferences</h2>

      <div className="space-y-4">
        {/* Email notifications — gates the in-app toast for new mail */}
        <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 dark:border-gray-600 p-4">
          <div className="flex items-start gap-3 min-w-0">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-white">Email Notifications</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Show an in-app toast whenever new mail arrives
              </p>
            </div>
          </div>
          <ToggleSwitch
            checked={emailOn}
            onChange={handleEmailToggle}
            label="Toggle email notifications"
          />
        </div>

        {/* Desktop notifications — gated on the browser permission */}
        <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 dark:border-gray-600 p-4">
          <div className="flex items-start gap-3 min-w-0">
            <Monitor className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-white flex items-center gap-1">
                Desktop Notifications
                <InfoTooltip
                  text={
                    'When enabled your browser shows a system notification for every new email (new mail only). These appear even when MailVoyage is in a background tab.'
                  }
                />
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {desktopUnsupported
                  ? 'Not supported by this browser'
                  : desktopBlocked
                    ? 'Blocked by browser site settings — enable it there first'
                    : 'Show system notifications for new emails'}
              </p>
            </div>
          </div>
          <ToggleSwitch
            checked={desktopOn}
            onChange={handleDesktopToggle}
            disabled={desktopBlocked || desktopUnsupported || requestingPermission}
            label="Toggle desktop notifications"
          />
        </div>

        {/* Unread badge — already backed by EmailContext */}
        <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 dark:border-gray-600 p-4">
          <div className="flex items-start gap-3 min-w-0">
            <Bell className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-white">Unread Badge</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Show the red dot and count for unread emails
              </p>
            </div>
          </div>
          <ToggleSwitch
            checked={showUnreadBadge}
            onChange={(next) => setShowUnreadBadge(next)}
            label="Toggle unread-count badge"
          />
        </div>
      </div>

      <ConfirmDialog
        isOpen={emailOffDialogOpen}
        title="Turn off email notifications?"
        message={
          "You won't see a toast when new mail arrives. You'll still receive the mail in your inbox — only the pop-up alert is disabled. You can turn this back on at any time."
        }
        confirmLabel="Turn off"
        cancelLabel="Keep notifications on"
        variant="warning"
        onConfirm={confirmEmailOff}
        onCancel={() => setEmailOffDialogOpen(false)}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Small tooltip that mirrors the behaviour used on the Privacy page: opens on
// hover/focus/click, closes on Escape/outside click/blur.
// ---------------------------------------------------------------------------
const InfoTooltip: React.FC<{ text: string }> = ({ text }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <span className="relative inline-flex" ref={ref}>
      <button
        type="button"
        aria-label="About desktop notifications"
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute left-0 top-6 z-50 w-64 max-w-[80vw] rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-3 text-xs leading-relaxed text-gray-600 dark:text-gray-300 shadow-xl"
        >
          {text}
        </div>
      )}
    </span>
  );
};

export default NotificationSettings;
