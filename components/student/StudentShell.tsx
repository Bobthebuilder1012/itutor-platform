'use client';

import Link from 'next/link';
import LogoutConfirmModal from '@/components/LogoutConfirmModal';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Search,
  CalendarDays,
  BookOpen,
  Settings,
  Bell,
  GraduationCap,
  Wrench,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  ChevronUp,
  CreditCard,
  ReceiptText,
  Lock,
  UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StudentStoreProvider } from '@/lib/student-store';
import CampaignCta from '@/components/classMatchWeek/CampaignCta';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import dynamic from 'next/dynamic';

const PushTokenRegistrar = dynamic(() => import('@/components/push/PushTokenRegistrar'), { ssr: false });

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
  tint: string;
  /**
   * A destination that needs an account. Only meaningful in `anonymous` mode:
   * the item still renders, dimmed and with a padlock, and `to` is expected to
   * be a signup URL that comes back here. Present rather than hidden because a
   * rail that grows four new icons the moment you sign up hides what the
   * account is FOR — and because the visitor is standing on a screen whose
   * whole argument is that an account saves this.
   */
  locked?: boolean;
};

/**
 * The default student navigation. Exported as a type so a section of the site
 * that is still "the student experience" — Class Match Week — can supply its
 * own destinations without reimplementing the sidebar, the mobile bottom bar,
 * the collapse behaviour or the profile menu. Passing nothing keeps every
 * existing student page exactly as it was.
 */
export type { NavItem as StudentNavItem };

