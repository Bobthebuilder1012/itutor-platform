'use client';

import Link from 'next/link';

interface PublicPageHeaderProps {
  profile?: {
    role: string;
  } | null;
  loading?: boolean;
}

export default function PublicPageHeader({ profile = null, loading = false }: PublicPageHeaderProps) {
  const getDashboardUrl = () => {
    if (!profile) return '/';
    switch (profile.role) {
      case 'tutor':
        return '/tutor/dashboard';
      case 'student':
        return '/student/dashboard';
      case 'parent':
        return '/parent/dashboard';
      case 'reviewer':
        return '/reviewer/dashboard';
      default:
        return '/';
    }
  };

  return (
    <header className="bg-itutor-black border-b border-gray-800 sticky top-0 z-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-block ml-12 md:ml-24 lg:ml-32">
            <img
              src="/assets/logo/itutor-logo-dark.png"
              alt="iTutor"
              className="h-12 sm:h-13 md:h-14 w-auto"
            />
          </Link>

          {/* Auth Buttons */}
          <div className="flex items-center gap-3">
            {loading ? (
              <div className="px-4 py-2 text-sm text-itutor-muted">Loading...</div>
            ) : profile ? (
              <Link
                href={getDashboardUrl()}
                className="px-4 py-2 text-sm sm:text-base font-semibold text-itutor-white border-2 border-itutor-green rounded-lg hover:bg-itutor-green hover:text-itutor-black transition-colors whitespace-nowrap"
              >
                ← Back to Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/signup"
                  className="px-4 py-2 text-sm sm:text-base font-semibold text-itutor-white hover:text-itutor-green transition-colors whitespace-nowrap"
                >
                  Sign Up
                </Link>
                <Link
                  href="/login"
                  className="px-4 py-2 text-sm sm:text-base font-semibold text-itutor-white border-2 border-itutor-white/20 rounded-lg hover:border-itutor-green hover:text-itutor-green transition-colors whitespace-nowrap"
                >
                  Log In
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

