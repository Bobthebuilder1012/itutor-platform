'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { Star } from 'lucide-react';

function CountUp({ to, duration = 1400 }: { to: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(eased * to));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);
  return <span ref={ref}>{n.toLocaleString()}</span>;
}

const items = [
  { value: 1000, suffix: '+', label: 'Active Students', color: 'var(--brand)' },
  { value: 1000, suffix: '+', label: 'Sessions Delivered', color: 'var(--coral)' },
  { value: 25, suffix: '+', label: 'Subjects Covered', color: 'var(--brand-deep)' },
  { value: 4.9, suffix: '★', label: 'Average Rating', color: 'var(--coral)', isFloat: true },
];

export default function Stats() {
  return (
    <section className="relative -mt-10 px-5 pb-16 sm:px-6 lg:-mt-16">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.6 }}
        className="relative mx-auto grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-3xl bg-border shadow-card lg:grid-cols-4"
      >
        {items.map((it, i) => (
          <div key={i} className="bg-white p-6 text-center sm:p-8">
            <div className="text-4xl font-bold tracking-tight sm:text-5xl" style={{ color: it.color }}>
              {it.isFloat ? (
                <>4.9<Star className="ml-1 inline h-7 w-7 fill-coral text-coral" /></>
              ) : (
                <><CountUp to={it.value} />{it.suffix}</>
              )}
            </div>
            <p className="mt-2 text-sm text-ink-muted">{it.label}</p>
          </div>
        ))}
      </motion.div>
    </section>
  );
}
