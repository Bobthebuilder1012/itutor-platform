/**
 * One teacher/class result on the Class Match Week results page.
 *
 * Deliberately server-compatible (no 'use client'): the results page is a
 * service-client server component and the only interactivity here is
 * navigation. Props are declared structurally against the runMatch contract
 * rather than imported from the matching module, so the card stands alone and
 * a rename over there fails the typecheck at the page, not inside the card.
 *
 * Rendering rules this card owns:
 *  - Price is `groups.price_monthly` as "TT$N/mo". Null or 0 omits the price
 *    line entirely — NEVER render "Free"; three eligible classes carry 0.00
 *    and a free badge on a paid-class card is the platform's live defect this
 *    card exists to avoid repeating.
 *  - The discount badge collapses to a range when sessions differ.
 *  - "N spots left" renders only when the cap is non-null (NULL = unlimited).
 *  - `fallback_class` cards carry no campaign session: they get a View class
 *    link to the ongoing class and no Reserve.
 */

import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { formatAstDate, formatAstTimeRange } from '@/lib/utils/scheduleFormat';
import { fmtTTD } from '@/lib/utils/formatCurrency';

export type TeacherResultSession = {
  sessionId: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  discountPercent: number;
  spacesRemaining: number | null;
};

export type TeacherResultCardData = {
  tutorId: string;
  teacherName: string;
  avatarUrl: string | null;
  subject: string | null;
  levelLabels: string[];
  classId: string;
  className: string;
  priceMonthly: number | null;
  classSlots: string[];
  sessions: TeacherResultSession[];
  tier: 'exact' | 'fallback_schedule' | 'fallback_class';
  mismatchNote?: string;
};

/**
 * Reserve behaviour THIS PHASE: reservation itself is Phase 3. The button is
 * a plain link into signup carrying a redirect back to these results with the
 * chosen session, so Phase 3 can pick the flow up exactly where it left off.
 * `?redirect=` is the repo's convention (never `?next=`); we only construct
 * the URL here, never consume one.
 */
function reserveHref(sessionId: string): string {
  return `/signup?redirect=${encodeURIComponent(`/class-match-week/results?session=${sessionId}`)}`;
}

/** "10% off after attending", or "10–20% off after attending" across sessions. */
function discountBadge(sessions: TeacherResultSession[]): string | null {
  const pcts = sessions.map((s) => s.discountPercent).filter((p) => Number.isFinite(p));
  if (pcts.length === 0) return null;
  const min = Math.min(...pcts);
  const max = Math.max(...pcts);
  return min === max ? `${min}% off after attending` : `${min}–${max}% off after attending`;
}

export default function TeacherResultCard({ card }: { card: TeacherResultCardData }) {
  const badge = discountBadge(card.sessions);
  const price = card.priceMonthly && Number(card.priceMonthly) > 0 ? `${fmtTTD(card.priceMonthly)}/mo` : null;
  const classOnly = card.tier === 'fallback_class';

  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-white shadow-card">
      <div className="p-4">
        <div className="flex items-start gap-3">
          {card.avatarUrl ? (
            // Plain <img>: avatars are public Supabase storage URLs and the
            // card must render for anonymous visitors with zero client JS.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.avatarUrl} alt="" className="size-12 shrink-0 rounded-2xl object-cover" />
          ) : (
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-lg font-bold text-brand-deep">
              {card.teacherName.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-bold text-ink">{card.teacherName}</h3>
            <p className="truncate text-xs text-ink-muted">
              {[card.subject, ...card.levelLabels].filter(Boolean).join(' · ')}
            </p>
            {badge && (
              <span className="mt-1.5 inline-flex rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-semibold text-brand-deep">
                {badge}
              </span>
            )}
          </div>
        </div>

        {card.mismatchNote && (
          <p className="mt-3 rounded-xl bg-peach px-3 py-2 text-[11px] leading-relaxed text-[oklch(0.38_0.08_65)]">
            {card.mismatchNote}
          </p>
        )}

        {/* The ongoing paid class the free session leads into. */}
        <div className="mt-3 flex items-start gap-2">
          <CalendarDays className="mt-0.5 size-3.5 shrink-0 text-brand-deep" />
          <p className="text-xs leading-relaxed text-ink">
            <span className="font-semibold">{card.className}</span>
            {card.classSlots.length > 0 && <> · {card.classSlots.join(' · ')}</>}
            {price && (
              <>
                {' · '}
                <span className="font-semibold">{price}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {card.sessions.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {card.sessions.map((s) => {
            const at = new Date(s.scheduledAt);
            return (
              <li key={s.sessionId} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{s.title}</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {formatAstDate(at, { weekday: 'short', month: 'short', day: 'numeric' })} ·{' '}
                    {formatAstTimeRange(at, s.durationMinutes)} · {s.durationMinutes} min
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-brand-deep">
                    {s.discountPercent}% off the class if you continue
                    {s.spacesRemaining != null && (
                      <span className="font-semibold text-coral">
                        {' '}
                        · {s.spacesRemaining} {s.spacesRemaining === 1 ? 'spot' : 'spots'} left
                      </span>
                    )}
                  </p>
                </div>
                <Link
                  href={reserveHref(s.sessionId)}
                  className="shrink-0 rounded-2xl bg-brand px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-brand-deep"
                >
                  Reserve
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-end border-t border-border px-4 py-2.5">
        {classOnly ? (
          <Link href={`/student/groups/${card.classId}`} className="text-xs font-semibold text-brand-deep hover:underline">
            View class
          </Link>
        ) : (
          // "Notify me" is Phase 5 — a deliberate no-op stub for now.
          <button
            type="button"
            title="Coming soon"
            className="text-[11px] text-ink-muted underline decoration-dotted underline-offset-2"
          >
            Notify me
          </button>
        )}
      </div>
    </article>
  );
}
