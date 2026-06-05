'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Star, BadgeCheck, Trophy } from 'lucide-react';
import Image from 'next/image';
import { Avatar } from './Avatar';

const headlineWords = ['Unlock', 'Your', 'Academic', 'Potential'];

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-mint-wash pb-20 pt-32 sm:pt-36 lg:pb-32">
      {/* Animated blobs */}
      <div className="pointer-events-none absolute -left-32 top-24 h-80 w-80 rounded-full bg-brand/20 blur-3xl animate-blob" />
      <div className="pointer-events-none absolute right-0 top-1/3 h-96 w-96 rounded-full bg-coral/15 blur-3xl animate-blob [animation-delay:-6s]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-brand-soft blur-3xl" />

      <div className="relative mx-auto grid max-w-6xl gap-12 px-5 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16">
        {/* LEFT */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-white/70 px-4 py-1.5 text-sm font-medium text-forest backdrop-blur"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
            </span>
            Caribbean&apos;s No. 1 Tutoring Platform
          </motion.div>

          <h1 className="mt-6 text-5xl font-bold leading-[1.02] tracking-tight text-ink sm:text-6xl lg:text-7xl">
            {headlineWords.slice(0, 2).map((w, i) => (
              <motion.span
                key={w}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.08, duration: 0.6, ease: 'easeOut' }}
                className="mr-3 inline-block"
              >
                {w}
              </motion.span>
            ))}
            <br />
            <span className="relative inline-block">
              {headlineWords.slice(2).map((w, i) => (
                <motion.span
                  key={w}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.08, duration: 0.6, ease: 'easeOut' }}
                  className="mr-3 inline-block text-gradient-brand"
                >
                  {w}
                </motion.span>
              ))}
              <motion.svg
                viewBox="0 0 300 14"
                className="absolute -bottom-2 left-0 h-3 w-full"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.9, duration: 0.9, ease: 'easeOut' }}
                aria-hidden
              >
                <motion.path
                  d="M2 9 C 80 2, 160 14, 298 5"
                  fill="none"
                  stroke="oklch(0.74 0.19 145)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 0.9, duration: 0.9 }}
                />
              </motion.svg>
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-7 max-w-lg text-lg text-ink-muted"
          >
            Connect with verified Caribbean tutors for CSEC, CAPE &amp; beyond.
            Personalised 1-on-1 sessions that turn struggles into strengths.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <a
              href="/signup"
              className="group inline-flex items-center gap-2 rounded-full bg-brand px-7 py-3.5 text-base font-semibold text-white shadow-pop transition-transform hover:scale-[1.04] active:scale-95"
            >
              Find a Tutor
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href="/signup?role=tutor"
              className="inline-flex items-center gap-2 rounded-full border-2 border-ink/10 bg-white px-7 py-3.5 text-base font-semibold text-ink shadow-card transition-all hover:border-ink/30 hover:scale-[1.02] active:scale-95"
            >
              Become a Tutor
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-9 flex items-center gap-4"
          >
            <div className="flex -space-x-3">
              {[12, 280, 200, 330, 60].map((h, i) => (
                <Avatar key={i} name={`U${i}`} hue={h} size={42} />
              ))}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-coral text-coral" />
                  ))}
                </div>
                <span className="font-semibold text-ink">4.9</span>
              </div>
              <p className="text-sm text-ink-muted">
                from <span className="font-semibold text-ink">100+</span> student &amp; parent reviews
              </p>
            </div>
          </motion.div>
        </div>

        {/* RIGHT — image with floating cards */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="relative mx-auto w-full max-w-md lg:max-w-none"
        >
          <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-brand/30 via-coral/20 to-brand/0 blur-2xl" />
          <div className="relative overflow-hidden rounded-[2rem] shadow-pop ring-1 ring-ink/5">
            <Image
              src="/assets/hero-student.png"
              alt="Caribbean tutor working with a student on a laptop"
              width={1280}
              height={1280}
              className="h-auto w-full object-cover"
              priority
            />
          </div>

          {/* Floating review card */}
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -left-3 top-10 max-w-[260px] rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink/5 sm:-left-8"
          >
            <div className="flex items-center gap-3">
              <Avatar name="Mr Ramdeen" hue={30} size={36} />
              <div>
                <p className="text-sm font-semibold text-ink">Mr. Ramdeen</p>
                <p className="text-xs text-ink-muted">Parent · Chaguanas</p>
              </div>
            </div>
            <div className="mt-2 flex">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-3 w-3 fill-coral text-coral" />
              ))}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-ink/80">
              My daughter pulled a 3 on her mocks. Weeks after joining iTutor, she came home with a Grade I — straight A&apos;s.
            </p>
          </motion.div>

          {/* Verified card */}
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -right-2 top-1/3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink/5 sm:-right-6"
          >
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-brand" />
              <div>
                <p className="text-2xl font-bold text-ink leading-none">150+</p>
                <p className="text-xs text-ink-muted">Verified iTutors</p>
              </div>
            </div>
          </motion.div>

          {/* Pass rate card */}
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            className="absolute -bottom-4 right-4 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink/5 sm:-bottom-6 sm:right-10"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-coral-soft">
                <Trophy className="h-5 w-5 text-coral" />
              </div>
              <div>
                <p className="text-sm font-bold text-ink">94% pass rate</p>
                <p className="text-xs text-ink-muted">Students scoring Grade I–II</p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
