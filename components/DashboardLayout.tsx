'use client';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';
import { ReactNode, useState } from 'react';
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
          { href: '/student/ratings', label: 'Ratings' },
          { href: '/student/settings', label: 'Settings' },
        ];
      case 'tutor':
        return [
          { href: '/tutor/find-students', label: 'Find Students' },
          { href: '/tutor/bookings', label: 'Booking Requests' },
          { href: '/tutor/curriculum', label: 'Curriculum' },
          { href: '/communities', label: 'Communities' },
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
            {/* Left: Hamburger Menu (Mobile) + Logo */}
            <div className="flex items-center gap-3">
              {/* Hamburger Menu Button - Mobile Only */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-md text-gray-400 hover:text-itutor-green hover:bg-gray-800 focus:outline-none transition-colors"
                aria-label="Open menu"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {mobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>

              {/* Logo */}
              <Link href={getDashboardLink()} className="flex-shrink-0 flex items-center group">
                <img
                  src="/assets/logo/itutor-logo-dark.png"
                  alt="iTutor"
                  className="h-8 sm:h-10 md:h-12 w-auto group-hover:scale-105 transition-transform duration-300"
                />
              </Link>

              {/* Desktop Navigation Links */}
              <div className="hidden lg:flex lg:ml-6 lg:space-x-6">
                {getNavLinks().map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="border-transparent text-gray-400 hover:text-itutor-green hover:border-itutor-green inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors duration-200"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Right: Icons + Logout */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Desktop: Show individual icons */}
              <div className="hidden sm:flex items-center gap-3">
                {profile?.id && role !== 'reviewer' && <CalendarIcon userId={profile.id} role={role} />}
                {profile?.id && role !== 'reviewer' && <MessagesIcon userId={profile.id} role={role} />}
                {profile?.id && <NotificationBell userId={profile.id} />}
              </div>

              {/* Mobile: Consolidated Icon Menu */}
              {profile?.id && (
                <div className="relative sm:hidden">
                  <button
                    onClick={() => setMobileIconMenuOpen(!mobileIconMenuOpen)}
                    className="p-2 rounded-md text-gray-400 hover:text-itutor-green hover:bg-gray-800 focus:outline-none transition-colors relative"
                    aria-label="Open notifications menu"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>

                  {/* Mobile Icon Dropdown */}
                  {mobileIconMenuOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setMobileIconMenuOpen(false)}
                      />
                      <div className="absolute right-0 mt-2 w-56 bg-gray-900 rounded-lg shadow-lg border border-gray-700 py-2 z-50">
                        {role !== 'reviewer' && (
                          <>
                            <Link
                              href={`/${role}/calendar`}
                              onClick={() => setMobileIconMenuOpen(false)}
                              className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-itutor-green transition-colors"
                            >
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span>Calendar</span>
                            </Link>
                            <Link
                              href={`/${role}/messages`}
                              onClick={() => setMobileIconMenuOpen(false)}
                              className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-itutor-green transition-colors"
                            >
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                              </svg>
                              <span>Messages</span>
                            </Link>
                          </>
                        )}
                        <Link
                          href={`/${role}/notifications`}
                          onClick={() => setMobileIconMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-itutor-green transition-colors"
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                          </svg>
                          <span>Notifications</span>
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Username - Hidden on very small screens */}
              <span className="hidden md:block text-sm text-gray-300 truncate max-w-[120px]">{userName}</span>
              
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

        {/* Mobile Sliding Navigation Menu */}
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            
            {/* Slide-out Menu */}
            <div className="fixed top-0 left-0 bottom-0 w-64 bg-gray-900 shadow-2xl z-50 lg:hidden transform transition-transform duration-300 ease-in-out overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-xl font-bold text-itutor-green">Menu</h2>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 rounded-md text-gray-400 hover:text-itutor-green hover:bg-gray-800 transition-colors"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <nav className="space-y-2">
                  {getNavLinks().map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-itutor-green rounded-lg transition-colors text-base font-medium"
                    >
                      <span className="w-1.5 h-1.5 bg-itutor-green rounded-full"></span>
                      {link.label}
                    </Link>
                  ))}
                </nav>
              </div>
            </div>
          </>
        )}
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