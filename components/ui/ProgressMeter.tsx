/**
 * The one progress bar.
 *
 * There were three copies of this markup before this file — the listing banner
 * in TutorShell, the sticky card on /tutor/get-listed, and whatever the next
 * feature was about to add. They had drifted in height and in track colour
 * already, and none of them was announced to a screen reader: a bar with no
 * role is decoration, and the count beside it was the only thing a non-sighted
 * teacher could read.
 *
 * Two bugs the copies shared, fixed here once. `total` of 0 produced `NaN%` and
 * a bar that rendered at whatever width the browser guessed; and a `value`
 * above `total` overflowed its track. Both are clamped.
 */

import { cn } from '@/lib/utils';

export type ProgressMeterTone = 'brand' | 'success' | 'amber' | 'neutral';
export type ProgressMeterSize = 'xs' | 'sm' | 'md';

const TONE_FILL: Record<ProgressMeterTone, string> = {
  brand: 'bg-brand',
  success: 'bg-green-600',
  amber: 'bg-amber-500',
  neutral: 'bg-ink',
};

const SIZE_TRACK: Record<ProgressMeterSize, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
};

export default function ProgressMeter({
  value,
  total,
  label,
  srLabel,
  tone = 'brand',
  size = 'sm',
  trackClassName,
  className,
}: {
  value: number;
  total: number;
  /** Rendered beside the bar. Given tabular-nums so it cannot jitter. */
  label?: React.ReactNode;
  /** Required when there is no visible label, so the bar is not silent. */
  srLabel?: string;
  tone?: ProgressMeterTone;
  size?: ProgressMeterSize;
  trackClassName?: string;
  className?: string;
}) {
  const safeTotal = total > 0 ? total : 0;
  const safeValue = Math.max(0, Math.min(value, safeTotal));
  const pct = safeTotal === 0 ? 0 : Math.round((safeValue / safeTotal) * 100);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="progressbar"
        aria-valuenow={safeValue}
        aria-valuemin={0}
        aria-valuemax={safeTotal}
        aria-label={srLabel ?? (typeof label === 'string' ? label : undefined)}
        className={cn(
          'flex-1 rounded-full overflow-hidden bg-muted',
          SIZE_TRACK[size],
          trackClassName
        )}
      >
        <div
          className={cn('h-full transition-all', TONE_FILL[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {label != null && (
        <span className="text-xs text-muted-foreground font-medium tabular-nums shrink-0">
          {label}
        </span>
      )}
    </div>
  );
}
