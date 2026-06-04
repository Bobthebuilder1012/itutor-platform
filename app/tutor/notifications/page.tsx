'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, Calendar, MessageCircle, CreditCard, Star, CheckCheck, Info, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import {
  getNotifications, markAllNotificationsAsRead, markNotificationAsRead, subscribeToNotifications,
} from '@/lib/services/notificationService';
import type { Notification, NotificationType } from '@/lib/types/notifications';
import TutorShell from '@/components/tutor/TutorShell';
import BrowserPushToggle from '@/components/BrowserPushToggle';

export default function TutorNotificationsPage() {
  return (
    <TutorShell>
      <NotificationsContent />
    </TutorShell>
  );
}

const META: Record<string, { icon: typeof Bell; bg: string; color: string; label: string }> = {
  booking:  { icon: Calendar, bg: 'bg-brand-soft', color: 'text-brand-deep', label: 'Bookings' },
  reminder: { icon: Bell, bg: 'bg-sky/40', color: 'text-ink', label: 'Reminders' },
  payment:  { icon: CreditCard, bg: 'bg-peach/50', color: 'text-ink', label: 'Payments' },
  message:  { icon: MessageCircle, bg: 'bg-lavender/50', color: 'text-ink', label: 'Messages' },
  review:   { icon: Star, bg: 'bg-coral-soft', color: 'text-coral', label: 'Reviews' },
  system:   { icon: Info, bg: 'bg-muted', color: 'text-muted-foreground', label: 'System' },
};

function bucketize(t: NotificationType): keyof typeof META {
  if (t.startsWith('booking_')) return 'booking';
  if (t === 'session_reminder') return 'reminder';
  if (t === 'payment_received') return 'payment';
  if (t === 'new_message') return 'message';
  if (t === 'rating_received') return 'review';
  return 'system';
}

const FILTERS = ['All', 'Unread', 'Bookings', 'Payments', 'Messages', 'Reviews'] as const;

type Prefs = {
  email_bookings: boolean;
  email_reminders: boolean;
  email_payments: boolean;
  email_messages: boolean;
  email_reviews: boolean;
  email_platform: boolean;
};

const DEFAULT_PREFS: Prefs = {
  email_bookings: true,
  email_reminders: true,
  email_payments: true,
  email_messages: true,
  email_reviews: true,
  email_platform: false,
};

