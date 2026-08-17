'use client';

/**
 * The account-creation page: brand panel, and the shared signup card.
 *
 * All of the flow — steps, validation, verification, the Google button — lives
 * in components/auth/SignupCard so that Class Match Week can present the same
 * account creation in a modal without a second implementation drifting from
 * this one.
 */

import { Suspense } from 'react';
import { Check } from 'lucide-react';
import SignupCard from '@/components/auth/SignupCard';

export default function SignupPage() {
  return (
    <main
      className="min-h-screen text-white"
      style={{ background: 'linear-gradient(135deg, #071a0e 0%, #0d2318 50%, #0a1e14 100%)' }}
    >
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:flex-row lg:items-stretch lg:p-8">

        {/* LEFT — brand panel */}
        <aside
          className="hidden flex-col justify-between rounded-3xl p-10 lg:flex lg:w-[55%]"
          style={{ backgroundColor: 'oklch(0.16 0.04 155)' }}
        >
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/logo/itutor-logo-new.png" alt="iTutor" className="h-14 w-auto object-contain" />
          </div>
          <div className="space-y-8">
            <div>
              <h1 className="font-display text-5xl font-bold leading-tight tracking-tight">
                Learn with the<br />Caribbean&rsquo;s best tutors.
              </h1>
              <p className="mt-4 max-w-md text-white/70">
                Join thousands of students mastering SEA, CSEC and CAPE with verified iTutors.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[{ n: '1k+', l: 'Students' }, { n: '200+', l: 'Verified iTutors' }, { n: '4.9★', l: 'Avg rating' }].map((s) => (
                <div key={s.l} className="rounded-2xl p-4 ring-1 ring-white/10" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                  <div className="font-display text-2xl font-bold text-itutor-green">{s.n}</div>
                  <div className="mt-1 text-xs text-white/60">{s.l}</div>
                </div>
              ))}
            </div>
            <ul className="space-y-3 text-sm text-white/80">
              {['Book 1:1s by the hour, or join recurring lessons', 'Verified subject qualifications on every iTutor', 'Cancel or reschedule with one tap'].map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(25,147,86,0.2)' }}>
                    <Check className="h-3 w-3 text-itutor-green" />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-white/40">© iTutor 2026</p>
        </aside>

        {/* RIGHT — the shared card */}
        <section className="flex-1 lg:w-[45%]">
          {/* useSearchParams inside the card needs a Suspense boundary here. */}
          <Suspense fallback={null}>
            <SignupCard variant="page" />
          </Suspense>
        </section>
      </div>
    </main>
  );
}
