'use client';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';
import { ReactNode } from 'react';
import { useProfile } from '@/lib/hooks/useProfile';
import { useSuspensionCheck } from '@/lib/hooks/useSuspensionCheck';
import NotificationBell from '@/components/NotificationBell';
import MessagesIcon from '@/components/MessagesIcon';
import CalendarIcon from '@/components/CalendarIcon';
import Footer from '@/components/landing/Footer';

interface DashboardLayoutProps {
  children: ReactNode;
  role: 'student' | 'tutor' | 'parent' | 'reviewer';
  userName: string;
}

export default function DashboardLayout({ children, role, userName }: DashboardLayoutProps) {
  const router = useRouter();
  const { profile } = useProfile();
  const { isSuspended, loading: suspensionLoading } = useSuspensionCheck();

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
        <div className="max-w-7xl mx-auto pl-4 sm:pl-6 lg:pl-8">
          <div className="flex justify-between h-16 pr-4 sm:pr-6 lg:pr-2">
            <div className="flex">
              <Link href={getDashboardLink()} className="flex-shrink-0 flex items-center group">
                <img
                  src="/assets/logo/itutor-logo-dark.png"
                  alt="iTutor"
                  className="h-10 sm:h-12 w-auto group-hover:scale-105 transition-transform duration-300"
                />
              </Link>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
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
            <div className="flex items-center space-x-4 ml-auto">
              {/* Calendar Icon - hide for reviewers */}
              {profile?.id && role !== 'reviewer' && <CalendarIcon userId={profile.id} role={role} />}
              
              {/* Messages Icon - hide for reviewers */}
              {profile?.id && role !== 'reviewer' && <MessagesIcon userId={profile.id} role={role} />}
              
              {/* Notification Bell */}
              {profile?.id && <NotificationBell userId={profile.id} />}
              
              <span className="text-sm text-gray-300">{userName}</span>
              <button
                onClick={handleLogout}
                className="bg-gradient-to-r from-gray-800 to-gray-700 hover:from-gray-700 hover:to-gray-600 text-itutor-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border border-gray-600 hover:border-itutor-green"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>
      
      <main className="flex-1 max-w-7xl mx-auto w-full py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl shadow-xl p-6">
          {children}
        </div>
      </main>

      <Footer role={role} />
    </div>
  );
}