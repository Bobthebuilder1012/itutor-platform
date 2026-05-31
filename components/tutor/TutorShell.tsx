'use client';

import { useEffect, useState, ReactNode, ComponentType } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, BookOpen, CalendarDays, Users, Wallet,
  Sparkles, Settings, Bell, Search, LogOut, ChevronUp, PanelLeftClose, PanelLeftOpen, Lock,
  Calendar as CalendarIcon, Star, Rocket, Menu, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import { useSuspensionCheck } from '@/lib/hooks/useSuspensionCheck';
import { supabase } from '@/lib/supabase/client';
import { getUnreadNotificationCount, subscribeToNotifications } from '@/lib/services/notificationService';
import LogoutConfirmModal from '@/components/LogoutConfirmModal';

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }>; exact?: boolean; gated?: boolean };

const nav: NavItem[] = [
  { to: '/tutor/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/tutor/classes', label: 'My Classes', icon: BookOpen },
  { to: '/tutor/sessions', label: 'Sessions', icon: CalendarDays },
  { to: '/tutor/students', label: 'My Students', icon: Users },
  { to: '/tutor/wallet', label: 'My Wallet', icon: Wallet },
  { to: '/tutor/reviews', label: 'Reviews', icon: Star },
  { to: '/tutor/growth', label: 'My Business', icon: Rocket, gated: true },
  { to: '/tutor/tools', label: 'iTutor AI', icon: Sparkles },
];

const COLLAPSE_KEY = 'itutor.tutorSidebar.collapsed';

