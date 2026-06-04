'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, ShieldCheck, CreditCard, RefreshCcw, FileText, AlertCircle, CheckCheck, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import ParentShell from '@/components/parent/ParentShell';

type NotifRow = { id: string; title: string; message: string; type: string; link: string | null; created_at: string; is_read: boolean };

const FILTERS = ['All', 'Unread', 'Enrolment', 'Alerts'] as const;

export default function NotificationsPage() {
  return <ParentShell><NotificationsContent /></ParentShell>;
}

function NotificationsContent() {
  const { profile } = useProfile();
  const [items, setItems] = useState<NotifRow[]>([]);
  const [filter, setFilter] = useState<typeof FILTERS[number]>('All');
  const [loading, setLoading] = useState(true);

  const fetchNotifs = async (userId: string) => {
    const { data } = await supabase.from('notifications')
      .select('id, title, message, type, link, created_at, is_read')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(60);
    setItems(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (profile?.id) fetchNotifs(profile.id); }, [profile?.id]);

  const markAllRead = async () => {
    if (!profile?.id) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', profile.id).eq('is_read', false);
    setItems(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const toggleRead = async (id: string, current: boolean) => {
    await supabase.from('notifications').update({ is_read: !current }).eq('id', id);
    setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: !current } : n));
  };

  const filtered = items.filter(n => {
    if (filter === 'Unread') return !n.is_read;
    if (filter === 'Enrolment') return n.type.includes('approved') || n.type.includes('ENROLLMENT') || n.type.includes('cancel');
    if (filter === 'Alerts') return n.type.includes('suspend') || n.type.includes('banned') || n.type.includes('removed');
    return true;
  });

  const unreadCount = items.filter(n => !n.is_read).length;

  function meta(type: string) {
    if (type.includes('approved') || type === 'ENROLLMENT_CONFIRMED') return { icon: ShieldCheck, bg: 'bg-sky-100', color: 'text-sky-700' };
    if (type.includes('suspend')) return { icon: AlertCircle, bg: 'bg-amber-100', color: 'text-amber-700' };
    if (type.includes('banned') || type.includes('removed') || type.includes('declined')) return { icon: AlertCircle, bg: 'bg-rose-100', color: 'text-rose-700' };
    if (type.includes('cancel')) return { icon: RefreshCcw, bg: 'bg-muted', color: 'text-muted-foreground' };
    if (type.includes('feedback') || type.includes('report')) return { icon: FileText, bg: 'bg-lavender', color: 'text-ink' };
    if (type.includes('payment') || type.includes('charge')) return { icon: CreditCard, bg: 'bg-brand-soft', color: 'text-brand-deep' };
    return { icon: Bell, bg: 'bg-muted', color: 'text-muted-foreground' };
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <div className="relative size-12 rounded-2xl bg-brand-soft grid place-items-center">
          <Bell className="size-5 text-brand-deep" />
          {unreadCount > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 rounded-full bg-coral text-white text-[10px] font-bold grid place-items-center">{unreadCount}</span>}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl lg:text-3xl font-bold text-ink">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}</p>
        </div>
        <button onClick={markAllRead} disabled={unreadCount === 0}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-brand-deep hover:bg-brand-soft disabled:opacity-40">
          <CheckCheck className="size-4" /> Mark all read
        </button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Filter className="size-4 text-muted-foreground shrink-0" />
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition',
              filter === f ? 'bg-ink text-white border-ink' : 'bg-background border-border text-muted-foreground hover:border-brand')}>
            {f}
          </button>
        ))}
      </div>

      <div className="rounded-3xl bg-background border border-border overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="size-14 mx-auto rounded-2xl bg-muted grid place-items-center mb-3"><Bell className="size-6 text-muted-foreground"/></div>
            <p className="font-semibold text-ink">Nothing here</p>
            <p className="text-sm text-muted-foreground mt-1">Try a different filter.</p>
          </div>
        ) : filtered.map((n) => {
          const m = meta(n.type);
          const Icon = m.icon;
          const cls = cn('w-full text-left flex gap-3 p-4 border-b border-border last:border-b-0 hover:bg-muted/40 transition relative', !n.is_read && 'bg-brand-soft/30');
          const inner = (
            <>
              {!n.is_read && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 size-2 rounded-full bg-coral" />}
              <div className={cn('size-10 rounded-xl grid place-items-center shrink-0', m.bg)}><Icon className={cn('size-4', m.color)}/></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className={cn('text-sm', !n.is_read ? 'font-semibold text-ink' : 'font-medium text-ink/80')}>{n.title}</div>
                  <div className="text-[11px] text-muted-foreground shrink-0">{new Date(n.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</div>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
              </div>
            </>
          );
          return n.link ? (
            <Link key={n.id} href={n.link} onClick={() => toggleRead(n.id, n.is_read)} className={cls}>{inner}</Link>
          ) : (
            <button key={n.id} onClick={() => toggleRead(n.id, n.is_read)} className={cls}>{inner}</button>
          );
        })}
      </div>
    </div>
  );
}
