'use client';

import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';
import Image from 'next/image';
import { ReactNode, useEffect, useState } from 'react';
import { useProfile } from '@/lib/hooks/useProfile';
import { useSuspensionCheck } from '@/lib/hooks/useSuspensionCheck';
import NotificationBell from '@/components/NotificationBell';
import MessagesIcon from '@/components/MessagesIcon';
import CalendarIcon from '@/components/CalendarIcon';
import EnableNotificationsPrompt from '@/components/EnableNotificationsPrompt';
import IOSInstallPrompt from '@/components/IOSInstallPrompt';
import { initializePushNotifications } from '@/lib/services/browserPushService';
import { isCommunitiesArchived } from '@/lib/featureFlags/communitiesArchived';
import { isGroupsFeatureEnabled } from '@/lib/featureFlags/groupsFeature';
import { getAdminHomePath, isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';
import dynamic from 'next/dynamic';
import UniversalSearchBar from '@/components/UniversalSearchBar';
import LogoutConfirmModal from '@/components/LogoutConfirmModal';

const PushTokenRegistrar = dynamic(() => import('@/components/push/PushTokenRegistrar'), { ssr: false });

interface DashboardLayoutProps {
  children: ReactNode;
  role: 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin';
  userName: string;
}

type NavLeafItem = {
  href: string;
  label: string;
  badge?: string;
  icon: ReactNode;
};

type NavGroupItem = {
  label: string;
  icon: ReactNode;
  children: NavLeafItem[];
};

type NavSectionItem = NavLeafItem | NavGroupItem;

type NavSection = {
  label: string;
  items: NavSectionItem[];
};

/* ── Icon helpers ── */
const I = ({ children }: { children: ReactNode }) => (
  <span className="w-[18px] h-[18px] flex-shrink-0 flex items-center justify-center">{children}</span>
);

const icons = {
  dashboard: <I><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-[18px] h-[18px]"><rect x="3" y="3" width="7" height="7" rx="1.5" strokeWidth="1.8"/><rect x="14" y="3" width="7" height="7" rx="1.5" strokeWidth="1.8"/><rect x="3" y="14" width="7" height="7" rx="1.5" strokeWidth="1.8"/><rect x="14" y="14" width="7" height="7" rx="1.5" strokeWidth="1.8"/></svg></I>,
  search: <I><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-[18px] h-[18px]"><circle cx="11" cy="11" r="8" strokeWidth="1.8"/><path d="m21 21-4.35-4.35" strokeWidth="1.8" strokeLinecap="round"/></svg></I>,
  groups: <I><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-[18px] h-[18px]"><path d="M17 20h4v-2a3 3 0 0 0-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H3v-2a3 3 0 0 1 5.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 0 1 9.288 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm6 3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM7 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg></I>,
  book: <I><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-[18px] h-[18px]"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" strokeWidth="1.8"/><path d="M8 7h8M8 11h5" strokeWidth="1.8" strokeLinecap="round"/></svg></I>,
  calendar: <I><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-[18px] h-[18px]"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="1.8"/><path d="M16 2v4M8 2v4M3 10h18" strokeWidth="1.8" strokeLinecap="round"/></svg></I>,
  star: <I><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-[18px] h-[18px]"><path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5z" strokeWidth="1.8"/></svg></I>,
  shield: <I><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-[18px] h-[18px]"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeWidth="1.8"/></svg></I>,
  userPlus: <I><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-[18px] h-[18px]"><path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z" strokeWidth="1.4"/><path d="M21 13v3m0 0v3m0-3h3m-3 0h-3" strokeWidth="1.8" strokeLinecap="round"/></svg></I>,
  creditCard: <I><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-[18px] h-[18px]"><rect x="1" y="4" width="22" height="16" rx="2" strokeWidth="1.8"/><path d="M1 10h22" strokeWidth="1.8"/></svg></I>,
  users: <I><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-[18px] h-[18px]"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeWidth="1.8"/><circle cx="9" cy="7" r="4" strokeWidth="1.8"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeWidth="1.8"/></svg></I>,
  mail: <I><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-[18px] h-[18px]"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" strokeWidth="1.8"/><polyline points="22,6 12,13 2,6" strokeWidth="1.8"/></svg></I>,
  queue: <I><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-[18px] h-[18px]"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9l2 2 4-4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></I>,
  chatFeedback: (
    <I>
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-[18px] h-[18px]">
        <path
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </I>
  ),
  settings: <I><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-[18px] h-[18px]"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeWidth="1.8"/><circle cx="12" cy="12" r="3" strokeWidth="1.8"/></svg></I>,
  tools: <I><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-[18px] h-[18px]"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></I>,
  sparkles: <I><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-[18px] h-[18px]"><path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></I>,
};

export default function DashboardLayout({ children, role, userName }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useProfile();
  const { isSuspended, loading: suspensionLoading } = useSuspensionCheck();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  /** Parent only: at least one linked student account (null = still checking). */
  const [parentHasLinkedChild, setParentHasLinkedChild] = useState<boolean | null>(null);

  const effectiveUserId = profile?.id || authUserId;
  const effectiveEmail = authEmail || profile?.email || null;
  const emailOnlyAdmin = isEmailManagementOnlyAdmin(effectiveEmail);
  const showGroups = isGroupsFeatureEnabled();
  const hideCommunities = isCommunitiesArchived();
  const showIcons = role !== 'reviewer' && !emailOnlyAdmin;

  const displayName =
    profile?.display_name ||
    profile?.full_name?.split(' ')[0] ||
    userName ||
    'User';
  const initials = displayName.slice(0, 2).toUpperCase();
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  /* Persist collapse */
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setAuthUserId(data.user?.id || null);
      setAuthEmail(data.user?.email || null);
    }).catch(() => {
      if (!mounted) return;
      setAuthUserId(null); setAuthEmail(null);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (effectiveUserId) initializePushNotifications(effectiveUserId);
  }, [effectiveUserId]);

  useEffect(() => {
    if (role !== 'parent' || !effectiveUserId) {
      setParentHasLinkedChild(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from('parent_child_links')
      .select('child_id')
      .eq('parent_id', effectiveUserId)
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setParentHasLinkedChild(false);
          return;
        }
        setParentHasLinkedChild((data?.length ?? 0) > 0);
      });
    return () => {
      cancelled = true;
    };
  }, [role, effectiveUserId, pathname]);

  useEffect(() => {
    if (emailOnlyAdmin && pathname !== '/admin/emails') router.replace('/admin/emails');
  }, [emailOnlyAdmin, pathname, router]);

  const handleLogout = async () => {
    localStorage.clear(); sessionStorage.clear();
    await supabase.auth.signOut({ scope: 'local' });
    window.location.href = '/login';
  };

  const getDashboardLink = () => {
    switch (role) {
      case 'student': return '/student/dashboard';
      case 'tutor': return '/tutor/dashboard';
      case 'parent': return '/parent/dashboard';
      case 'reviewer': return '/reviewer/dashboard';
      case 'admin': return getAdminHomePath(effectiveEmail);
      default: return '/';
    }
  };

  const getNavSections = (): NavSection[] => {
    if (emailOnlyAdmin) {
      return [{ label: 'Admin', items: [{ href: '/admin/emails', label: 'Email Management', icon: icons.mail }] satisfies NavSectionItem[] }];
    }

    switch (role) {
      case 'student': return [
        { label: 'Menu', items: [
          { href: '/student/dashboard', label: 'Dashboard', icon: icons.dashboard },
          { href: '/student/find-tutors', label: 'Find iTutors', icon: icons.search },
          ...(showGroups ? [{ href: '/lessons', label: 'Lessons', icon: icons.groups }] : []),
        ]},
        { label: 'Learning', items: [
          { href: '/student/bookings', label: 'My Bookings', icon: icons.calendar },
        ]},
        { label: 'Account', items: [
          {
            label: 'Tools',
            icon: icons.tools,
            children: [
              { href: '/student/curriculum', label: 'Curriculum', icon: icons.book },
            ],
          },
          { href: '/student/settings', label: 'Settings', icon: icons.settings },
        ]},
      ];
      case 'tutor': return [
        { label: 'Menu', items: [
          { href: '/tutor/dashboard', label: 'Dashboard', icon: icons.dashboard },
          { href: '/tutor/find-students', label: 'Find Students', icon: icons.search },
          { href: '/tutor/bookings', label: 'Booking Requests', icon: icons.calendar },
          ...(showGroups ? [{ href: '/lessons', label: 'Lessons', icon: icons.groups }] : []),
        ]},
        { label: 'Settings', items: [
          { href: '/verification', label: 'Verification', badge: '!', icon: icons.shield },
          {
            label: 'Tools',
            icon: icons.tools,
            children: [
              { href: '/tutor/curriculum', label: 'Curriculum', icon: icons.book },
              { href: '/tools/ai', label: 'iTutor AI', icon: icons.sparkles },
            ],
          },
          { href: '/tutor/settings', label: 'Settings', icon: icons.settings },
        ]},
      ];
      case 'parent': {
        const menuItems = [
          { href: '/parent/dashboard', label: 'Dashboard', icon: icons.dashboard },
          { href: '/parent/add-child', label: 'Add Child', icon: icons.userPlus },
          { href: '/parent/approve-bookings', label: 'Booking Requests', icon: icons.calendar },
        ];
        if (parentHasLinkedChild === true) {
          menuItems.push({
            href: '/parent/session-feedback',
            label: 'Session feedback',
            icon: icons.chatFeedback,
          });
        }
        if (showGroups) {
          menuItems.push({ href: '/lessons', label: 'Lessons', icon: icons.groups });
        }
        return [
          { label: 'Menu', items: menuItems },
          { label: 'Account', items: [
            { href: '/parent/settings', label: 'Settings', icon: icons.settings },
          ]},
        ];
      }
      case 'reviewer': return [
        { label: 'Review', items: [
          { href: '/reviewer/dashboard', label: 'Dashboard', icon: icons.dashboard },
          { href: '/reviewer/verification/queue', label: 'Verification Queue', icon: icons.queue },
          { href: '/reviewer/verified-tutors', label: 'Verified iTutors', icon: icons.shield },
          { href: '/reviewer/accounts', label: 'Account Management', icon: icons.users },
          { href: '/reviewer/payments', label: 'Payments & Revenue', icon: icons.creditCard },
        ]},
      ];
      case 'admin': return [
        { label: 'Admin', items: [
          { href: '/reviewer/verification/queue', label: 'Verification Queue', icon: icons.queue },
          { href: '/reviewer/verified-tutors', label: 'Verified iTutors', icon: icons.shield },
          { href: '/reviewer/accounts', label: 'Account Management', icon: icons.users },
          { href: '/reviewer/payments', label: 'Payments & Revenue', icon: icons.creditCard },
          { href: '/admin/emails', label: 'Email Management', icon: icons.mail },
        ]},
      ];
      default: return [];
    }
  };

  const navSections = getNavSections();
  const isGroupsPage = pathname === '/lessons' || pathname.startsWith('/lessons/') || pathname === '/groups' || pathname.startsWith('/groups/');

  if (suspensionLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <PushTokenRegistrar />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-[99] lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── SIDEBAR ── */}
      <aside className={`fixed top-0 left-0 bottom-0 ${collapsed ? 'w-[64px]' : 'w-[240px]'} bg-black border-r border-white/10 z-[100] flex flex-col transition-all duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>

        {/* Logo */}
        <div className={`h-16 flex items-center border-b border-white/10 flex-shrink-0 ${collapsed ? 'justify-center px-3' : 'px-5 justify-between'}`}>
          {collapsed ? (
            sidebarOpen ? (
              // Mobile overlay — navigate to dashboard as before
              <Link href={getDashboardLink()} onClick={() => setSidebarOpen(false)} title="Go to dashboard" className="flex items-center justify-center hover:opacity-80 transition-opacity">
                <Image src="/assets/logo/itutor-mark.png" alt="iTutor" width={36} height={36} className="w-9 h-9 object-contain" />
              </Link>
            ) : (
              // Desktop — click logo to expand sidebar
              <button onClick={toggleCollapsed} title="Expand sidebar" className="flex items-center justify-center hover:opacity-80 transition-opacity">
                <Image src="/assets/logo/itutor-mark.png" alt="iTutor" width={36} height={36} className="w-9 h-9 object-contain" />
              </button>
            )
          ) : (
            <>
              <Link href={getDashboardLink()} onClick={() => setSidebarOpen(false)}>
                <Image src="/assets/logo/itutor-logo-dark.png" alt="iTutor" width={110} height={36} className="h-8 w-auto" />
              </Link>
              <button onClick={toggleCollapsed} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-colors" title="Collapse sidebar">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M15 18l-6-6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2">
          {navSections.map((section) => (
            <div key={section.label}>
              {section.items.map((item) => {
                if ('children' in item) {
                  const groupAnyActive = item.children.some(
                    (c) =>
                      pathname === c.href ||
                      (c.href !== getDashboardLink() && pathname.startsWith(c.href)),
                  );
                  const groupKey = `${section.label}-${item.label}`;
                  const isOpen = openGroups[groupKey] ?? groupAnyActive;
                  return (
                    <div key={`nav-group-${section.label}-${item.label}`}>
                      {!collapsed && (
                        <button
                          type="button"
                          onClick={() => setOpenGroups((s) => ({ ...s, [groupKey]: !isOpen }))}
                          className={`w-full flex items-center rounded-xl gap-3 px-3 py-[10px] mb-0.5 transition-colors ${
                            groupAnyActive ? 'text-itutor-green' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          {item.icon}
                          <span className="text-[13.5px] font-medium flex-1 text-left">{item.label}</span>
                          <svg
                            className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      )}
                      {(collapsed || isOpen) && item.children.map((sub) => {
                        const isActive =
                          pathname === sub.href ||
                          (sub.href !== getDashboardLink() && pathname.startsWith(sub.href));
                        const hasBadge = Boolean(sub.badge);
                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            onClick={() => setSidebarOpen(false)}
                            title={collapsed ? sub.label : undefined}
                            className={`relative flex items-center rounded-xl transition-all duration-150 ${collapsed ? 'justify-center w-10 h-10 mx-auto my-[3px]' : 'gap-3 px-3 py-[10px] mb-0.5'} ${isActive ? 'bg-itutor-green/10 text-itutor-green' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                          >
                            {sub.icon}
                            {collapsed && hasBadge && (
                              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />
                            )}
                            {!collapsed && (
                              <>
                                <span className="text-[13.5px] font-medium">{sub.label}</span>
                                {hasBadge && (
                                  <span className="ml-auto w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                    {sub.badge}
                                  </span>
                                )}
                              </>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  );
                }
                const isActive =
                  pathname === item.href ||
                  (item.href !== getDashboardLink() && pathname.startsWith(item.href));
                const hasBadge = Boolean(item.badge);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    title={collapsed ? item.label : undefined}
                    className={`relative flex items-center rounded-xl transition-all duration-150 ${collapsed ? 'justify-center w-10 h-10 mx-auto my-[3px]' : 'gap-3 px-3 py-[10px] mb-0.5'} ${isActive ? 'bg-itutor-green/10 text-itutor-green' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                  >
                    {item.icon}
                    {collapsed && hasBadge && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />}
                    {!collapsed && (
                      <>
                        <span className="text-[13.5px] font-medium">{item.label}</span>
                        {hasBadge && (
                          <span className="ml-auto w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-white/10 p-2">
          {collapsed ? (
            <button
              type="button"
              onClick={() => setLogoutModalOpen(true)}
              title={`Log out ${displayName}`}
              className="w-full flex justify-center py-2"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-itutor-green to-emerald-600 flex items-center justify-center text-black font-bold text-[12px]">{initials}</div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setLogoutModalOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group text-left"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-itutor-green to-emerald-600 flex items-center justify-center text-black font-bold text-[12px] flex-shrink-0">{initials}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white truncate">{displayName}</p>
                <p className={`text-[11px] font-semibold ${role === 'tutor' ? 'text-itutor-green' : 'text-gray-500'}`}>
                  {role === 'tutor' ? '✦ ' : ''}{roleLabel}
                </p>
              </div>
              <svg className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M9 18l6-6-6-6" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </aside>

      <LogoutConfirmModal
        open={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        onConfirm={handleLogout}
      />

      {/* ── MAIN ── */}
      <div className={`flex-1 ${collapsed ? 'lg:ml-[64px]' : 'lg:ml-[240px]'} flex flex-col min-h-screen transition-all duration-300`}>

        {/* Topbar */}
        <header className="h-16 sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100 flex items-center gap-3 px-4 lg:px-7">
          {/* Mobile hamburger */}
          <button className="lg:hidden w-9 h-9 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-600 flex-shrink-0" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M4 6h16M4 12h16M4 18h16" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>

          {/* Search bar — student & parent only */}
          {(role === 'student' || role === 'parent') && (
            <div className="flex-1 max-w-xl mx-2 lg:mx-4">
              <UniversalSearchBar
                userRole={role}
                onResultClick={(profile) => {
                  router.push(`/tutors/${profile.id}`);
                }}
              />
            </div>
          )}

          {/* Right actions */}
          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            {showIcons && effectiveUserId && (
              <>
                <CalendarIcon userId={effectiveUserId} role={role} variant="light" />
                <MessagesIcon userId={effectiveUserId} role={role} variant="light" />
              </>
            )}
            {effectiveUserId && <NotificationBell userId={effectiveUserId} />}
            <Link
              href={`/${role}/settings`}
              className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500 hover:border-itutor-green hover:text-itutor-green transition-colors"
              aria-label="Settings"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeWidth="1.8"/>
                <circle cx="12" cy="12" r="3" strokeWidth="1.8"/>
              </svg>
            </Link>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-itutor-green to-emerald-600 flex items-center justify-center text-black font-bold text-[12px] cursor-pointer select-none">
              {initials}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className={`flex-1 ${isGroupsPage ? 'flex flex-col min-h-0' : 'p-5 lg:p-8'}`}>
          {effectiveUserId && <EnableNotificationsPrompt userId={effectiveUserId} />}
          <IOSInstallPrompt />
          {children}
        </main>
      </div>
    </div>
  );
}
