'use client';

/**
 * SubjectTile — a square tile showing a subject's two-letter code, giving
 * every class a recognisable colour without photos.
 *
 * Assign a colour per subject once and keep it everywhere the subject appears,
 * in the parent and student apps alike. Codes are always ink, in the display
 * face at 15px, on all four fills.
 *
 * Decorative: the subject name is always in the row text beside it, so the
 * tile is hidden from assistive technology rather than read out as "MA".
 */

import { cn } from '@/lib/utils';

export type SubjectColor = 'green' | 'yellow' | 'orange' | 'sage';

export interface SubjectTileProps {
  /** Two-letter subject code, e.g. "MA". */
  code: string;
  color?: SubjectColor;
  /** Pixel size of the square. Default 52. */
  size?: number;
  className?: string;
}

const COLORS: Record<SubjectColor, string> = {
  green: 'bg-brand',
  yellow: 'bg-accent-yellow',
  orange: 'bg-accent-orange',
  sage: 'bg-on-ink-muted',
};

export function SubjectTile({
  code,
  color = 'green',
  size = 52,
  className,
}: SubjectTileProps) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        'inline-flex flex-none items-center justify-center rounded-ds-sm',
        'font-display font-extrabold text-[15px] leading-none text-ink',
        COLORS[color],
        className
      )}
    >
      {code}
    </span>
  );
}

export default SubjectTile;
