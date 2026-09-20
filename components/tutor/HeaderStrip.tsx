'use client';

/**
 * The strip under the tutor top bar.
 *
 * Scoped to exactly one slot, deliberately. A general-purpose <Banner> would
 * need about eight props to reconcile the four banner-shaped things in this
 * codebase — the campaign card, the amber join-requests block, the page-local
 * one on class detail — and every call site would still pass bespoke children.
 * That is a worse abstraction than honest copies. This is narrower and earns
 * its keep differently: the slot has two occupants that must look identical,
 * and they are rendered from different files.
 *
 * MOBILE IS A SINGLE ROW. The banner it replaces used `flex-col sm:flex-row`,
 * which is what made it three lines tall on a phone — and this strip is sticky,
 * so those lines are gone from every screen for as long as it shows. Below `sm`
 * the whole strip collapses to one tappable line and the CTA becomes the strip
 * itself.
 */

import Link from 'next/link';
import { ChevronDown, ChevronUp, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type HeaderStripTone = 'brand' | 'success' | 'amber';

const TONE_BG: Record<HeaderStripTone, string> = {
  brand: 'bg-gradient-to-r from-[oklch(0.97_0.05_150)] to-[oklch(0.96_0.04_165)]',
  success: 'bg-gradient-to-r from-[oklch(0.96_0.06_150)] to-[oklch(0.95_0.05_155)]',
  amber: 'bg-gradient-to-r from-[oklch(0.97_0.04_85)] to-[oklch(0.96_0.04_75)]',
};

const TONE_TILE: Record<HeaderStripTone, string> = {
  brand: 'bg-brand text-white',
  success: 'bg-green-600 text-white',
  amber: 'bg-amber-500 text-white',
};

export default function HeaderStrip({
  icon: Icon,
  tone = 'brand',
  title,
  children,
  cta,
  trailing,
  collapsed = false,
  onToggleCollapse,
  onDismiss,
  collapsedSummary,
  href,
}: {
  icon: LucideIcon;
  tone?: HeaderStripTone;
  title: React.ReactNode;
  /** The progress row, or any second line. Hidden when collapsed. */
  children?: React.ReactNode;
  cta?: React.ReactNode;
  /** Right-aligned chip — the days-left counter. */
  trailing?: React.ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onDismiss?: () => void;
  /** One line shown in place of everything when collapsed. */
  collapsedSummary?: React.ReactNode;
  /** Makes the whole strip tappable on mobile, where the CTA is hidden. */
  href?: string;
}) {
  const body = (
    <>
      <div className={cn('size-9 rounded-xl grid place-items-center shrink-0', TONE_TILE[tone])}>
        <Icon className="size-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink truncate">
          {collapsed && collapsedSummary ? collapsedSummary : title}
        </div>
        {!collapsed && children && <div className="mt-1 hidden sm:block">{children}</div>}
      </div>

      {trailing && <div className="hidden sm:block shrink-0">{trailing}</div>}
      {cta && !collapsed && <div className="hidden sm:block shrink-0">{cta}</div>}
    </>
  );

  return (
    <div className={cn('border-b border-border', TONE_BG[tone])}>
      <div className="px-4 lg:px-8 py-2.5 sm:py-3 flex items-center gap-3">
        {href ? (
          // The tap target on a phone is the strip, because the button is not
          // rendered at that width.
          <Link href={href} className="flex items-center gap-3 flex-1 min-w-0 sm:cursor-default">
            {body}
          </Link>
        ) : (
          body
        )}

        <div className="flex items-center gap-1 shrink-0">
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expand launch goal' : 'Collapse launch goal'}
              className="size-8 grid place-items-center rounded-lg text-ink/50 hover:bg-white/60 hover:text-ink"
            >
              {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="size-8 grid place-items-center rounded-lg text-ink/50 hover:bg-white/60 hover:text-ink"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
