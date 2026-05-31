'use client';

import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  hasNotificationPermission,
  isPushNotificationSupported,
  isPushSubscribed,
  requestNotificationPermission,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from '@/lib/services/browserPushService';

interface BrowserPushToggleProps {
  userId: string;
}

export default function BrowserPushToggle({ userId }: BrowserPushToggleProps) {
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unknown'>('unknown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isPushNotificationSupported()) {
        if (!cancelled) setSupported(false);
        return;
      }
      if (!cancelled) {
        setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default');
        setSubscribed(await isPushSubscribed());
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleToggle(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (next) {
        const granted = await requestNotificationPermission();
        setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default');
        if (!granted) {
          setError('Permission was not granted. Enable notifications for this site in your browser settings, then try again.');
          return;
        }
        const sub = await subscribeToPushNotifications(userId);
        setSubscribed(!!sub);
        if (!sub) {
          setError('Could not register this device for push. Try refreshing and toggling again.');
        }
        localStorage.removeItem('notifications-prompt-dismissed');
      } else {
        await unsubscribeFromPushNotifications(userId);
        setSubscribed(false);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-muted-foreground" />
          <div className="text-sm font-semibold text-ink">Browser notifications</div>
        </div>
        <p className="text-xs text-muted-foreground">
          This browser does not support web push. Use Chrome, Edge, Firefox, or install iTutor as a PWA on iOS 16.4+.
        </p>
      </div>
    );
  }

  const denied = permission === 'denied';

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <Bell className="size-4 text-brand-deep mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-ink">Browser notifications</div>
            <div className="text-xs text-muted-foreground">
              Get desktop alerts for new bookings, messages, and session reminders even when iTutor is closed.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => handleToggle(!subscribed)}
          disabled={busy || denied}
          aria-checked={subscribed}
          role="switch"
          className={cn(
            'relative inline-flex h-6 w-11 items-center rounded-full transition shrink-0',
            subscribed ? 'bg-brand' : 'bg-muted',
            (busy || denied) && 'opacity-50 cursor-not-allowed'
          )}
        >
          <span
            className={cn(
              'inline-block size-5 rounded-full bg-white shadow transition-transform',
              subscribed ? 'translate-x-[22px]' : 'translate-x-0.5'
            )}
          />
        </button>
      </div>

      {denied && (
        <p className="text-xs text-amber-700">
          Notifications are blocked for this site. Open your browser's site settings and set Notifications to "Allow", then refresh this page.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!denied && !error && subscribed && (
        <p className="text-xs text-emerald-700">This device is registered for push notifications.</p>
      )}
    </div>
  );
}