export default function TutorShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || '';
  const { profile, loading } = useProfile();
  useSuspensionCheck();
  const completion = useTutorCompletion(profile);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [logoutOpen, setLogoutOpen] = useState(false);

  useEffect(() => {
    try { const v = localStorage.getItem(COLLAPSE_KEY); if (v) setCollapsed(v === '1'); } catch {}
  }, []);

  useEffect(() => {
    if (!loading && profile && profile.role !== 'tutor') router.replace('/login');
  }, [loading, profile, router]);

  useEffect(() => {
    if (!profile?.id) return;
    let mounted = true;
    getUnreadNotificationCount(profile.id).then((c) => { if (mounted) setUnreadNotifs(c); });
    const sub = subscribeToNotifications(profile.id, () => {
      if (!profile?.id) return;
      getUnreadNotificationCount(profile.id).then((c) => { if (mounted) setUnreadNotifs(c); });
    });
    return () => { mounted = false; sub.unsubscribe(); };
  }, [profile?.id]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/tutor/students${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
  };

  const initials = (profile?.full_name || profile?.email || 'T').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  const profileMenuProps = {
    collapsed,
    initials,
    name: profile?.full_name || profile?.email || 'Tutor',
    avatarUrl: profile?.avatar_url || null,
    onLogout: () => setLogoutOpen(true),
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Desktop sidebar — fixed height, never scrolls ── */}
      <aside className={cn(
        'hidden lg:flex h-full shrink-0 flex-col border-r border-white/10 bg-ink text-white transition-all duration-200 overflow-hidden',
        collapsed ? 'w-0' : 'w-60',
      )}>
        <SidebarHeader collapsed={false} onToggle={toggleCollapsed} />
        <SidebarNav collapsed={false} pathname={pathname} completion={completion} onNavClick={() => {}} />
        <ProfileMenu {...profileMenuProps} />
      </aside>

      {/* Floating expand button shown when sidebar is fully hidden on desktop */}
      {collapsed && (
        <button
          onClick={toggleCollapsed}
          className="hidden lg:flex fixed top-4 left-2 z-40 size-8 items-center justify-center rounded-lg bg-ink text-white/70 hover:text-white hover:bg-white/10 shadow-md border border-white/10 transition"
          title="Expand sidebar"
        >
          <PanelLeftOpen className="size-4" />
        </button>
      )}

      {/* ── Mobile drawer + overlay ── */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <aside className={cn(
        'fixed top-0 left-0 z-50 h-screen w-60 flex flex-col border-r border-white/10 bg-ink text-white transition-transform duration-200 lg:hidden',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <SidebarHeader collapsed={false} onToggle={() => {}} onClose={() => setMobileOpen(false)} />
        <SidebarNav collapsed={false} pathname={pathname} completion={completion} onNavClick={() => setMobileOpen(false)} />
        <ProfileMenu {...profileMenuProps} />
      </aside>

      {/* ── Main column — this is the scroll container ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border">
          <div className="flex items-center gap-3 px-4 lg:px-8 h-14">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden size-9 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground">
              <Menu className="size-5" />
            </button>
            <Link href="/tutor/dashboard" className="lg:hidden">
              <Image src="/assets/logo/itutor-logo-new.png" alt="iTutor" width={88} height={24} className="h-6 w-auto object-contain" />
            </Link>
            <form onSubmit={handleSearch} className="flex-1 max-w-md hidden sm:block">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search students, lessons, sessions…"
                  className="w-full pl-9 pr-4 py-2 rounded-lg bg-muted border border-transparent focus:bg-background focus:border-brand focus:outline-none text-sm" />
              </div>
            </form>
            <div className="flex-1 sm:hidden" />
            <div className="flex items-center gap-1">
              <Link href="/tutor/calendar" className="size-9 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground" title="Calendar">
                <CalendarIcon className="size-4" />
              </Link>
              <Link href="/tutor/notifications" className="relative size-9 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground" title="Notifications">
                <Bell className="size-4" />
                {unreadNotifs > 0 && <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-brand text-[10px] font-bold text-white grid place-items-center">{unreadNotifs}</span>}
              </Link>
              <Link href="/tutor/settings" className="size-9 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground" title="Settings">
                <Settings className="size-4" />
              </Link>
            </div>
          </div>
          <ListingBanner completion={completion} />
        </header>

        <main className="flex-1 px-4 lg:px-8 py-6 lg:py-8 pb-24 lg:pb-8">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur">
          <div className="grid grid-cols-5">
            {nav.slice(0, 5).map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              const Icon = item.icon;
              const locked = item.gated && !completion.loading && !completion.listed;
              return (
                <Link key={item.to} href={item.to} className={cn('flex flex-col items-center gap-1 py-2 text-[10px] font-medium relative', active ? 'text-brand-deep' : 'text-muted-foreground')}>
                  <Icon className="size-4" />
                  {item.label}
                  {locked && <Lock className="absolute top-1.5 right-[28%] size-2.5 text-muted-foreground" />}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      <LogoutConfirmModal open={logoutOpen} onClose={() => setLogoutOpen(false)} onConfirm={handleLogout} />
    </div>
  );
}

function SidebarHeader({ collapsed, onToggle, onClose }: { collapsed: boolean; onToggle: () => void; onClose?: () => void }) {
  return (
    <div className={cn('px-3 py-4 border-b border-white/10 flex items-center gap-2', collapsed && 'justify-center')}>
      {!collapsed ? (
        <Link href="/tutor/dashboard" className="flex-1 flex items-center">
          <Image src="/assets/logo/itutor-logo-dark.png" alt="iTutor" width={100} height={28} className="h-7 w-auto object-contain" />
        </Link>
      ) : (
        <Link href="/tutor/dashboard" className="size-8 grid place-items-center">
          <Image src="/assets/logo/itutor-mark.png" alt="iTutor" width={28} height={28} className="h-7 w-7 object-contain" />
        </Link>
      )}
      {onClose ? (
        <button onClick={onClose} className="size-8 grid place-items-center rounded-lg hover:bg-white/10 text-white/60">
          <X className="size-4" />
        </button>
      ) : (
        <button onClick={onToggle} className="size-8 grid place-items-center rounded-lg hover:bg-white/10 text-white/60">
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      )}
    </div>
  );
}

function SidebarNav({ collapsed, pathname, completion, onNavClick }: { collapsed: boolean; pathname: string; completion: ReturnType<typeof useTutorCompletion>; onNavClick: () => void }) {
  return (
    <nav className="flex-1 overflow-y-auto py-3">
      <div className={cn('space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
        {nav.map((item) => {
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          const Icon = item.icon;
          const locked = item.gated && !completion.loading && !completion.listed;
          return (
            <Link key={item.to} href={item.to} onClick={onNavClick}
              title={collapsed ? item.label : (locked ? 'Available once your profile is complete.' : undefined)}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium transition-colors',
                collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2',
                active ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white',
                locked && 'opacity-60',
              )}>
              <Icon className="size-4 shrink-0" />
              {!collapsed && (<><span className="flex-1">{item.label}</span>{locked && <Lock className="size-3 text-white/40" />}</>)}
            </Link>
          );
        })}
      </div>

      {!completion.loading && !completion.listed && !collapsed && (
        <div className="mx-3 mt-4 p-3 rounded-xl bg-brand/15 border border-brand/30">
          <div className="text-xs font-semibold text-white">Get listed</div>
          <div className="mt-1 text-[11px] text-white/70 leading-snug">
            Finish {completion.total - completion.completed} more step{completion.total - completion.completed === 1 ? '' : 's'} to start teaching.
          </div>
          <Link href="/tutor/get-listed" onClick={onNavClick} className="mt-2 block text-center text-xs font-semibold px-2 py-1.5 rounded-md bg-brand text-white hover:bg-brand/90">
            Continue
          </Link>
        </div>
      )}
    </nav>
  );
}

function ListingBanner({ completion }: { completion: ReturnType<typeof useTutorCompletion> }) {
  if (completion.loading || completion.listed) return null;
  const pct = Math.round((completion.completed / completion.total) * 100);
  return (
    <div className="border-b border-border bg-gradient-to-r from-[oklch(0.97_0.05_150)] to-[oklch(0.96_0.04_165)]">
      <div className="px-4 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="size-9 rounded-xl bg-brand text-white grid place-items-center shrink-0">
          <Sparkles className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink">Complete your profile to get listed and start teaching.</div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 max-w-xs bg-white rounded-full overflow-hidden border border-border">
              <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-muted-foreground font-medium tabular-nums">
              {completion.completed} of {completion.total} steps complete
            </span>
          </div>
        </div>
        <Link href="/tutor/get-listed" className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-ink text-white text-sm font-semibold hover:bg-ink/90 shrink-0">
          Complete profile
        </Link>
      </div>
    </div>
  );
}

function ProfileMenu({ collapsed, initials, name, avatarUrl, onLogout }: { collapsed: boolean; initials: string; name: string; avatarUrl: string | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative p-3 border-t border-white/10">
      <button onClick={() => setOpen((o) => !o)} className={cn('w-full flex items-center gap-3 rounded-xl hover:bg-white/5 transition px-2 py-2', collapsed && 'justify-center px-0')}>
        <div className="size-9 rounded-full bg-brand grid place-items-center text-white text-sm font-semibold overflow-hidden">
          {avatarUrl ? <img src={avatarUrl} alt="" className="size-9 rounded-full object-cover" /> : initials}
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 text-left">
              <div className="text-sm font-semibold truncate text-white">{name}</div>
              <div className="text-xs text-white/60 truncate">Tutor</div>
            </div>
            <ChevronUp className={cn('size-4 text-white/60 transition-transform', !open && 'rotate-180')} />
          </>
        )}
      </button>
      {open && (
        <div className={cn('absolute bottom-full mb-2 rounded-xl bg-background border border-border shadow-pop p-1 z-30', collapsed ? 'left-full ml-2 w-48' : 'left-3 right-3')}>
          <Link href="/tutor/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-sm text-ink">
            <Users className="size-4 text-muted-foreground" /> My Profile
          </Link>
          <Link href="/tutor/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-sm text-ink">
            <Settings className="size-4 text-muted-foreground" /> Account settings
          </Link>
          <button onClick={() => { setOpen(false); onLogout(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-coral-soft text-sm text-coral font-medium">
            <LogOut className="size-4" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
