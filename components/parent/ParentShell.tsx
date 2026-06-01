'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useEffect, useState, type ComponentType } from 'react';
import {
  LayoutDashboard, Users, Receipt, Settings, Bell,
  PanelLeftClose, PanelLeftOpen, ChevronUp, LogOut,
  GraduationCap, CreditCard, ReceiptText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import LogoutConfirmModal from '@/components/LogoutConfirmModal';

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }>; exact?: boolean; tint: string };

const nav: NavItem[] = [
  { to: '/parent/dashboard',     label: 'Home',          icon: LayoutDashboard, exact: true, tint: 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30' },
  { to: '/parent/children',      label: 'Children',      icon: Users,                        tint: 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30' },
  { to: '/parent/classes',       label: 'Find Classes',  icon: GraduationCap,                tint: 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/30' },
  { to: '/parent/subscriptions', label: 'Subscriptions', icon: CreditCard,                   tint: 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-400/30' },
  { to: '/parent/transactions',  label: 'Transactions',  icon: ReceiptText,                  tint: 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/30' },
];

const COLLAPSE_KEY = 'itutor.parentSidebar.collapsed';

export default function ParentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [collapsed, setCollapsed] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unread, setUnread] = useState(0);

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

  const handleLogout = async () => {
    localStorage.clear(); sessionStorage.clear();
    await supabase.auth.signOut({ scope: 'local' });
    window.location.href = '/login';
  };

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
                  <span className={cn('size-8 rounded-lg grid place-items-center transition', item.tint, !active && 'opacity-80 group-hover:opacity-100')}>
                    <Icon className="size-4" />
                  </span>
                  {!collapsed && <span>{item.label}</span>}
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
          <div className="grid grid-cols-5">
            {nav.map((item) => {
              const active = item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + '/');
              const Icon = item.icon;
              return (
                <Link key={item.to} href={item.to} className={cn('flex flex-col items-center gap-1 py-2 text-[10px] font-medium', active ? 'text-brand-deep' : 'text-muted-foreground')}>
                  <span className={cn('size-8 rounded-lg grid place-items-center', active ? item.tint : '')}><Icon className="size-4" /></span>
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
