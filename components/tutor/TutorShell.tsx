'use client';

import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  BookOpen,
  Calendar,
  BarChart2,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  Star,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
};

const nav: NavItem[] = [
  { to: '/tutor/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/tutor/classes', label: 'My Classes', icon: BookOpen },
  { to: '/tutor/lessons', label: 'Schedule', icon: Calendar },
  { to: '/tutor/dashboard/ratings', label: 'My Ratings', icon: Star },
  { to: '/tutor/growth', label: 'Growth', icon: BarChart2 },
  { to: '/tutor/settings', label: 'Settings', icon: Settings },
];

const COLLAPSE_KEY = 'itutor.tutorSidebar.collapsed';

export default function TutorShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || '';
  const { profile, loading } = useProfile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(COLLAPSE_KEY);
      if (v) setCollapsed(v === '1');
    } catch {}
  }, []);

  useEffect(() => {
    if (!loading && profile && profile.role !== 'tutor') router.replace('/login');
  }, [loading, profile, router]);

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch {}
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.to;
    return pathname === item.to || pathname.startsWith(item.to + '/');
  }

  const displayName = profile?.display_name || profile?.full_name || 'Tutor';
  const initials = displayName.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase();

  const SidebarContent = () => (
    <>
      {/* Logo / brand */}
      <div className={cn('flex items-center gap-3 px-4 py-5 border-b border-white/10', collapsed && 'justify-center px-2')}>
        <div className="size-8 rounded-xl bg-brand flex items-center justify-center shrink-0">
          <Users className="size-4 text-white" />
        </div>
        {!collapsed && <span className="font-bold text-white text-sm">iTutor</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {nav.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.to}
              href={item.to}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition',
                active
                  ? 'bg-white/15 text-white'
                  : 'text-white/60 hover:bg-white/8 hover:text-white',
                collapsed && 'justify-center px-2',
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      {/* User / sign out */}
      <div className={cn('px-2 pb-4 border-t border-white/10 pt-3 space-y-1', collapsed && 'px-2')}>
        <div className={cn('flex items-center gap-3 px-3 py-2', collapsed && 'justify-center px-2')}>
          <div className="size-7 rounded-full bg-brand flex items-center justify-center text-[11px] font-bold text-white shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{displayName}</p>
              <p className="text-[10px] text-white/50 truncate">{profile?.username ? `@${profile.username}` : 'Tutor'}</p>
            </div>
          )}
        </div>
        <button
          onClick={handleSignOut}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm text-white/60 hover:bg-white/8 hover:text-white transition',
            collapsed && 'justify-center px-2',
          )}
          title={collapsed ? 'Sign out' : undefined}
        >
          <LogOut className="size-4 shrink-0" />
          {!collapsed && 'Sign out'}
        </button>
      </div>

      {/* Collapse toggle (desktop only) */}
      <button
        onClick={toggleCollapse}
        className="hidden lg:flex items-center justify-center w-full py-2 border-t border-white/10 text-white/40 hover:text-white transition"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
      </button>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col bg-ink shrink-0 transition-all duration-200',
          collapsed ? 'w-14' : 'w-56',
        )}
      >
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <aside
            className="absolute left-0 top-0 bottom-0 w-64 bg-ink flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-white sticky top-0 z-30">
          <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded-lg hover:bg-muted transition" aria-label="Open menu">
            <Menu className="size-5 text-ink" />
          </button>
          <span className="font-bold text-sm text-ink">iTutor</span>
          <div className="w-8" />
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