const nav: NavItem[] = [
  { to: '/student/dashboard', label: 'Home', icon: LayoutDashboard, exact: true, tint: 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30' },
  { to: '/student/find-tutors', label: 'Explore', icon: Search, tint: 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/30' },
  { to: '/student/classes', label: 'My Classes', icon: GraduationCap, tint: 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/30' },
  { to: '/student/bookings', label: 'My Bookings', icon: CalendarDays, tint: 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30' },
  { to: '/student/subscriptions', label: 'Subscriptions', icon: CreditCard, tint: 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-400/30' },
  // Transactions moved into Settings → Billing. A payment history is something a
  // student looks up occasionally; the sidebar is for the places they go weekly.
  { to: '/student/tools', label: 'Tools', icon: Wrench, tint: 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/30' },
];

const COLLAPSE_KEY = 'itutor.sidebarCollapsed';


function ProfileMenu({ collapsed, displayName, initials, roleLabel, avatarUrl }: {
  collapsed: boolean;
  displayName: string;
  initials: string;
  roleLabel: string;
  avatarUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const handleLogout = async () => {
    localStorage.clear();
    sessionStorage.clear();
    await supabase.auth.signOut({ scope: 'local' });
    window.location.href = '/login';
  };

  return (
    <div className="relative p-3 border-t border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn('w-full flex items-center gap-3 rounded-xl hover:bg-muted transition px-2 py-2', collapsed && 'justify-center px-0')}
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={displayName}
            width={36}
            height={36}
            className="size-9 rounded-full object-cover flex-shrink-0"
            unoptimized
          />
        ) : (
          <div className="size-9 rounded-full bg-gradient-to-br from-coral to-peach grid place-items-center text-white text-sm font-semibold shadow-sm flex-shrink-0">
            {initials}
          </div>
        )}
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1 text-left">
              <div className="text-sm font-semibold truncate text-foreground">{displayName}</div>
              <div className="text-xs text-muted-foreground truncate">{roleLabel}</div>
            </div>
            <ChevronUp className={cn('size-4 text-muted-foreground transition-transform', !open && 'rotate-180')} />
          </>
        )}
      </button>
      {open && (
        <div className={cn('absolute bottom-full mb-2 rounded-xl bg-background border border-border shadow-pop p-1 z-30', collapsed ? 'left-full ml-2 w-48' : 'left-3 right-3')}>
          <Link href="/student/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-sm">
            <Settings className="size-4 text-muted-foreground" /> Account settings
          </Link>
          <button
            onClick={() => { setConfirmLogout(true); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-coral-soft text-sm text-coral font-medium"
          >
            <LogOut className="size-4" /> Log out
          </button>
        </div>
      )}
      <LogoutConfirmModal open={confirmLogout} onClose={() => setConfirmLogout(false)} onConfirm={handleLogout} role="student" />
    </div>
  );
}

/**
 * What sits where the profile menu sits, for a visitor with no account.
 *
 * The profile menu cannot simply be hidden: it anchors the bottom of the rail,
 * and without it the sidebar ends in nothing. It also cannot be RENDERED, which
 * is the bug this mode exists to fix — `useProfile()` returns null for a
 * logged-out browser and the menu then shows an avatar, the literal name
 * "Student" and a Log out button for an account that does not exist.
 *
 * `signupHref` carries the visitor back to where they were standing, so the
 * account is the thing that continues the journey rather than interrupting it.
 */
function AnonymousPanel({
  collapsed,
  signupHref,
  loginHref,
}: {
  collapsed: boolean;
  signupHref: string;
  loginHref: string;
}) {
  return (
    <div className="border-t border-border p-3">
      {collapsed ? (
        <Link
          href={signupHref}
          title="Create a free account"
          className="grid size-10 place-items-center rounded-xl bg-brand text-white transition hover:bg-brand-deep"
        >
          <UserPlus className="size-4" />
        </Link>
      ) : (
        <div className="space-y-2">
          <Link
            href={signupHref}
            className="block rounded-xl bg-brand px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-brand-deep"
          >
            Create a free account
          </Link>
          <Link
            href={loginHref}
            className="block rounded-xl px-3 py-2 text-center text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            Log in
          </Link>
        </div>
      )}
    </div>
  );
}

function ShellInner({
  children,
  navItems,
  anonymous = false,
  signupHref = '/signup',
  loginHref = '/login',
  searchAction,
}: {
  children: ReactNode;
  navItems: NavItem[];
  anonymous?: boolean;
  signupHref?: string;
  loginHref?: string;
  /** Where the top-bar search box submits. Defaults to the student marketplace. */
  searchAction?: (query: string) => string;
}) {
  const nav = navItems;
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useProfile();
  // Anonymous opens collapsed. The rail is orientation for someone who has not
  // decided to be here yet, not a menu they are navigating — and the screen it
  // frames (matches, browse) is the thing they came for.
  const [collapsed, setCollapsed] = useState(anonymous);
  const [query, setQuery] = useState('');

  const displayName = profile?.display_name || profile?.full_name?.split(' ')[0] || 'Student';
  const fullName = profile?.full_name || profile?.display_name || 'Student';
  const initials = fullName.slice(0, 2).toUpperCase();

  /**
   * Read from the profile, not hard-coded.
   *
   * This shell is no longer student-only: CampaignShell reuses it for the Class
   * Match Week portal precisely so the sidebar, profile menu, notifications and
   * logout are not reimplemented — and the campaign is open to parents. A parent
   * signing in there was shown their own name above the word "Student", which
   * reads as the platform having mistaken who they are, on the one screen where
   * a new parent is deciding whether to trust it.
   */
  const roleLabel =
    profile?.role === 'parent' ? 'Parent' : profile?.role === 'tutor' ? 'Tutor' : 'Student';

  // The stored preference belongs to an account's sessions. An anonymous
  // visitor neither reads it (they would inherit whatever the last person on
  // this browser chose, and the mode is specified as collapsed) nor writes it
  // (toggling the rail on a marketing surface should not change how the app
  // opens once they do sign up).
  useEffect(() => {
    if (anonymous) return;
    try {
      const v = localStorage.getItem(COLLAPSE_KEY);
      if (v) setCollapsed(v === '1');
    } catch {}
  }, [anonymous]);

  useEffect(() => {
    if (anonymous) return;
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch {}
  }, [collapsed, anonymous]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    // Anonymously this must not be /student/find-tutors: that page reads
    // `groups` through the browser client, and the only SELECT policy on it is
    // TO authenticated — so RLS empties it with no error and the search looks
    // broken rather than gated.
    if (searchAction) {
      router.push(searchAction(q));
      return;
    }
    router.push(`/student/find-tutors${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  };

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {profile?.id && <PushTokenRegistrar />}

      {/* Desktop sidebar */}
      <aside className={cn(
        'dark hidden lg:flex shrink-0 flex-col border-r border-border bg-ink text-foreground transition-all duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}>
        <div className={cn('px-3 py-4 border-b border-border flex items-center gap-2', collapsed && 'justify-center')}>
          {!collapsed ? (
            <Link href="/" className="flex-1" title="Back to home">
              <Image src="/assets/logo/itutor-logo-dark.png" alt="iTutor" width={120} height={32} className="h-8 w-auto object-contain" />
            </Link>
          ) : (
            <Link href="/" title="Back to home" className="size-10 grid place-items-center">
              <Image src="/assets/logo/itutor-mark.png" alt="iTutor" width={40} height={40} className="h-10 w-10 object-contain" />
            </Link>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="size-8 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          <div className={cn('space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
            {nav.map((item) => {
              // Compare paths, not hrefs. A destination that carries a query
              // string (`/find/browse?role=parent`) never matched `pathname`,
              // so it could never show as the active item.
              const target = item.to.split('?')[0];
              const active = item.exact ? pathname === target : pathname.startsWith(target);
              const Icon = item.icon;
              const locked = anonymous && item.locked;
              return (
                <Link
                  key={item.to}
                  href={item.to}
                  title={locked ? `${item.label} — create a free account` : collapsed ? item.label : undefined}
                  className={cn(
                    'flex items-center rounded-xl text-sm font-medium transition-colors group',
                    collapsed ? 'justify-center p-2' : 'gap-3 px-2 py-2',
                    active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  )}
                >
                  <span className={cn('size-8 rounded-lg grid place-items-center transition', item.tint, !active && 'opacity-80 group-hover:opacity-100', locked && 'opacity-40 group-hover:opacity-70')}>
                    <Icon className="size-4" />
                  </span>
                  {!collapsed && (
                    <span className={cn('flex flex-1 items-center gap-2', locked && 'opacity-60')}>
                      {item.label}
                      {locked ? <Lock className="size-3 shrink-0" /> : null}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

        </nav>

        {anonymous ? (
          <AnonymousPanel collapsed={collapsed} signupHref={signupHref} loginHref={loginHref} />
        ) : (
          <ProfileMenu collapsed={collapsed} displayName={displayName} initials={initials} roleLabel={roleLabel} avatarUrl={profile?.avatar_url} />
        )}
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto overflow-x-hidden">
        {/* Top bar. Opaque, not frosted — `bg-background/90` emitted no
            background-color at all (the token is a bare var() with no
            <alpha-value>, so Tailwind drops the modifier utility), leaving a
            transparent bar whose backdrop-filter put it on its own composited
            layer and painted it bright over any overlay scrim. See TutorShell. */}
        <header className="sticky top-0 z-30 bg-background border-b border-border">
          <div className="flex items-center gap-3 px-4 lg:px-6 h-14">
            <Link href="/" className="lg:hidden">
              <Image src="/assets/logo/itutor-logo-light.png" alt="iTutor" width={90} height={24} className="h-7 w-auto object-contain" />
            </Link>

            <form onSubmit={onSearch} className="flex-1 max-w-xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tutors, subjects, topics…"
                  className="w-full pl-9 pr-4 py-2 rounded-full bg-muted border border-transparent focus:bg-background focus:border-brand focus:outline-none text-sm"
                />
              </div>
            </form>

            {/* Campaign entry point. In the shell rather than on the dashboard
                so it is reachable from every student page; it renders nothing
                when no campaign is live, or once inside the campaign itself.
                Anonymously it is skipped outright — the campaign's own pages
                gate on a session, so the CTA would be an invitation to a login
                wall. */}
            {anonymous ? null : <CampaignCta />}

            {anonymous ? (
              // Notifications and Settings are an account's, so they are
              // replaced rather than dimmed — there is nothing behind them to
              // unlock, and Log in is what this visitor might actually want.
              <Link
                href={loginHref}
                className="rounded-full border border-border px-4 py-1.5 text-sm font-semibold text-ink transition hover:bg-muted"
              >
                Log in
              </Link>
            ) : (
              <div className="flex items-center gap-1">
                <Link href="/student/notifications" className="relative size-9 grid place-items-center rounded-full hover:bg-muted text-muted-foreground" title="Notifications">
                  <Bell className="size-4" />
                </Link>
                <Link href="/student/settings" className="size-9 grid place-items-center rounded-full hover:bg-muted text-muted-foreground" title="Settings">
                  <Settings className="size-4" />
                </Link>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 lg:px-8 py-6 lg:py-8 pb-24 lg:pb-8">
          {children}
        </main>

        {/* Mobile bottom nav. Opaque for the same reason as the header. */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background">
          <div className="grid grid-cols-5">
            {nav.slice(0, 5).map((item) => {
              const target = item.to.split('?')[0];
              const active = item.exact ? pathname === target : pathname.startsWith(target);
              const Icon = item.icon;
              const locked = anonymous && item.locked;
              return (
                <Link
                  key={item.to}
                  href={item.to}
                  className={cn('flex flex-col items-center gap-1 py-2 text-[10px] font-medium', active ? 'text-brand-deep' : 'text-muted-foreground', locked && 'opacity-50')}
                >
                  <span className={cn('size-8 rounded-lg grid place-items-center', active ? item.tint : '')}>
                    <Icon className="size-4" />
                  </span>
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

export function StudentShell({
  children,
  navItems,
  anonymous,
  signupHref,
  loginHref,
  searchAction,
}: {
  children: ReactNode;
  /** Override the sidebar destinations. Omit for the standard student nav. */
  navItems?: NavItem[];
  /**
   * Render for a visitor with NO ACCOUNT: sidebar starts collapsed, the profile
   * menu is replaced by a signup panel, the notification and settings icons
   * become Log in, and `locked` nav items dim.
   *
   * This mode is why /find/results no longer renders bare. The comment that
   * used to sit on that page said this shell could not be used logged out
   * because it "falls back to the literal name Student when useProfile() has no
   * user" — true of the profile menu, and fixed here rather than routed around,
   * so the anonymous half of the Finder is the same product as the marketplace
   * it hands off to instead of a thinner-looking cousin.
   */
  anonymous?: boolean;
  /** Anonymous only: where the signup CTA goes. Carry a redirect back. */
  signupHref?: string;
  /** Anonymous only: where Log in goes. Carry a redirect back. */
  loginHref?: string;
  /** Build the top-bar search destination. Omit for the student marketplace. */
  searchAction?: (query: string) => string;
}) {
  return (
    <StudentStoreProvider>
      <ShellInner
        navItems={navItems ?? nav}
        anonymous={anonymous}
        signupHref={signupHref}
        loginHref={loginHref}
        searchAction={searchAction}
      >
        {children}
      </ShellInner>
    </StudentStoreProvider>
  );
}
