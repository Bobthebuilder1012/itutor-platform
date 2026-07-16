'use client';

import { Users, Video, Calendar, Check } from 'lucide-react';

export type PublicClass = {
  id: string;
  name: string;
  subject: string;
  description: string | null;
  scheduleLabel: string;       // pre-formatted, e.g. "Mon & Wed · 5:00 PM"
  kind: 'group' | '1:1';
  priceLabel: string;          // pre-formatted, e.g. "TT$120/session" or "Free"
  spaces?: { taken: number; total: number };
  level: string;
  accent?: 'mint' | 'peach' | 'lavender' | 'sky' | 'coral';
};

const ACCENT: Record<NonNullable<PublicClass['accent']>, string> = {
  mint: 'bg-mint text-brand-deep',
  peach: 'bg-peach text-[oklch(0.38_0.08_65)]',
  lavender: 'bg-lavender text-[oklch(0.38_0.08_295)]',
  sky: 'bg-sky text-[oklch(0.38_0.08_230)]',
  coral: 'bg-coral-soft text-[oklch(0.42_0.14_40)]',
};

// Both "Join"/"Join waitlist" and "View" open the canonical class page
// (/student/explore/[groupId]), which itself resolves the correct CTA
// (join / request / waitlist / open) and handles paid vs free enrollment.
// In `readOnly` mode (a tutor previewing their own public profile) the footer
// shows a passive "Student view" label instead of the live action buttons.
export default function PublicClassCard({
  c,
  onOpen,
  readOnly = false,
}: {
  c: PublicClass;
  onOpen: (classId: string) => void;
  readOnly?: boolean;
}) {
  const full = c.spaces ? c.spaces.taken >= c.spaces.total : false;
  const pct = c.spaces && c.spaces.total > 0 ? Math.min(100, (c.spaces.taken / c.spaces.total) * 100) : 0;
  const accent = ACCENT[c.accent ?? 'mint'];
  const [priceMain, pricePeriod] = c.priceLabel.split('/');

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-white transition hover:border-brand hover:shadow-[0_8px_24px_-12px_oklch(0.62_0.16_150/0.35)]">
      <div className="flex items-start justify-between gap-2 p-4 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${accent}`}>
              {c.kind === 'group' ? <Users className="size-2.5" /> : <Video className="size-2.5" />}
              {c.kind === 'group' ? 'Group' : '1:1'}
            </span>
            <span className="text-[10px] font-medium text-ink-muted">{c.level}</span>
          </div>
          <h3 className="mt-1.5 truncate text-sm font-bold text-ink">{c.name}</h3>
          <p className="truncate text-[11px] text-ink-muted">{c.subject}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-bold text-ink">{priceMain}</div>
          {pricePeriod && <div className="text-[10px] text-ink-muted">/{pricePeriod}</div>}
        </div>
      </div>

      {c.description && (
        <p className="px-4 text-[11px] leading-relaxed text-ink-muted line-clamp-2">{c.description}</p>
      )}

      <div className="mt-3 flex items-center gap-2 px-4 text-[11px]">
        <Calendar className="size-3 text-brand-deep" />
        <span className="font-medium text-ink">{c.scheduleLabel}</span>
      </div>

      {c.spaces && (
        <div className="mt-2 px-4">
          <div className="flex items-center justify-between text-[10px] text-ink-muted">
            <span>{full ? 'Class full · join waitlist' : `${c.spaces.total - c.spaces.taken} spaces left`}</span>
            <span>{c.spaces.taken}/{c.spaces.total}</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${full ? 'bg-coral' : 'bg-brand'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-border p-3">
        {readOnly ? (
          <span className="inline-flex flex-1 items-center justify-center gap-1 rounded-2xl bg-muted px-3 py-2 text-xs font-semibold text-ink-muted">
            Student view
          </span>
        ) : (
          <>
            <button
              onClick={() => onOpen(c.id)}
              className={`inline-flex flex-1 items-center justify-center gap-1 rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                full ? 'bg-muted text-ink hover:bg-mint' : 'bg-brand text-white hover:bg-brand-deep'
              }`}
            >
              {full ? 'Join waitlist' : (<><Check className="size-3.5" /> Join class</>)}
            </button>
            <button
              onClick={() => onOpen(c.id)}
              className="inline-flex items-center gap-0.5 rounded-2xl border border-border px-3 py-2 text-xs font-semibold text-ink hover:bg-mint"
            >
              View
            </button>
          </>
        )}
      </div>
    </article>
  );
}