function NotificationsContent() {
  const { profile } = useProfile();
  const [filter, setFilter] = useState<typeof FILTERS[number]>('All');
  const [items, setItems] = useState<Notification[]>([]);
  const [tab, setTab] = useState<'inbox' | 'preferences'>('inbox');
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      const list = await getNotifications(profile.id);
      if (mounted) setItems(list);
      setLoading(false);
    })();
    const sub = subscribeToNotifications(profile.id, (n) => {
      setItems((prev) => [n, ...prev]);
    });
    return () => { mounted = false; sub.unsubscribe(); };
  }, [profile?.id]);

  useEffect(() => {
    if (!profile) return;
    const p: Partial<Prefs> = {
      email_bookings: (profile as any).email_bookings ?? true,
      email_reminders: (profile as any).email_reminders ?? true,
      email_payments: (profile as any).email_payments ?? true,
      email_messages: (profile as any).email_messages ?? true,
      email_reviews: (profile as any).email_reviews ?? true,
      email_platform: (profile as any).email_platform ?? false,
    };
    setPrefs({ ...DEFAULT_PREFS, ...p });
  }, [profile]);

  const filtered = items.filter((n) => {
    const b = bucketize(n.type);
    if (filter === 'All') return true;
    if (filter === 'Unread') return !n.is_read;
    if (filter === 'Bookings') return b === 'booking';
    if (filter === 'Payments') return b === 'payment';
    if (filter === 'Messages') return b === 'message';
    if (filter === 'Reviews') return b === 'review';
    return true;
  });

  const unread = items.filter((n) => !n.is_read).length;

  async function markAllRead() {
    if (!profile?.id) return;
    await markAllNotificationsAsRead(profile.id);
    setItems((p) => p.map((n) => ({ ...n, is_read: true })));
  }

  async function toggleRead(n: Notification) {
    if (!n.is_read) {
      await markNotificationAsRead(n.id);
    }
    setItems((p) => p.map((x) => x.id === n.id ? { ...x, is_read: true } : x));
  }

  async function savePrefs(next: Prefs) {
    if (!profile?.id) return;
    setPrefs(next);
    setSavingPrefs(true);
    const { error } = await supabase.from('profiles').update(next as any).eq('id', profile.id);
    setSavingPrefs(false);
    if (error) console.error('Failed to save preferences:', error.message);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">{unread > 0 ? `${unread} unread` : 'All caught up'}</p>
        </div>
        {tab === 'inbox' && unread > 0 && (
          <button onClick={markAllRead}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted">
            <CheckCheck className="size-4" /> Mark all read
          </button>
        )}
      </header>

      <div className="inline-flex rounded-lg border border-border bg-card p-1">
        {(['inbox', 'preferences'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold capitalize',
              tab === t ? 'bg-brand text-white' : 'text-muted-foreground hover:text-ink')}>
            {t === 'preferences' && <SettingsIcon className="size-3.5" />} {t}
          </button>
        ))}
      </div>

      {tab === 'inbox' && (
        <>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border',
                  filter === f ? 'bg-ink text-white border-ink' : 'bg-card text-muted-foreground border-border hover:border-ink/30')}>{f}</button>
            ))}
          </div>

          <ul className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
            {loading ? (
              <li className="p-10 text-center text-sm text-muted-foreground">Loading…</li>
            ) : filtered.length === 0 ? (
              <li className="p-10 text-center text-sm text-muted-foreground">
                {items.length === 0 ? "You're all caught up!" : 'No notifications match this filter.'}
              </li>
            ) : filtered.map((n) => {
              const m = META[bucketize(n.type)];
              const Icon = m.icon;
              const inner = (
                <div className={cn('p-4 flex gap-3 hover:bg-muted/40 cursor-pointer transition', !n.is_read && 'bg-brand-soft/30')}
                  onClick={() => toggleRead(n)}>
                  <div className={cn('size-9 rounded-full grid place-items-center shrink-0', m.bg)}>
                    <Icon className={cn('size-4', m.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink text-sm truncate">{n.title}</span>
                      {!n.is_read && <span className="size-1.5 rounded-full bg-brand shrink-0" />}
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5 truncate">{n.message}</div>
                    <div className="text-xs text-muted-foreground/70 mt-1">{relTime(n.created_at)} · {m.label}</div>
                  </div>
                </div>
              );
              return (
                <li key={n.id}>
                  {n.link ? <Link href={n.link}>{inner}</Link> : inner}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {tab === 'preferences' && (
        <div className="space-y-4">
          {profile?.id && <BrowserPushToggle userId={profile.id} />}

          <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
            <div>
              <div className="text-sm font-semibold text-ink mb-1">Email notification categories</div>
              <div className="text-xs text-muted-foreground">Choose which email notifications you want to receive.</div>
            </div>
            {[
              { key: 'email_bookings', label: 'New bookings & cancellations' },
              { key: 'email_reminders', label: 'Session reminders' },
              { key: 'email_payments', label: 'Payments & payouts' },
              { key: 'email_messages', label: 'Student messages' },
              { key: 'email_reviews', label: 'New reviews' },
              { key: 'email_platform', label: 'Platform updates' },
            ].map((p) => (
              <div key={p.key} className="flex items-center justify-between gap-3 py-1">
                <div className="text-sm font-medium text-ink">{p.label}</div>
                <Toggle checked={prefs[p.key as keyof Prefs]} onChange={(v) => savePrefs({ ...prefs, [p.key]: v })} />
              </div>
            ))}
            {savingPrefs && <div className="text-xs text-muted-foreground">Saving…</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition', checked ? 'bg-brand' : 'bg-muted')}
      role="switch" aria-checked={checked}>
      <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
