'use client';

import LandingSearchBar from '@/components/landing/LandingSearchBar';
import SuccessCTABanner from '@/components/landing/SuccessCTABanner';

export default function Hero() {
  return (
    <section className="relative flex min-h-[calc(100dvh-80px)] flex-col overflow-hidden bg-transparent">
      <div className="container relative z-10 mx-auto flex w-full flex-1 flex-col items-center justify-end px-4 pb-4 sm:px-6 sm:pb-6 lg:px-8">
        <div className="mx-auto w-full max-w-4xl text-center">
          {/* Main Heading */}
          <div className="-mx-4 mb-3 flex justify-center overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
            <h1 className="whitespace-nowrap text-[1.75rem] font-bold leading-tight text-gray-900 sm:text-[2.25rem] lg:text-[3rem]">
              Better Grades Start With{' '}
              <span className="text-itutor-green">Better Support</span>
            </h1>
          </div>

          <p className="mx-auto mb-6 max-w-2xl text-base font-medium leading-relaxed text-gray-600 sm:text-lg">
            Meet the tutoring platform built for real progress.
          </p>

          {/* Search Bar */}
          <div className="mx-auto mb-5 max-w-3xl">
            <LandingSearchBar />
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-nowrap items-center justify-center gap-2 sm:gap-3 md:gap-4 text-gray-700 text-xs sm:text-sm font-medium">
            <div className="flex shrink-0 items-center gap-1.5 bg-white/70 px-3 py-1.5 rounded-full shadow-sm border border-gray-200">
              <svg className="h-3.5 w-3.5 shrink-0 text-itutor-green sm:h-4 sm:w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Verified iTutors</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 bg-white/70 px-3 py-1.5 rounded-full shadow-sm border border-gray-200">
              <svg className="h-3.5 w-3.5 shrink-0 text-itutor-green sm:h-4 sm:w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>CSEC & CAPE Focused</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 bg-white/70 px-3 py-1.5 rounded-full shadow-sm border border-gray-200">
              <svg className="h-3.5 w-3.5 shrink-0 text-itutor-green sm:h-4 sm:w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Caribbean Curriculum</span>
            </div>
          </div>
        </div>
      </div>
      <div className="relative z-10 w-full shrink-0">
        <SuccessCTABanner />
      </div>
    </section>
  );
}
