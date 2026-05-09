'use client';

import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

export default function CtaBand() {
  return (
    <section className="px-5 py-20 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] p-10 text-center shadow-pop sm:p-16"
        style={{
          background:
            'linear-gradient(120deg, oklch(0.74 0.19 145) 0%, oklch(0.6 0.18 145) 50%, oklch(0.74 0.18 40) 100%)',
        }}
      >
        <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-white/10 blur-3xl" />

        <h2 className="relative text-4xl font-bold leading-tight text-white sm:text-5xl">
          Ready to ace your next exam?
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-white/85">
          Join 1,000+ students across Trinidad &amp; Tobago turning weak spots into Grade I results.
        </p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <a
            href="/signup"
            className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-semibold text-ink shadow-card transition-transform hover:scale-[1.04] active:scale-95"
          >
            Find a Tutor
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </a>
          <a
            href="/signup?role=tutor"
            className="inline-flex items-center gap-2 rounded-full border-2 border-white/40 px-7 py-3.5 text-base font-semibold text-white transition-all hover:bg-white/10 hover:scale-[1.02] active:scale-95"
          >
            Become a Tutor
          </a>
        </div>
      </motion.div>
    </section>
  );
}
