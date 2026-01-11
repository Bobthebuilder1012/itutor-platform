'use client';

import Link from 'next/link';

export default function Header() {
  return (
    <header className="absolute top-0 left-0 right-0 z-50 bg-itutor-black">
      <nav className="w-full mx-auto px-2 sm:px-4 lg:px-6">
        <div className="flex items-center justify-between py-4 gap-2 sm:gap-4">
          {/* Logo - Left side */}
          <Link href="/" className="flex-shrink-0 ml-2 sm:ml-12 md:ml-24 lg:ml-32">
            <img
              src="/assets/logo/itutor-logo-dark.png"
              alt="iTutor"
              className="h-10 sm:h-12 md:h-14 w-auto"
            />
          </Link>

          {/* Auth Buttons - Right side */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 mr-2">
            <Link
              href="/signup"
              className="px-3 sm:px-6 py-2 sm:py-2.5 text-sm sm:text-base font-bold text-itutor-white hover:text-itutor-green transition-all duration-300 whitespace-nowrap hover:scale-105"
            >
              Sign Up
            </Link>
            <Link
              href="/login"
              className="px-3 sm:px-6 py-2 sm:py-2.5 text-sm sm:text-base font-bold text-itutor-black bg-itutor-green rounded-lg hover:bg-emerald-400 transition-all duration-300 whitespace-nowrap shadow-lg shadow-itutor-green/30 hover:shadow-xl hover:scale-105"
            >
              Log In
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}

