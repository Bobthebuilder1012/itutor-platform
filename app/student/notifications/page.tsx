'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { Bell, Calendar, MessageCircle, FileText, Star, CheckCheck, Settings as SettingsIcon, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

type NotifType = 'lesson' | 'message' | 'assignment' | 'review' | 'system';

type Notification = {
  id: string;
  title: string;
  message: string;
  type?: NotifType;
  read: boolean;
  created_at: string;
};

const META: Record<NotifType, { icon: any; bg: string; color: string; label: string }> = {
  lesson: { icon: Calendar, bg: 'bg-coral-soft', color: 'text-coral', label: 'Lessons' },
  message: { icon: MessageCircle, bg: 'bg-sky', color: 'text-ink', label: 'Messages' },
  assignment: { icon: FileText, bg: 'bg-lavender', color: 'text-ink', label: 'Assignments' },
  review: { icon: Star, bg: 'bg-peach', color: 'text-ink', label: 'Reviews' },
  system: { icon: Bell, bg: 'bg-brand-soft', color: 'text-brand-deep', label: 'System' },
};

const FILTERS = ['All', 'Unread'] as const;

export default function StudentNotificationsPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'All' | 'Unread'>('All');

  useEffect(() => {
    if (!profileLoading && !profile) { router.push('/login'); return; }
    if (profile?.role !== 'student') { router.push('/'); return; }
    if (profile) loadNotifications();
  }, [profile, profileLoading, router]);

  async function loadNotifications() {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile?.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(notificationId: string) {
    try {
      await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
      setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  async function markAllRead() {
    try {
      const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
      if (unreadIds.length === 0) return;
      await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (error) {
      console.error('Error marking all read:', error);
    }
  }

  if (profileLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.read).length;
  const filtered = filter === 'Unread' ? notifications.filter(n => !n.read) : notifications;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="relative size-12 rounded-2xl bg-coral-soft grid place-items-center">
          <Bell className="size-5 text-coral" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 rounded-full bg-coral text-white text-[10px] font-bold grid place-items-center">{unreadCount}</span>
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl lg:text-3xl font-bold text-ink">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
          </p>
        </div>
        <button
          onClick={markAllRead}
          disabled={unreadCount === 0}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-brand-deep hover:bg-brand-soft disabled:opacity-40"
        >
          <CheckCheck className="size-4" /> Mark all read
        </button>
        <Link href="/student/settings" className="size-9 grid place-items-center rounded-xl border border-border hover:bg-muted text-muted-foreground" title="Notification settings">
          <SettingsIcon className="size-4" />
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Filter className="size-4 text-muted-foreground shrink-0" />
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition',
              filter === f
                ? 'bg-ink text-white border-ink'
                : 'bg-background border-border text-muted-foreground hover:border-brand'
            )}
          >
            {f}
            {f === 'Unread' && unreadCount > 0 && (
              <span className={cn('ml-1.5 inline-grid place-items-center min-w-4 h-4 px-1 rounded-full text-[10px] font-bold', filter === f ? 'bg-white text-ink' : 'bg-coral text-white')}>{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="rounded-3xl bg-background border border-border overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="size-14 mx-auto rounded-2xl bg-muted grid place-items-center mb-3">
              <Bell className="size-6 text-muted-foreground" />
            </div>
            <p className="font-semibold text-ink">Nothing here</p>
            <p className="text-sm text-muted-foreground mt-1">
              {filter === 'Unread' ? 'No unread notifications.' : "You're all caught up!"}
            </p>
          </div>
        ) : (
          filtered.map((n) => {
            const notifType: NotifType = (n.type as NotifType) || 'system';
            const meta = META[notifType] || META.system;
            const Icon = meta.icon;
            return (
              <button
                key={n.id}
                onClick={() => !n.read && markAsRead(n.id)}
                className={cn(
                  'w-full text-left flex gap-3 p-4 border-b border-border last:border-b-0 hover:bg-muted/40 transition relative',
                  !n.read && 'bg-brand-soft/30'
                )}
              >
                {!n.read && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 size-2 rounded-full bg-coral" />}
                <div className={cn('size-10 rounded-xl grid place-items-center shrink-0', meta.bg)}>
                  <Icon className={cn('size-4', meta.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className={cn('text-sm', !n.read ? 'font-semibold text-ink' : 'font-medium text-ink/80')}>{n.title}</div>
                    <div className="text-[11px] text-muted-foreground shrink-0">
                      {new Date(n.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
