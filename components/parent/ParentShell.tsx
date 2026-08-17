'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useEffect, useState, type ComponentType } from 'react';
import {
  LayoutDashboard, Users, Receipt, Settings, Bell,
  PanelLeftClose, PanelLeftOpen, ChevronUp, LogOut,
  ShieldCheck, MessageSquareQuote, CalendarDays, Search, Compass,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import LogoutConfirmModal from '@/components/LogoutConfirmModal';
import { FEEDBACK_SEEN_EVENT } from '@/lib/parent/feedbackSeen';

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }>; exact?: boolean; tint: string };

const nav: NavItem[] = [
  { to: '/parent/dashboard',     label: 'Home',          icon: LayoutDashboard, exact: true, tint: 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30' },
  // Explore earns a permanent slot. It was kept out on kit-fidelity grounds and
  // reached only from a top-bar button, which made browsing feel like a detour —
  // for a parent with no classes yet it is the first thing they need.
  { to: '/parent/classes',       label: 'Explore',       icon: Compass,                      tint: 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/30' },
  { to: '/parent/children',      label: 'Children',      icon: Users,                        tint: 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30' },
  { to: '/parent/calendar',      label: 'Calendar',      icon: CalendarDays,                 tint: 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/30' },
  { to: '/parent/feedback',      label: 'Feedback',      icon: MessageSquareQuote,           tint: 'bg-fuchsia-500/20 text-fuchsia-300 ring-1 ring-fuchsia-400/30' },
  // Last, and violet rather than amber. It sat second because an unseen request
  // expires two hours before the class with no email (§4.2) — the badge is what
  // actually carries that urgency, not the position, and amber made every other
  // item compete with Children for the same colour.
  { to: '/parent/approvals',     label: 'Approvals',     icon: ShieldCheck,                  tint: 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/30' },
];

// WHAT IS DELIBERATELY NOT IN THIS NAV
//
// Billing is not a destination: the design kit puts subscriptions and
// transactions inside Settings → Billing, and this follows it. The five items
// above are exactly the kit's sidebar — Dashboard, Approvals, Children, Calendar,
// Feedback, plus Explore. The mobile bar now sizes itself from nav.length, so
// the five-column ceiling that shaped this list no longer applies.
//
// Explore DOES have a permanent slot now. It was previously reached only from a
// "Find a class" action on the dashboard, on the kit's reasoning that browsing is
// neutral and occasional. That reasoning holds for a parent whose children are
// already enrolled and not for one whose aren't — and the second is every new
// parent. The dashboard's "Find a class" button stays as well.
//
// /parent/subscriptions and /parent/transactions still exist and still work.
// Nothing is deleted and no bookmark breaks; they are reached from Settings.

const COLLAPSE_KEY = 'itutor.parentSidebar.collapsed';

export default function ParentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [collapsed, setCollapsed] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [newFeedback, setNewFeedback] = useState(0);

  useEffect(() => { try { const v = localStorage.getItem(COLLAPSE_KEY); if (v) setCollapsed(v === '1'); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch {} }, [collapsed]);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'parent')) router.replace('/login');
  }, [loading, profile, router]);

  useEffect(() => {
    if (!profile?.id) return;
    supabase.from('notifications').select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id).eq('is_read', false)
      .then(({ count }) => setUnread(count ?? 0));
  }, [profile?.id]);

  // Kit README: "count badges on Approvals and Feedback". Not decoration — §4.2
  // requests close two hours before the class and send NO email when they lapse,
  // so a badge is the only thing that makes an unanswered one visible without
  // opening the page. Feedback carries one for the same reason: it arrives when
  // a tutor gets to it, with no prompt.
  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      try {
        const [approvals, feedback] = await Promise.all([
          fetch('/api/parent/approvals', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
          fetch('/api/parent/feedback/reports', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
        ]);
        setPendingApprovals(approvals?.pending?.length ?? 0);
        // Unseen, not merely recent. This used to filter the reports here by a
        // seven-day window, which made the badge undismissable — opening the
        // page changed nothing and the count sat there until the report aged
        // out. The endpoint now decides it against `feedback_seen_at`
        // (migration 236), where the unformatted timestamps are.
        setNewFeedback(feedback?.unseenCount ?? 0);
      } catch {
        /* badges are additive; their absence must not break the shell */
      }
    })();
  }, [profile?.id]);

  // The counts above are fetched once per profile, so without this the badge
  // would keep its old number for the rest of the session after the parent read
  // the page — the server would have recorded the visit and the sidebar would
  // still disagree. The feedback page dispatches this once its stamp lands.
  useEffect(() => {
    const clear = () => setNewFeedback(0);
    window.addEventListener(FEEDBACK_SEEN_EVENT, clear);
    return () => window.removeEventListener(FEEDBACK_SEEN_EVENT, clear);
  }, []);

  const handleLogout = async () => {
    localStorage.clear(); sessionStorage.clear();
    await supabase.auth.signOut({ scope: 'local' });
    window.location.href = '/login';
  };

  /** Kit README: count badges on Approvals and Feedback, and nowhere else. */
  const badgeFor = (href: string) =>
    href === '/parent/approvals' ? pendingApprovals : href === '/parent/feedback' ? newFeedback : 0;

  const displayName = profile?.display_name || profile?.full_name || 'Parent';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  if (loading || !profile) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" /></div>;
  }

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Sidebar — fixed so it never scrolls */}
      <aside className={cn('dark hidden lg:flex shrink-0 flex-col border-r border-border bg-ink text-foreground transition-all duration-200 fixed top-0 left-0 h-screen z-50', collapsed ? 'w-16' : 'w-60')}>
        <div className={cn('px-3 py-4 border-b border-white/10 flex items-center gap-2', collapsed && 'justify-center')}>
          {!collapsed
            ? <Link href="/" className="flex-1"><Image src="/assets/logo/itutor-logo-dark.png" alt="iTutor" width={90} height={28} className="h-7 w-auto object-contain" /></Link>
            : <Link href="/" className="flex-1 grid place-items-center"><Image src="/assets/logo/itutor-mark.png" alt="iTutor" width={28} height={28} className="h-7 w-7 object-contain" /></Link>}
          <button onClick={() => setCollapsed(c => !c)} className="size-8 grid place-items-center rounded-lg hover:bg-white/10 text-white/60">
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          <div className={cn('space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
            {nav.map((item) => {
              const active = item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + '/');
              const Icon = item.icon;
              return (
                <Link key={item.to} href={item.to} title={collapsed ? item.label : undefined}
                  className={cn('flex items-center rounded-xl text-sm font-medium transition-colors group', collapsed ? 'justify-center p-2' : 'gap-3 px-2 py-2', active ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white')}>
                  <span className={cn('relative size-8 rounded-lg grid place-items-center transition', item.tint, !active && 'opacity-80 group-hover:opacity-100')}>
                    <Icon className="size-4" />
                    {/* Collapsed: the count has nowhere to sit, so a dot keeps
                        the signal without a number nobody can read. */}
                    {collapsed && badgeFor(item.to) > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-brand ring-2 ring-ink" />
                    )}
                  </span>
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                  {!collapsed && badgeFor(item.to) > 0 && (
                    <span className="min-w-5 rounded-full bg-brand px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                      {badgeFor(item.to)}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="relative p-3 border-t border-white/10">
          <button onClick={() => setProfileOpen(o => !o)}
            className={cn('w-full flex items-center gap-3 rounded-xl hover:bg-white/5 transition px-2 py-2', collapsed && 'justify-center px-0')}>
            <div className="size-9 rounded-full bg-brand grid place-items-center text-white text-sm font-semibold shrink-0">{initials}</div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 text-left">
                  <div className="text-sm font-semibold truncate text-white">{displayName}</div>
                  <div className="text-xs text-white/60">Parent</div>
                </div>
                <ChevronUp className={cn('size-4 text-white/60 transition-transform', !profileOpen && 'rotate-180')} />
              </>
            )}
          </button>
          {profileOpen && (
            <div className={cn('absolute bottom-full mb-2 rounded-xl bg-background border border-border shadow-xl p-1 z-30', collapsed ? 'left-full ml-2 w-48' : 'left-3 right-3')}>
              <Link href="/parent/settings" onClick={() => setProfileOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-sm text-ink">
                <Settings className="size-4 text-muted-foreground" /> Account settings
              </Link>
              <button onClick={() => { setProfileOpen(false); setLogoutOpen(true); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-coral-soft text-sm text-coral font-medium">
                <LogOut className="size-4" /> Log out
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className={cn('flex-1 flex flex-col min-w-0 transition-all duration-200', collapsed ? 'lg:ml-16' : 'lg:ml-60')}>
        <header className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border">
          <div className="flex items-center gap-3 px-4 lg:px-8 h-14">
            <Link href="/" className="lg:hidden"><Image src="/assets/logo/itutor-logo-new.png" alt="iTutor" width={70} height={22} /></Link>
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              {/* Find a class lives in the top bar, on every page.
                  Removing it from the sidebar for kit fidelity left the
                  marketplace reachable ONLY from the dashboard button — and on
                  mobile, where the kit puts it behind a "More" tab this shell
                  does not have, not reachable at all. Browsing is occasional, so
                  it does not deserve a nav slot; it does need to exist. */}
              <Link
                href="/parent/classes"
                className="mr-1 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:bg-muted"
                title="Find a class"
              >
                <Search className="size-3.5" />
                <span className="hidden sm:inline">Find a class</span>
              </Link>
              <Link href="/parent/notifications" className="relative size-9 grid place-items-center rounded-full hover:bg-muted text-muted-foreground" title="Notifications">
                <Bell className="size-4" />
                {unread > 0 && <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-brand text-[10px] font-bold text-white grid place-items-center">{unread}</span>}
              </Link>
              <Link href="/parent/settings" className="size-9 grid place-items-center rounded-full hover:bg-muted text-muted-foreground" title="Settings">
                <Settings className="size-4" />
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 lg:px-8 py-6 lg:py-8 pb-24 lg:pb-8">
          {children}
        </main>

        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur">
          {/* Six columns now that Explore has a permanent slot. Driven off the
              nav length rather than a literal, so the bar cannot silently
              squash the next time an item is added. */}
          <div className="grid" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
            {nav.map((item) => {
              const active = item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + '/');
              const Icon = item.icon;
              return (
                <Link key={item.to} href={item.to} className={cn('flex flex-col items-center gap-1 py-2 text-[10px] font-medium', active ? 'text-brand-deep' : 'text-muted-foreground')}>
                  <span className={cn('relative size-8 rounded-lg grid place-items-center', active ? item.tint : '')}>
                    <Icon className="size-4" />
                    {/* The kit's bottom bar carries an Approvals count. Same
                        reason as the sidebar: a request nobody sees expires. */}
                    {badgeFor(item.to) > 0 && (
                      <span className="absolute -right-1 -top-1 grid min-w-[16px] place-items-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">
                        {badgeFor(item.to)}
                      </span>
                    )}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      <LogoutConfirmModal open={logoutOpen} onClose={() => setLogoutOpen(false)} onConfirm={handleLogout} role="parent" />
    </div>
  );
}
