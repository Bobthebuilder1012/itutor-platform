'use client';

// A TT$ amount that eases to its new value when it changes — and only then.
//
// The balance is seen on every page, so it must NOT count up on load (that is
// decoration someone sees dozens of times a day). It moves when the number
// actually changes in front of the person: a code redeemed, a reward landing,
// credits spent. That is rare, and the motion explains what happened.
//
// A critically damped spring (bounce 0): money should arrive, not wobble.
// Reduced motion → the new value appears at once. Tabular figures so the
// digits don't jitter while they roll.

import { useEffect, useRef } from 'react';
import { motion, useReducedMotion, useSpring, useTransform } from 'framer-motion';

export function formatTtd(n: number, opts: { compact?: boolean } = {}): string {
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  const digits = opts.compact && whole ? 0 : 2;
  return `TT$${n.toLocaleString('en-TT', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export default function AnimatedNumber({
  value,
  compact = false,
  className,
}: {
  value: number;
  /** Drop ".00" on whole amounts (for the top-bar counter). */
  compact?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const spring = useSpring(value, { bounce: 0, duration: 0.6 });
  const text = useTransform(spring, (v) => formatTtd(Math.round(v * 100) / 100, { compact }));
  const first = useRef(true);

  useEffect(() => {
    if (first.current || reduce) {
      // First paint, or reduced motion: no roll, just the number.
      spring.jump(value);
      first.current = false;
      return;
    }
    spring.set(value);
  }, [value, reduce, spring]);

  return (
    <motion.span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {text}
    </motion.span>
  );
}
