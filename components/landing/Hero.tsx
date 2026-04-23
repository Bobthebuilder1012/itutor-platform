'use client';

import LandingSearchBar from '@/components/landing/LandingSearchBar';
import SuccessCTABanner from '@/components/landing/SuccessCTABanner';

const trustChips = ['Verified iTutors', 'CSEC & CAPE Focused', 'Caribbean Curriculum'];

export default function Hero() {
  return (
    <section className="relative flex flex-col bg-transparent">
      <div className="container relative z-10 mx-auto flex w-full flex-col items-center px-6 pb-10 pt-10 text-center sm:pt-12 lg:px-8 lg:pt-14 2xl:pt-20 3xl:pt-28">
        <div className="mx-auto w-full max-w-4xl 2xl:max-w-6xl 3xl:max-w-[1400px]">

          <h1
            className="mb-6 font-bold leading-tight text-[#052e1a] 2xl:mb-8"
            style={{ fontSize: 'clamp(42px,6.5vw,82px)', letterSpacing: '-0.035em' }}
          >
            Better Grades Start With
            <br />
            <span
              className="bg-gradient-to-r from-[#16a34a] via-[#22c55e] to-[#4ade80] bg-clip-text font-instrument italic text-transparent"
              style={{ letterSpacing: '-0.01em' }}
            >
              Better Support
            </span>
          </h1>

          <p className="mx-auto mb-10 max-w-[600px] text-[19px] leading-relaxed text-[#374151] 2xl:mb-12 2xl:text-xl">
            Meet the tutoring platform built for real progress — CSEC, CAPE &amp; beyond.
          </p>

          <div className="mx-auto mb-7 max-w-[880px] 2xl:mb-9">
            <LandingSearchBar />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {trustChips.map((label) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-full border border-white/70 px-[18px] py-2.5 text-sm font-medium text-[#111] backdrop-blur-[14px] 2xl:text-base"
                style={{
                  background: 'rgba(255,255,255,0.6)',
                  boxShadow: '0 2px 8px rgba(22,163,74,0.06)',
                }}
              >
                <span
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{
                    background: 'linear-gradient(135deg,#22c55e,#16a34a)',
                    boxShadow: '0 2px 4px rgba(34,197,94,0.4)',
                  }}
                >
                  ✓
                </span>
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative z-10 w-full shrink-0">
        <SuccessCTABanner />
      </div>
    </section>
  );
}
