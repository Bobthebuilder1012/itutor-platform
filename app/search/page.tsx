'use client';

// The public browse screen, reached from the landing search bar, Featured
// Tutors and the motivation band.
//
// It used to be a ~750-line second implementation of Explore: its own tutor
// query, its own filter row, its own card, in a glass-panel style nothing else
// on the platform still uses. Only one of the two ever received the filter
// work, so the signed-out visitor — the one being courted — got the worse
// catalogue. It now renders the same marketplace students and parents see,
// in its anonymous variant.

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ExploreMarketplace from '@/components/marketplace/ExploreMarketplace';

export default function SearchResultsPage() {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 border-b border-black bg-black shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex-shrink-0">
              <img src="/assets/logo/itutor-logo-dark.png" alt="iTutor" className="h-12 w-auto" />
            </Link>
            <div className="flex items-center gap-3">
              <Link
                href="/signup"
                className="px-4 py-2 text-sm font-semibold text-white hover:text-itutor-green transition-colors"
              >
                Sign Up
              </Link>
              <Link
                href="/login"
                className="px-4 py-2 text-sm font-semibold text-gray-900 bg-itutor-green hover:bg-emerald-500 rounded-lg transition-colors"
              >
                Log In
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {/* useSearchParams needs a Suspense boundary in the App Router. */}
        <Suspense fallback={null}>
          <PublicMarketplace />
        </Suspense>
      </div>
    </div>
  );
}

function PublicMarketplace() {
  const searchParams = useSearchParams();

  // The landing search bar sends ?subject=<name>&mode=subject. Seed the search
  // box with it rather than dropping what the visitor typed on the way in.
  const subject = searchParams.get('subject') ?? '';

  // Every route into this page is tutor-led — "Browse iTutors", "see all
  // tutors", the landing bar's tutor search — so it opens on the 1:1 tab.
  // The Group Lessons tab sits right beside it, exactly as in Explore.
  return <ExploreMarketplace variant="anonymous" initialQuery={subject} initialTab="tutors" />;
}
