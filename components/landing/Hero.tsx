'use client';

import LandingSearchBar from '@/components/landing/LandingSearchBar';

export default function Hero() {
  return (
    <section className="relative bg-green-50 pt-32 pb-32 sm:pt-36 md:pt-40 sm:pb-40 overflow-hidden min-h-screen flex items-center">
      {/* Decorative Elements - iTutor Brand Colors */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Top Right Circle - Teal */}
        <div className="absolute top-4 right-4 sm:top-8 sm:right-12">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-teal-200/70"></div>
        </div>
        
        {/* Bottom Left Circle - Cyan */}
        <div className="absolute bottom-4 left-4 sm:bottom-8 sm:left-12">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-cyan-200/70"></div>
        </div>
        
        {/* Top Left Circle - Emerald */}
        <div className="absolute top-16 left-2 sm:top-20 sm:left-8">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-emerald-200/65"></div>
        </div>
        
        {/* Bottom Right Circle - Light Green */}
        <div className="absolute bottom-16 right-2 sm:bottom-20 sm:right-8">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-green-200/65"></div>
        </div>
        
        {/* Top Far Left Circle - Mint */}
        <div className="absolute top-1/4 left-0 -translate-x-1/4 sm:left-2">
          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-teal-100/70"></div>
        </div>
        
        {/* Top Far Right Circle - Sky Blue */}
        <div className="absolute top-1/3 right-0 translate-x-1/4 sm:right-2">
          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-sky-200/70"></div>
        </div>
        
        {/* Additional Small Dots - All at edges */}
        {/* Top Edge Small Dot - Emerald */}
        <div className="absolute top-12 right-1/4 sm:top-16">
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-emerald-300/60"></div>
        </div>
        
        {/* Right Edge Small Dot - Cyan */}
        <div className="absolute top-2/3 right-4 sm:right-8">
          <div className="w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-cyan-300/65"></div>
        </div>
        
        {/* Bottom Edge Dot - Teal */}
        <div className="absolute bottom-8 right-1/3 sm:bottom-12">
          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-teal-300/70"></div>
        </div>
        
        {/* Left Edge Small Dot - Green */}
        <div className="absolute top-3/4 left-2 sm:left-6">
          <div className="w-4 h-4 sm:w-6 sm:h-6 rounded-full bg-green-300/60"></div>
        </div>
        
        {/* Bottom Far Right Tiny Dot */}
        <div className="absolute bottom-1/3 right-16 sm:right-24">
          <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-teal-400/60"></div>
        </div>
        
        {/* Top Far Left Tiny Dot */}
        <div className="absolute top-1/2 left-8 sm:left-16">
          <div className="w-3 h-3 sm:w-5 sm:h-5 rounded-full bg-emerald-400/60"></div>
        </div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
        <div className="max-w-4xl mx-auto text-center">
          {/* Main Heading */}
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
            Search for{' '}
            <span className="text-transparent bg-gradient-to-r from-itutor-green via-emerald-600 to-green-700 bg-clip-text text-4xl sm:text-5xl lg:text-6xl">
              Caribbean iTutors
            </span>
          </h1>
          
          <p className="text-base sm:text-lg text-gray-700 mb-10 max-w-2xl mx-auto leading-relaxed font-medium">
            Expert tutoring for CSEC & CAPE. Search by subject to find verified educators.
          </p>

          {/* Search Bar - Featured */}
          <div className="max-w-2xl mx-auto mb-16">
            <LandingSearchBar />
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-gray-700 text-sm sm:text-base font-medium">
            <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-full shadow-md border border-gray-200">
              <svg className="w-5 h-5 text-itutor-green" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Verified iTutors</span>
            </div>
            <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-full shadow-md border border-gray-200">
              <svg className="w-5 h-5 text-itutor-green" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>CSEC & CAPE Focused</span>
            </div>
            <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-full shadow-md border border-gray-200">
              <svg className="w-5 h-5 text-itutor-green" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Caribbean Curriculum</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
