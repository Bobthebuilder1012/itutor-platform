'use client';

import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Receipt,
  Bell,
  Settings,
  LogOut,
  ChevronUp,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Menu,
  X,
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
  { to: '/parent/dashboard', label: 'Home', icon: LayoutDashboard, exact: true },
  { to: '/parent/children', label: 'Children', icon: Users },
  { to: '/parent/classes', label: 'Find Classes', icon: GraduationCap },
  { to: '/parent/billing', label: 'Billing', icon: Receipt },
];

const COLLAPSE_KEY = 'itutor.parentSidebar.collapsed';

export default function ParentShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || '';
  const { profile, loading } = useProfile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    try {
      const v = localStorage.getItem(COLLAPSE_KEY);
      if (v) setCollapsed(v === '1');
    } catch {}
  }, []);

  useEffect(() => {
    if (!loading && profile && profile.role !== 'parent') router.replace('/login');
  }, [loading, profile, router]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {}
      return next;
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) router.push(`/parent/classes?q=${encodeURIComponent(query.trim())}`);
  };

  const initials = (profile?.full_name || profile?.display_name || profile?.email || 'P')
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside
        className={cn(
          'hidden lg:flex h-full shrink-0 flex-col border-r border-white/10 bg-ink text-white transition-all duration-200',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <SidebarHeader collapsed={collapsed} onToggle={toggleCollapsed} />
        <SidebarNav collapsed={collapsed} pathname={pathname} onNavClick={() => {}} />
        <ProfileMenu
          collapsed={collapsed}
          initials={initials}
          name={profile?.full_name || profile?.display_name || profile?.email || 'Parent'}
          avatarUrl={profile?.avatar_url ?? null}
          onLogout={handleLogout}
        />
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-screen w-60 flex flex-col border-r border-white/10 bg-ink text-white transition-transform duration-200 lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <SidebarHeader
          collapsed={false}
          onToggle={() => {}}
          onClose={() => setMobileOpen(false)}
        />
        <SidebarNav collapsed={false} pathname={pathname} onNavClick={() => setMobileOpen(false)} />
        <ProfileMenu
          collapsed={false}
          initials={initials}
          name={profile?.full_name || profile?.display_name || profile?.email || 'Parent'}
          avatarUrl={profile?.avatar_url ?? null}
          onLogout={handleLogout}
        />
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border">
          <div className="flex items-center gap-3 px-4 lg:px-8 h-14">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden size-9 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground"
            >
              <Menu className="size-5" />
            </button>
            <Link href="/parent/dashboard" className="lg:hidden">
              <Image
                src="/assets/logo/itutor-logo-new.png"
                alt="iTutor"
                width={88}
                height={24}
                className="h-6 w-auto object-contain"
              />
            </Link>
            <form onSubmit={handleSearch} className="flex-1 max-w-md hidden sm:block">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search classes, tutors…"
                  className="w-full pl-9 pr-4 py-2 rounded-lg bg-muted border border-transparent focus:bg-background focus:border-brand focus:outline-none text-sm"
                />
              </div>
            </form>
            <div className="flex-1 sm:hidden" />
            <div className="flex items-center gap-1">
              <Link
                href="/parent/notifications"
                className="size-9 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground"
                title="Notifications"
              >
                <Bell className="size-4" />
              </Link>
              <Link
                href="/parent/settings"
                className="size-9 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground"
                title="Settings"
              >
                <Settings className="size-4" />
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 lg:px-8 py-6 lg:py-8 pb-24 lg:pb-8">{children}</main>

        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur">
          <div className="grid grid-cols-4">
            {nav.map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  href={item.to}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2 text-[10px] font-medium',
                    active ? 'text-brand-deep' : 'text-muted-foreground',
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

function SidebarHeader({
  collapsed,
  onToggle,
  onClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onClose?: () => void;
}) {
  return (
    <div
      className={cn(
        'px-3 py-4 border-b border-white/10 flex items-center gap-2',
        collapsed && 'justify-center',
      )}
    >
      {!collapsed ? (
        <Link href="/parent/dashboard" className="flex-1 flex items-center">
          <Image
            src="/assets/logo/itutor-logo-dark.png"
            alt="iTutor"
            width={100}
            height={28}
            className="h-7 w-auto object-contain"
          />
        </Link>
      ) : (
        <Link href="/parent/dashboard" className="size-8 grid place-items-center">
          <Image
            src="/assets/logo/itutor-mark.png"
            alt="iTutor"
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
        </Link>
      )}
      {onClose ? (
        <button
          onClick={onClose}
          className="size-8 grid place-items-center rounded-lg hover:bg-white/10 text-white/60"
        >
          <X className="size-4" />
        </button>
      ) : (
        <button
          onClick={onToggle}
          className="size-8 grid place-items-center rounded-lg hover:bg-white/10 text-white/60"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      )}
    </div>
  );
}

function SidebarNav({
  collapsed,
  pathname,
  onNavClick,
}: {
  collapsed: boolean;
  pathname: string;
  onNavClick: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto py-3">
      <div className={cn('space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
        {nav.map((item) => {
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              href={item.to}
              onClick={onNavClick}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium transition-colors',
                collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2',
                active ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white',
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span className="flex-1">{item.label}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function ProfileMenu({
  collapsed,
  initials,
  name,
  avatarUrl,
  onLogout,
}: {
  collapsed: boolean;
  initials: string;
  name: string;
  avatarUrl: string | null;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative p-3 border-t border-white/10">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center gap-3 rounded-xl hover:bg-white/5 transition px-2 py-2',
          collapsed && 'justify-center px-0',
        )}
      >
        <div className="size-9 rounded-full bg-brand grid place-items-center text-white text-sm font-semibold overflow-hidden">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="size-9 rounded-full object-cover" />
          ) : (
            initials
          )}
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 text-left">
              <div className="text-sm font-semibold truncate text-white">{name}</div>
              <div className="text-xs text-white/60 truncate">Parent</div>
            </div>
            <ChevronUp
              className={cn('size-4 text-white/60 transition-transform', !open && 'rotate-180')}
            />
          </>
        )}
      </button>
      {open && (
        <div
          className={cn(
            'absolute bottom-full mb-2 rounded-xl bg-background border border-border shadow-pop p-1 z-30',
            collapsed ? 'left-full ml-2 w-48' : 'left-3 right-3',
          )}
        >
          <Link
            href="/parent/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-sm text-ink"
          >
            <Settings className="size-4 text-muted-foreground" /> Account settings
          </Link>
          <button
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-coral-soft text-sm text-coral font-medium"
          >
            <LogOut className="size-4" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}
