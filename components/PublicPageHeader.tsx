'use client';

import Link from 'next/link';

export default function PublicPageHeader() {
  return (
    <header className="bg-itutor-black border-b border-gray-800 sticky top-0 z-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-block">
            <img
              src="/assets/logo/itutor-logo-dark.png"
              alt="iTutor"
              className="h-12 w-auto"
            />
          </Link>

          {/* Auth Buttons */}
          <div className="flex items-center gap-3">
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
          </div>
        </div>
      </div>
    </header>
  );
}

