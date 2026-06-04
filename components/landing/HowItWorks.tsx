'use client';

import { motion } from 'framer-motion';
import { Search, CalendarDays, Sparkles, Target, Check } from 'lucide-react';

const steps = [
  {
    n: '01',
    icon: Search,
    title: 'Find Your iTutor',
    body: 'Browse verified Caribbean tutors by subject, rating, and school. Filter to find your perfect match.',
    highlight: '150+ verified tutors',
    iconBg: 'var(--lavender)',
    iconFg: 'oklch(0.5 0.18 295)',
  },
  {
    n: '02',
    icon: CalendarDays,
    title: 'Book a Session',
    body: 'Pick a time that fits your schedule. Sessions run on Google Meet or Zoom — no extra setup needed.',
    highlight: 'Flexible scheduling',
    iconBg: 'var(--coral-soft)',
    iconFg: 'var(--coral)',
  },
  {
    n: '03',
    icon: Sparkles,
    title: 'Learn & Grow',
    body: 'Get personalised 1-on-1 tutoring built around your learning style, pace, and exam goals.',
    highlight: 'CSEC & CAPE Aligned',
    iconBg: 'var(--brand-soft)',
    iconFg: 'var(--brand-deep)',
  },
  {
    n: '04',
    icon: Target,
    title: 'Ace Your Exams',
    body: 'Track progress, build confidence, and walk into your exam knowing you\'re ready.',
    highlight: '94% Grade I–II rate',
    iconBg: 'var(--peach)',
    iconFg: 'oklch(0.55 0.18 50)',
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="relative bg-mint-wash py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <h2 className="text-4xl font-bold text-ink sm:text-5xl lg:text-6xl">
            How It <span className="text-gradient-brand">Works</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-ink-muted">
            From first search to final exam — a clear path to your best grades.
          </p>
        </motion.div>

        <div className="relative mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: i * 0.12, duration: 0.55, ease: 'easeOut' }}
              className="group relative"
            >
              {i < steps.length - 1 && (
                <div
                  className="pointer-events-none absolute left-full top-16 hidden h-px w-5 lg:block"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(to right, oklch(0.74 0.19 145) 0 6px, transparent 6px 12px)',
                  }}
                />
              )}

              <div className="relative h-full rounded-3xl bg-white p-6 shadow-card ring-1 ring-ink/5 transition-all hover:-translate-y-1.5 hover:shadow-pop">
                <div className="absolute -top-3 left-6 rounded-full bg-brand px-3 py-1 text-xs font-bold text-white shadow-pop">
                  {s.n}
                </div>

                <div
                  className="mb-5 mt-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{ background: s.iconBg }}
                >
                  <s.icon className="h-7 w-7" style={{ color: s.iconFg }} />
                </div>

                <h3 className="text-xl font-bold text-ink">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{s.body}</p>

                <div className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-sm font-semibold text-brand-deep">
                  <Check className="h-4 w-4" />
                  {s.highlight}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
