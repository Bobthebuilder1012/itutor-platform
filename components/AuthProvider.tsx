'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

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
          // User has valid session - check which page they're on
          const publicPages = ['/login', '/signup', '/forgot-password', '/reset-password'];
          const isPublicAuthPage = publicPages.includes(pathname) || pathname.startsWith('/verify-');
          
          // If user is on home page or public auth pages, redirect to dashboard
          if (pathname === '/' || isPublicAuthPage) {
            // Get user role and redirect to appropriate dashboard
            const { data: profile } = await supabase
              .from('profiles')
              .select('role, is_reviewer')
              .eq('id', session.user.id)
              .single();

            if (profile) {
              if (profile.role === 'admin') {
                router.push('/admin/dashboard');
              } else if (profile.is_reviewer) {
                router.push('/reviewer/dashboard');
              } else if (profile.role === 'tutor') {
                router.push('/tutor/dashboard');
              } else if (profile.role === 'student') {
                router.push('/student/dashboard');
              } else if (profile.role === 'parent') {
                router.push('/parent/dashboard');
              }
            }
          }
          // Otherwise, user is already on an authenticated page, let them stay
        }
      } catch (error) {
        console.error('Error checking session:', error);
      } finally {
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

  // Show nothing while checking session (prevents flash of landing page)
  if (loading) {
    return null;
  }

  return <>{children}</>;
}
