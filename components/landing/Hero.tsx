'use client';

import Link from 'next/link';

const AVATAR_RINGS = [
  { src: 'https://i.pravatar.cc/40?u=av1', ring: '#06b6d4' },
  { src: 'https://i.pravatar.cc/40?u=av2', ring: '#f43f5e' },
  { src: 'https://i.pravatar.cc/40?u=av3', ring: '#f97316' },
  { src: 'https://i.pravatar.cc/40?u=av4', ring: '#a855f7' },
  { src: 'https://i.pravatar.cc/40?u=av5', ring: '#3b82f6' },
];

export default function Hero() {
  return (
    <section className="relative flex flex-col bg-transparent">

      {/* ── MAIN HERO ── */}
      <div className="container relative z-10 mx-auto flex w-full flex-col items-center gap-14 px-6 pb-4 pt-12 lg:flex-row lg:items-center lg:justify-between lg:gap-8 lg:px-14 lg:pt-16 xl:px-24">

        {/* ──── LEFT ──── */}
        <div className="flex flex-col items-start w-full max-w-[576px]">

          {/* Trust badge */}
          <div
            className="mb-7 flex items-center gap-2 rounded-full px-5 py-2.5"
            style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)' }}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" style={{ boxShadow: '0 0 6px rgba(34,197,94,0.9)' }} />
            <span className="text-[16px] font-semibold text-gray-700">Caribbean&apos;s No. 1 Tutoring Platform</span>
          </div>

          {/* Headline */}
          <h1 className="mb-6 font-extrabold leading-[1.08]" style={{ fontSize: 'clamp(48px,6.6vw,82px)', letterSpacing: '-0.03em' }}>
            <span className="text-[#0a0f0d] block">Unlock Your</span>
            <span className="text-[#22c55e] block">Academic Potential</span>
          </h1>

          {/* Subtitle */}
          <p className="mb-10 max-w-[480px] text-[19px] leading-relaxed text-[#374151]">
            Connect with verified Caribbean tutors for CSEC, CAPE &amp; beyond. Personalized 1-on-1 sessions that turn struggles into strengths.
          </p>

          {/* Buttons */}
          <div className="mb-10 flex flex-wrap items-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full px-9 py-4 text-[18px] font-bold text-white transition-all hover:opacity-90 hover:-translate-y-0.5"
              style={{ background: '#16a34a', boxShadow: '0 4px 20px rgba(22,163,74,0.4)' }}
            >
              Find a Tutor →
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-9 py-4 text-[18px] font-bold text-[#0a0f0d] transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              Become a Tutor
            </Link>
          </div>

          {/* Avatar row + rating */}
          <div className="flex items-center gap-5">
            <div className="flex -space-x-3">
              {AVATAR_RINGS.map((av, i) => (
                <div
                  key={i}
                  className="h-11 w-11 rounded-full p-[2px] flex-shrink-0"
                  style={{ background: av.ring, boxShadow: '0 0 0 2px white' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={av.src} alt="student" width={44} height={44} className="h-full w-full rounded-full object-cover" />
                </div>
              ))}
            </div>
            <div>
              <div className="flex items-center gap-1">
                <span className="text-amber-400 text-base tracking-tight">★★★★★</span>
                <span className="font-bold text-[18px] text-[#0a0f0d] ml-1">4.9</span>
              </div>
              <p className="text-[14px] text-gray-500">from <strong>100+</strong> student &amp; parent reviews</p>
            </div>
          </div>
        </div>

        {/* ──── RIGHT — Illustration card ──── */}
        <div className="relative w-full max-w-[624px] flex-shrink-0 lg:max-w-[600px] xl:max-w-[636px]">

          {/* Floating review card — above the main card */}
          <div
            className="absolute -top-7 left-4 z-20 w-[264px] rounded-2xl bg-white p-4 shadow-xl"
            style={{ border: '1px solid rgba(0,0,0,0.06)' }}
          >
            <div className="flex items-center gap-2.5 mb-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/mr-ramdeen.png" alt="Mr. Ramdeen" width={38} height={38} className="h-10 w-10 rounded-full object-cover flex-shrink-0" />
              <div>
                <p className="text-[14px] font-bold text-gray-900 leading-tight">Mr. Ramdeen</p>
                <p className="text-[12px] text-gray-400">Parent · Chaguanes</p>
              </div>
            </div>
            <div className="text-amber-400 text-[13px] mb-2">★★★★★</div>
            <p className="text-[13px] text-gray-600 leading-snug">
              My daughter was pulling a 3 on her mocks. Weeks after joining iTutor, she came home with a Grade I — straight A&apos;s on the profile. Worth every cent.
            </p>
          </div>

          {/* Main illustration card */}
          <div
            className="relative rounded-3xl overflow-hidden mt-10"
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.14)' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/hero-student.png"
              alt="Student tutoring session"
              className="w-full h-full object-cover"
              style={{ minHeight: 336, maxHeight: 420 }}
            />
          </div>

          {/* 150+ Verified iTutors badge */}
          <div
            className="absolute right-0 top-24 z-20 rounded-2xl bg-white px-6 py-3.5 text-center shadow-xl translate-x-4"
            style={{ border: '1px solid rgba(0,0,0,0.06)' }}
          >
            <p className="text-[30px] font-extrabold text-[#0a0f0d] leading-tight">150+</p>
            <p className="text-[13px] font-semibold text-gray-500 mt-0.5">Verified iTutors</p>
          </div>

          {/* 94% pass rate badge */}
          <div
            className="absolute right-0 bottom-16 z-20 rounded-2xl bg-white px-5 py-3 shadow-xl translate-x-4 flex items-center gap-2.5"
            style={{ border: '1px solid rgba(0,0,0,0.06)' }}
          >
            <span className="text-2xl">🏆</span>
            <div>
              <p className="text-[16px] font-extrabold text-[#0a0f0d] leading-tight">94% pass rate</p>
              <p className="text-[12px] text-gray-500">Students scoring Grade I–II</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── STATS BAR ── */}
      <div
        className="relative z-10 mx-4 mt-12 mb-1 rounded-3xl px-10 py-7 2xl:mx-10"
        style={{
          background: 'rgba(255,255,255,0.75)',
          border: '1px solid rgba(255,255,255,0.9)',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        }}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-200 text-center">
          {[
            { number: '1,000', plus: '+', label: 'Active Students',    plusColor: '#22c55e' },
            { number: '1,000', plus: '+', label: 'Sessions Delivered', plusColor: '#22c55e' },
            { number: '25',    plus: '+', label: 'Subjects Covered',   plusColor: '#22c55e' },
            { number: '4.9',   plus: '★', label: 'Average Rating',     plusColor: '#f59e0b' },
          ].map(s => (
            <div key={s.label} className="px-5 py-1.5">
              <p className="text-[34px] font-extrabold text-[#0a0f0d] leading-tight">
                {s.number}<span style={{ color: s.plusColor }}>{s.plus}</span>
              </p>
              <p className="text-[16px] text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

    </section>
  );
}
