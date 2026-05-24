'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ClassRatingModal, type RatingPrompt } from './ClassRatingModal';
import { useRatingPrompts } from '@/lib/hooks/useRatingPrompts';

function daysUntil(isoDate: string): number {
  const diff = new Date(isoDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function RatingCenterDropdown() {
  const { prompts, refetch } = useRatingPrompts();
  const [open, setOpen] = useState(false);
  const [activePrompt, setActivePrompt] = useState<RatingPrompt | null>(null);

  if (prompts.length === 0) return null;

  const count = prompts.length;

  return (
    <div className="relative">
      {/* Desktop pill */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="hidden sm:inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-brand-soft text-brand-deep text-xs font-bold hover:bg-brand-soft/70 transition"
        title="Pending ratings"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Star className="size-3.5 fill-brand-deep" />
        ({count}) pending
      </button>

      {/* Mobile icon with badge */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="sm:hidden relative size-9 grid place-items-center rounded-full hover:bg-gray-800 text-gray-400 transition"
        title="Pending ratings"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Star className="size-4" />
        <span className="absolute -top-0.5 -right-0.5 size-4 grid place-items-center rounded-full bg-brand text-white text-[9px] font-bold">
          {count}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-white border border-border shadow-pop p-2 z-40">
            <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Pending ratings
            </div>
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {prompts.slice(0, 10).map((p) => {
                const days = daysUntil(p.expires_at);
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-muted transition"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-ink truncate">
                        {p.groups?.name ?? 'Class'}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <span>{p.billing_period}</span>
                        <span>·</span>
                        <span
                          className={cn(
                            days <= 3 ? 'text-red-500 font-semibold' : 'text-muted-foreground',
                          )}
                        >
                          Expires in {days} day{days !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setActivePrompt(p);
                        setOpen(false);
                      }}
                      className="px-3 py-1.5 min-h-[44px] rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand-deep transition"
                    >
                      Rate
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Rating modal */}
      {activePrompt && (
        <ClassRatingModal
          prompt={activePrompt}
          onClose={() => setActivePrompt(null)}
          onSuccess={async () => {
            setActivePrompt(null);
            await refetch();
          }}
        />
      )}
    </div>
  );
}
