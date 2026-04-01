'use client';

import LandingSearchBar from '@/components/landing/LandingSearchBar';
import SuccessCTABanner from '@/components/landing/SuccessCTABanner';

export default function Hero() {
  return (
    <section className="relative flex min-h-[calc(100dvh-80px)] flex-col overflow-hidden bg-transparent">
      <div className="container relative z-10 mx-auto flex w-full flex-1 flex-col items-center justify-center px-4 pt-24 pb-4 sm:px-6 sm:pt-28 sm:pb-6 lg:px-8 lg:pt-32 2xl:pb-10 2xl:pt-40 3xl:pb-14 3xl:pt-48">
        <div className="mx-auto w-full max-w-4xl text-center 2xl:max-w-6xl 3xl:max-w-[1400px]">
          {/* Main Heading */}
          <div className="mb-3 2xl:mb-5 3xl:mb-7">
            <h1 className="text-[1.75rem] font-bold leading-tight text-gray-900 sm:whitespace-nowrap sm:text-[2.25rem] lg:text-[3rem] 2xl:text-[4.5rem] 3xl:text-[6rem]">
              Better Grades Start With{' '}
              <span className="text-itutor-green">Better Support</span>
            </h1>
          </div>

          <p className="mx-auto mb-6 max-w-2xl text-base font-medium leading-relaxed text-gray-600 sm:text-lg 2xl:mb-8 2xl:max-w-3xl 2xl:text-2xl 3xl:mb-10 3xl:max-w-4xl 3xl:text-3xl">
            Meet the tutoring platform built for real progress.
          </p>

          {/* Search Bar */}
          <div className="mx-auto mb-5 max-w-3xl 2xl:mb-7 2xl:max-w-5xl 3xl:mb-9 3xl:max-w-7xl">
            <LandingSearchBar />
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 md:gap-4 2xl:gap-5 3xl:gap-7 text-gray-700 text-xs sm:text-sm 2xl:text-base 3xl:text-lg font-medium">
            <div className="flex shrink-0 items-center gap-1.5 2xl:gap-2 bg-white/70 px-3 py-1.5 2xl:px-5 2xl:py-2.5 3xl:px-6 3xl:py-3 rounded-full shadow-sm border border-gray-200">
              <svg className="h-3.5 w-3.5 shrink-0 text-itutor-green sm:h-4 sm:w-4 2xl:h-5 2xl:w-5 3xl:h-6 3xl:w-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Verified iTutors</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 2xl:gap-2 bg-white/70 px-3 py-1.5 2xl:px-5 2xl:py-2.5 3xl:px-6 3xl:py-3 rounded-full shadow-sm border border-gray-200">
              <svg className="h-3.5 w-3.5 shrink-0 text-itutor-green sm:h-4 sm:w-4 2xl:h-5 2xl:w-5 3xl:h-6 3xl:w-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>CSEC & CAPE Focused</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 2xl:gap-2 bg-white/70 px-3 py-1.5 2xl:px-5 2xl:py-2.5 3xl:px-6 3xl:py-3 rounded-full shadow-sm border border-gray-200">
              <svg className="h-3.5 w-3.5 shrink-0 text-itutor-green sm:h-4 sm:w-4 2xl:h-5 2xl:w-5 3xl:h-6 3xl:w-6" fill="currentColor" viewBox="0 0 20 20">
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
