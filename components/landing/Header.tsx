'use client';

import Link from 'next/link';
import LandingSearchBar from '@/components/landing/LandingSearchBar';

export default function Header() {
  return (
    <header className="absolute top-0 left-0 right-0 z-50 bg-itutor-black">
      <nav className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-2 gap-2 sm:gap-4">
          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <img
              src="/assets/logo/itutor-logo-dark.png"
              alt="iTutor"
              className="h-8 sm:h-10 md:h-12 w-auto"
            />
          </Link>

          {/* Search Bar */}
          <div className="hidden md:flex flex-1 max-w-2xl">
            <LandingSearchBar />
          </div>

          {/* Auth Buttons */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <Link
              href="/signup"
              className="px-3 sm:px-4 py-2 text-sm sm:text-base font-semibold text-itutor-white hover:text-itutor-green transition-colors whitespace-nowrap"
            >
              Sign Up
            </Link>
            <Link
              href="/login"
              className="px-3 sm:px-4 py-2 text-sm sm:text-base font-semibold text-itutor-white border-2 border-itutor-white/20 rounded-lg hover:border-itutor-green hover:text-itutor-green transition-colors whitespace-nowrap"
            >
              Log In
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}

