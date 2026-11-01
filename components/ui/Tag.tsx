'use client';

/**
 * Tag — a small uppercase label flagging state or context at the top of a card.
 *
 * Written in sentence case in code and uppercased by CSS, so the label reads
 * normally in the source. Keep it to two or three words, one tag per card.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TagProps {
  tone?: 'outline' | 'danger' | 'warning' | 'orange' | 'brand' | 'dark';
  className?: string;
  children: ReactNode;
}

const TONES: Record<NonNullable<TagProps['tone']>, string> = {
  outline: 'bg-surface-card border-ink text-ink',
  danger: 'bg-danger text-on-ink',
  warning: 'bg-accent-yellow text-ink',
  orange: 'bg-accent-orange text-ink',
  brand: 'bg-brand text-ink',
  dark: 'bg-ink text-brand',
};

export function Tag({ tone = 'outline', className, children }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center py-[3px] px-ds-2',
        'rounded-ds-xs border-hair border-transparent',
        'font-body font-extrabold text-[11px] leading-[13px] tracking-[0.55px] uppercase',
        'whitespace-nowrap',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export default Tag;
