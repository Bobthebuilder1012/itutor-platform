'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RatingPrompt } from './ClassRatingModal';

type ClassRatingBannerProps = {
  prompt: RatingPrompt;
  onRateNow: () => void;
  onSnooze: () => void;
};

function daysUntil(isoDate: string): number {
  const diff = new Date(isoDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function ClassRatingBanner({
  prompt,
  onRateNow,
  onSnooze,
}: ClassRatingBannerProps) {
  const escalated = prompt.dismissed_count >= 3;
  const className = prompt.groups?.name ?? 'your class';
  const expiresInDays = daysUntil(prompt.expires_at);

  return (
    <div
      className={cn(
        'rounded-2xl border-l-4 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3',
        escalated
          ? 'border-coral bg-coral-soft'
          : 'border-brand bg-white',
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'size-10 rounded-xl grid place-items-center shrink-0',
          escalated ? 'bg-orange-100 text-coral' : 'bg-brand-soft text-brand-deep',
        )}
      >
        <Star className="size-5" />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink">
          Rate <span className="font-bold">{className}</span>{' '}
          <span className="text-muted-foreground">for {prompt.billing_period}</span>
        </div>
        {escalated && (
          <div className="text-xs italic text-coral mt-0.5">
            This rating expires in {expiresInDays} day{expiresInDays !== 1 ? 's' : ''}.
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 shrink-0">
        <button
          onClick={onSnooze}
          className="px-3 py-2 min-h-[44px] rounded-xl text-sm font-semibold text-muted-foreground hover:bg-muted transition"
          aria-label="Remind me later"
        >
          Remind Me Later
        </button>
        <button
          onClick={onRateNow}
          className="px-4 py-2 min-h-[44px] rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep transition"
          aria-label="Rate now"
        >
          Rate Now
        </button>
      </div>
    </div>
  );
}
