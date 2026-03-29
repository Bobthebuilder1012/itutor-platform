'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  getAdminHomePath,
  isEmailManagementOnlyAdmin,
} from '@/lib/auth/adminAccess';

/**
 * Auth provider that checks for existing session on mount
 * and handles auto-login from localStorage/sessionStorage
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check for existing session on mount
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          const effectiveEmail = session.user.email || profile?.email || null;

          if (isEmailManagementOnlyAdmin(effectiveEmail) && pathname !== '/admin/emails') {
            router.replace('/admin/emails');
            return;
          }

          // User has valid session - check which page they're on
          const publicPages = ['/login', '/signup', '/forgot-password', '/reset-password'];
          const isPublicAuthPage = publicPages.includes(pathname) || pathname.startsWith('/verify-');
          const isResetPasswordPage = pathname === '/reset-password';
          
          // Keep users on reset-password so they can complete recovery flow.
          // Supabase sets a temporary session for recovery links, which should not trigger a dashboard redirect.
          if (isResetPasswordPage) {
            setLoading(false);
            return;
          }

          // If user is on home page or other public auth pages, redirect to dashboard
          if (pathname === '/' || isPublicAuthPage) {
            if (profile) {
              // Keep loading state active during redirect to prevent flash
              if (isEmailManagementOnlyAdmin(effectiveEmail)) {
                router.replace('/admin/emails');
                return;
              } else if (profile.role === 'admin') {
                router.replace(getAdminHomePath(effectiveEmail));
                return; // Don't set loading to false - let the redirect happen
              } else if (profile.is_reviewer) {
                router.replace('/reviewer/dashboard');
                return;
              } else if (profile.role === 'tutor') {
                router.replace('/tutor/dashboard');
                return;
              } else if (profile.role === 'student') {
                router.replace('/student/dashboard');
                return;
              } else if (profile.role === 'parent') {
                router.replace('/parent/dashboard');
                return;
              }
            }
          }
          // Otherwise, user is already on an authenticated page, let them stay
        }
        
        // Only set loading to false if we didn't redirect
        setLoading(false);
      } catch (error) {
        console.error('Error checking session:', error);
        setLoading(false);
      }
    };

    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setLoading(false);
      } else if (event === 'SIGNED_IN' && session) {
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  // Show loading spinner while checking session (prevents flash of landing page)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
