'use client';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';
import { ReactNode, useEffect, useState } from 'react';
import { useProfile } from '@/lib/hooks/useProfile';
import { useSuspensionCheck } from '@/lib/hooks/useSuspensionCheck';
import NotificationBell from '@/components/NotificationBell';
import MessagesIcon from '@/components/MessagesIcon';
import CalendarIcon from '@/components/CalendarIcon';
import Footer from '@/components/landing/Footer';

interface DashboardLayoutProps {
  children: ReactNode;
  role: 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin';
  userName: string;
}


export default function DashboardLayout({ children, role, userName }: DashboardLayoutProps) {
  const router = useRouter();
  const { profile } = useProfile();
  const { isSuspended, loading: suspensionLoading } = useSuspensionCheck();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileIconMenuOpen, setMobileIconMenuOpen] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  const effectiveUserId = profile?.id || authUserId;
  const showIcons = role !== 'reviewer';
  const displayName =
    profile?.username ||
    userName ||
    profile?.display_name ||
    profile?.full_name ||
    'User';

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!mounted) return;
        setAuthUserId(data.user?.id || null);
      })
      .catch(() => {
        if (!mounted) return;
        setAuthUserId(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleCalendarNav = () => {
    if (role === 'tutor') router.push('/tutor/calendar');
    else if (role === 'student') router.push('/student/sessions');
    else if (role === 'parent') router.push('/parent/sessions');
  };

  const handleMessagesNav = () => {
    if (role === 'student') router.push('/student/messages');
    else if (role === 'tutor') router.push('/tutor/messages');
    else if (role === 'parent') router.push('/parent/messages');
  };

  const handleNotificationsNav = () => {
    if (role === 'student') router.push('/student/notifications');
    else if (role === 'tutor') router.push('/tutor/notifications');
    else if (role === 'parent') router.push('/parent/notifications');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const getDashboardLink = () => {
    switch (role) {
      case 'student':
        return '/student/dashboard';
      case 'tutor':
        return '/tutor/dashboard';
      case 'parent':
        return '/parent/dashboard';
      case 'reviewer':
        return '/reviewer/dashboard';
      default:
        return '/';
    }
  };

  const getNavLinks = () => {
    switch (role) {
      case 'student':
        return [
          { href: '/student/find-tutors', label: 'Find iTutors' },
          { href: '/communities', label: 'Communities' },
          { href: '/student/bookings', label: 'My Bookings' },
          { href: '/student/sessions', label: 'Sessions' },
          { href: '/student/ratings', label: 'My Reviews' },
          { href: '/student/settings', label: 'Settings' },
        ];
      case 'tutor':
        return [
          { href: '/tutor/find-students', label: 'Find Students' },
          { href: '/tutor/bookings', label: 'Booking Requests' },
          { href: '/communities', label: 'Communities' },
          { href: '/tutor/curriculum', label: 'Curriculum' },
          { href: '/tutor/sessions', label: 'Sessions' },
          { href: '/tutor/settings', label: 'Settings' },
        ];
      case 'parent':
        return [
          { href: '/parent/add-child', label: 'Add Child' },
          { href: '/communities', label: 'Communities' },
          { href: '/parent/approve-bookings', label: 'Booking Requests' },
          { href: '/parent/sessions', label: 'Sessions' },
          { href: '/parent/settings', label: 'Settings' },
        ];
      case 'reviewer':
        return [
          { href: '/reviewer/verification/queue', label: 'Verification Queue' },
          { href: '/reviewer/verified-tutors', label: 'Verified iTutors' },
          { href: '/reviewer/accounts', label: 'Account Management' },
          { href: '/reviewer/payments', label: 'Payments & Revenue' },
          { href: '/reviewer/settings', label: 'Settings' },
        ];
      default:
        return [];
    }
  };

  // Show loading state while checking suspension
  if (suspensionLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex flex-col">
      <nav className="bg-black shadow-lg border-b border-gray-900 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Left: Logo + Navigation */}
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 overflow-hidden">
              {/* Logo */}
              <Link href={getDashboardLink()} className="flex-shrink-0 flex items-center group">
                <img
                  src="/assets/logo/itutor-logo-dark.png"
                  alt="iTutor"
                  className="h-8 sm:h-10 md:h-12 w-auto group-hover:scale-105 transition-transform duration-300"
                />
              </Link>

              {/* Navigation Links */}
              <div className="flex-1 min-w-0">
                <div className="flex ml-2 sm:ml-3 md:ml-4 lg:ml-6 space-x-1 sm:space-x-2 md:space-x-3 lg:space-x-6 overflow-x-auto whitespace-nowrap flex-nowrap scrollbar-hide">
                  {getNavLinks().map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="border-transparent text-gray-300 hover:text-itutor-green hover:border-itutor-green inline-flex items-center px-1 pt-1 border-b-2 text-[10px] sm:text-xs md:text-sm font-medium transition-colors duration-200 whitespace-nowrap"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Icons + Logout */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 pl-2">
              {/* Icons */}
              <div className="flex items-center gap-3">
                {showIcons && (
                  <>
                    {/* Always show the icons so the header doesn't look empty. */}
                    {!effectiveUserId ? (
                      <>
                        <button
                          onClick={handleCalendarNav}
                          className="relative p-2 text-gray-400 hover:text-itutor-white transition-colors rounded-lg hover:bg-gray-800"
                          title={role === 'tutor' ? 'Calendar' : 'Sessions'}
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </button>
                        <button
                          onClick={handleMessagesNav}
                          className="relative p-2 text-gray-400 hover:text-itutor-white transition-colors rounded-lg hover:bg-gray-800"
                          title="Messages"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                          </svg>
                        </button>
                        <button
                          onClick={handleNotificationsNav}
                          className="relative p-2 text-gray-400 hover:text-itutor-white transition-colors rounded-lg hover:bg-gray-800"
                          title="Notifications"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <>
                        <CalendarIcon userId={effectiveUserId} role={role} />
                        <MessagesIcon userId={effectiveUserId} role={role} />
                        <NotificationBell userId={effectiveUserId} />
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Username and Logout - Pushed to the right */}
              <div className="flex items-center gap-2 sm:gap-3 ml-4 sm:ml-6 lg:ml-8">
                <span className="text-sm text-gray-300 truncate max-w-[120px]">{displayName}</span>
                
                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  className="bg-gradient-to-r from-gray-800 to-gray-700 hover:from-gray-700 hover:to-gray-600 text-itutor-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 border border-gray-600 hover:border-itutor-green"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>

      </nav>
      
      <main className="flex-1 w-full py-4 px-2 sm:py-6 sm:px-4 lg:py-8 lg:px-6 lg:max-w-7xl lg:mx-auto">
        <div className="bg-white rounded-lg sm:rounded-xl lg:rounded-2xl shadow-lg sm:shadow-xl p-3 sm:p-4 lg:p-6">
          {children}
        </div>
      </main>

      <Footer role={role} />
    </div>
  );
}