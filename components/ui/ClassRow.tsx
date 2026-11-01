'use client';

/**
 * ClassRow — one class in a list: subject tile, title, tutor and schedule, and
 * the monthly price on the right.
 *
 * Renders as a <button> when `onClick` is given and a <div> otherwise, so a
 * row that does nothing is not announced as a control. Use `flat` to drop the
 * card chrome when the row sits inside a Card with other content.
 *
 * Prices are formatted by the caller as `TT$180`; `unit` defaults to `/month`.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SubjectTile, type SubjectColor } from './SubjectTile';

export interface ClassRowProps {
  code: string;
  color?: SubjectColor;
  title: ReactNode;
  /** Tutor · days · time. */
  meta?: ReactNode;
  /** e.g. "TT$180". */
  price?: string;
  /** Default "/month". */
  unit?: string;
  /** Drop the card chrome when nested in a Card. */
  flat?: boolean;
  onClick?: () => void;
  className?: string;
}

export function ClassRow({
  code,
  color,
  title,
  meta,
  price,
  unit = '/month',
  flat,
  onClick,
  className,
}: ClassRowProps) {
  const classes = cn(
    'flex w-full items-center gap-ds-3 text-left font-body text-ink',
    flat
      ? 'p-0 border-0 bg-transparent'
      : 'p-ds-card rounded-ds-card border-hair border-border bg-surface-card',
    onClick &&
      'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
    className
  );

  const content = (
    <>
      <SubjectTile code={code} color={color} />

      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="font-extrabold text-[15px] leading-[18px]">{title}</span>
        {meta ? (
          <span className="text-[13px] leading-[18px] text-ink-muted">{meta}</span>
        ) : null}
      </span>

      {price ? (
        <span className="flex-none pl-[6px] text-right">
          <span className="block font-extrabold text-[15px] leading-[18px]">{price}</span>
          <span className="block text-[12px] leading-4 text-ink-muted">{unit}</span>
        </span>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  }

  return <div className={classes}>{content}</div>;
}

export default ClassRow;
