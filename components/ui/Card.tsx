'use client';

/**
 * Card — the container every home and list screen is built from.
 *
 * `feature` is the ink card marking the single most important upcoming thing
 * on a screen. Use at most one per screen: that restraint is what makes it
 * read as important.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps {
  tone?: 'default' | 'alert' | 'feature' | 'outlined';
  /** A Tag shown first. */
  tag?: ReactNode;
  /** Uppercase label above the title. */
  eyebrow?: ReactNode;
  title?: ReactNode;
  body?: ReactNode;
  as?: 'div' | 'section' | 'article';
  className?: string;
  children?: ReactNode;
}

const TONES: Record<NonNullable<CardProps['tone']>, string> = {
  default: 'bg-surface-card border-hair border-border text-ink',
  alert: 'bg-danger-soft border-hair border-danger text-ink',
  feature: 'bg-ink border-hair border-ink text-on-ink',
  outlined: 'bg-surface-card border-bold border-ink text-ink shadow-edge-ink',
};

export function Card({
  tone = 'default',
  tag,
  eyebrow,
  title,
  body,
  as: Element = 'div',
  className,
  children,
}: CardProps) {
  const feature = tone === 'feature';

  return (
    <Element
      className={cn(
        'flex flex-col gap-[2px] p-ds-card rounded-ds-card',
        TONES[tone],
        className
      )}
    >
      {tag ? <span className="self-start">{tag}</span> : null}

      {eyebrow ? (
        <div
          className={cn(
            'font-extrabold text-[11px] leading-[13px] tracking-[0.99px] uppercase',
            feature ? 'text-brand' : 'text-brand-edge'
          )}
        >
          {eyebrow}
        </div>
      ) : null}

      {title ? (
        <div
          className={cn(
            'font-extrabold',
            feature
              ? 'font-display text-[22px] leading-6 pt-1'
              : 'text-[16px] leading-5 pt-ds-2'
          )}
        >
          {title}
        </div>
      ) : null}

      {body ? (
        <div
          className={cn(
            'text-[14px] leading-5 pb-[10px]',
            feature ? 'text-on-ink-muted' : 'text-ink'
          )}
        >
          {body}
        </div>
      ) : null}

      {children}
    </Element>
  );
}

export default Card;
