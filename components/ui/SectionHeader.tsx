'use client';

/**
 * SectionHeader — the bold title between groups of cards, with an optional
 * "See all" link on the right.
 *
 * The link is `brand-edge`, not `brand`: green text on the page background
 * needs 6.3:1, and brand green would be 3.9:1. Keep 20px above a section
 * header and 12px below.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SectionHeaderProps {
  title: ReactNode;
  action?: ReactNode;
  onAction?: () => void;
  className?: string;
}

export function SectionHeader({
  title,
  action,
  onAction,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex items-baseline justify-between', className)}>
      <h2 className="m-0 font-extrabold text-[17px] leading-[21px] text-ink">
        {title}
      </h2>
      {action ? (
        <button
          type="button"
          onClick={onAction}
          className="border-0 bg-transparent p-0 font-extrabold text-[14px] text-brand-edge cursor-pointer"
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}

export default SectionHeader;
