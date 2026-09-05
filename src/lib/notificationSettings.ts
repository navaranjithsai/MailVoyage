/**
 * Notification preferences shared between Settings, Inbox, EmailContext, and
 * the dashboard banner.
 *
 * Both options are local-first: stored in localStorage, never sent to the
 * server. A custom event notifies every open component instantly when a
 * setting changes so the UI stays in sync across pages and tabs.
 */

export const NOTIFICATION_SETTINGS_EVENT = 'notifications:changed';
const EMAIL_KEY = 'mailvoyage.emailNotifications';
const DESKTOP_KEY = 'mailvoyage.desktopNotifications';

export function getEmailNotificationsEnabled(): boolean {
  const v = localStorage.getItem(EMAIL_KEY);
  return v === null ? true : v === 'true'; // default ON
}

export function getDesktopNotificationsEnabled(): boolean {
  const v = localStorage.getItem(DESKTOP_KEY);
  return v === null ? false : v === 'true'; // default OFF
}

function notifyChanged(): void {
  window.dispatchEvent(
    new CustomEvent(NOTIFICATION_SETTINGS_EVENT, {
      detail: {
        email: getEmailNotificationsEnabled(),
        desktop: getDesktopNotificationsEnabled(),
      },
    })
  );
}

export function setEmailNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(EMAIL_KEY, String(enabled));
  notifyChanged();
}

export function setDesktopNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(DESKTOP_KEY, String(enabled));
  notifyChanged();
}

// ---------------------------------------------------------------------------
// Browser Notification permission helpers
// ---------------------------------------------------------------------------

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotificationPermissionState;
}

/**
 * Ask the browser for permission. If permission is granted, automatically
 * enable the desktop-notification preference; if it's denied/dismissed, keep
 * the preference off so the UI accurately reflects reality.
 */
export async function requestDesktopPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') {
    setDesktopNotificationsEnabled(true);
    return 'granted';
  }
  if (Notification.permission === 'denied') {
    return 'denied'; // Browser has permanently denied — request() is a no-op
  }

  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      setDesktopNotificationsEnabled(true);
    } else {
      setDesktopNotificationsEnabled(false);
    }
    return result as NotificationPermissionState;
  } catch {
    return 'denied';
  }
}

/**
 * Show a desktop notification for an incoming email. No-op unless the user
 * has enabled desktop notifications AND the browser permission is granted.
 */
export function sendDesktopMailNotification(detail?: {
  count?: number;
  subject?: string;
  accountCode?: string;
}): void {
  if (!getDesktopNotificationsEnabled()) return;
  if (getNotificationPermission() !== 'granted') return;

  const count = detail?.count ?? 1;
  const title = count > 1 ? `${count} new emails` : 'New email';
  const body =
    count === 1 && detail?.subject
      ? detail.subject
      : `You have ${count} new email${count === 1 ? '' : 's'}${detail?.accountCode ? ` in ${detail.accountCode}` : ''}.`;

  try {
    new Notification(title, {
      body,
      tag: 'mailvoyage-new-mail', // replaces a previous, still-open notice
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      silent: true,
    });
  } catch {
    // Some mobile browsers throw on direct construction; safe to ignore.
  }
}
