'use client';

/**
 * One teacher/class result card — results page and Explore both render it.
 *
 * Reserve is REAL here (Phase 3): the button POSTs /api/class-match/reserve and
 * walks the documented outcomes — a clash warns and lets the family proceed
 * (docs 03 §3.3: discovering the clash on the day produces a no-show that was
 * not their fault), 'full' is terminal until the Phase 5 join queue, and 401
 * routes into the campaign signup carrying the chosen session so the flow
 * resumes exactly where the tap happened.
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
 *  - `highlightSessionId` is the "return to the card" contract (docs 03 §3.1):
 *    the row is visually emphasised and the card carries an anchor id the
 *    results page scrolls to. Not the top of the page.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, Check } from 'lucide-react';
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

type Clash = { sessionId: string; title: string; scheduledAt: string };

type SlotState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'clash'; clash: Clash }
  | { kind: 'reserved'; confirmation: string | null }
  | { kind: 'full' }
  | { kind: 'error'; message: string };

/** "10% off after attending", or "10–20% off after attending" across sessions. */
function discountBadge(sessions: TeacherResultSession[]): string | null {
  const pcts = sessions.map((s) => s.discountPercent).filter((p) => Number.isFinite(p));
  if (pcts.length === 0) return null;
  const min = Math.min(...pcts);
  const max = Math.max(...pcts);
  return min === max ? `${min}% off after attending` : `${min}–${max}% off after attending`;
}

function astShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    timeZone: 'America/Port_of_Spain',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function TeacherResultCard({
  card,
  reservedSessionIds = [],
  highlightSessionId,
  authed = false,
  ended = false,
}: {
  card: TeacherResultCardData;
  reservedSessionIds?: string[];
  highlightSessionId?: string;
  authed?: boolean;
  /** Explore renders past sessions muted with Reserve suppressed. */
  ended?: boolean;
}) {
  const router = useRouter();
  const badge = discountBadge(card.sessions);
  const price = card.priceMonthly && Number(card.priceMonthly) > 0 ? `${fmtTTD(card.priceMonthly)}/mo` : null;
  const classOnly = card.tier === 'fallback_class';

  const initialStates = useMemo(() => {
    const m: Record<string, SlotState> = {};
    for (const s of card.sessions) {
      m[s.sessionId] = reservedSessionIds.includes(s.sessionId)
        ? { kind: 'reserved', confirmation: null }
        : { kind: 'idle' };
    }
    return m;
    // reservedSessionIds is server-supplied per load; identity churn is fine here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.sessions.map((s) => s.sessionId).join(','), reservedSessionIds.join(',')]);

  const [states, setStates] = useState<Record<string, SlotState>>(initialStates);
  const [taken, setTaken] = useState<Record<string, number>>({});

  function setState(sessionId: string, next: SlotState) {
    setStates((prev) => ({ ...prev, [sessionId]: next }));
  }

  async function reserve(sessionId: string, confirm: boolean) {
    if (!authed) {
      router.push(`/class-match-week/signup?session=${sessionId}`);
      return;
    }
    setState(sessionId, { kind: 'busy' });
    try {
      const res = await fetch('/api/class-match/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirm ? { sessionId, confirm: true } : { sessionId }),
      });
      if (res.status === 401) {
        router.push(`/class-match-week/signup?session=${sessionId}`);
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (res.status === 201) {
        setTaken((prev) => ({ ...prev, [sessionId]: (prev[sessionId] ?? 0) + 1 }));
        const c = json?.confirmation;
        setState(sessionId, {
          kind: 'reserved',
          confirmation: c
            ? `You will meet ${c.teacherName} for “${c.title}” on ${c.scheduledAtDisplay}.`
            : null,
        });
        return;
      }
      if (json?.error === 'already_reserved') {
        setState(sessionId, { kind: 'reserved', confirmation: null });
        return;
      }
      if (json?.error === 'clash' && json.clash) {
        setState(sessionId, { kind: 'clash', clash: json.clash });
        return;
      }
      if (json?.error === 'full') {
        setState(sessionId, { kind: 'full' });
        return;
      }
      setState(sessionId, { kind: 'error', message: 'Could not reserve — try again.' });
    } catch {
      setState(sessionId, { kind: 'error', message: 'Could not reserve — check your connection.' });
    }
  }

  return (
    <article
      id={`cmw-card-${card.classId}`}
      className={`overflow-hidden rounded-3xl border bg-white shadow-card ${
        card.sessions.some((s) => s.sessionId === highlightSessionId)
          ? 'border-brand ring-2 ring-brand/30'
          : 'border-border'
      } ${ended ? 'opacity-60' : ''}`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {card.avatarUrl ? (
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
          {ended && (
            <span className="shrink-0 rounded-full bg-border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              Ended
            </span>
          )}
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
            const state = states[s.sessionId] ?? { kind: 'idle' as const };
            const spaces =
              s.spacesRemaining == null ? null : Math.max(0, s.spacesRemaining - (taken[s.sessionId] ?? 0));
            const highlighted = s.sessionId === highlightSessionId;
            return (
              <li
                key={s.sessionId}
                className={`p-4 ${highlighted ? 'bg-brand-soft/40' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{s.title}</p>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      {formatAstDate(at, { weekday: 'short', month: 'short', day: 'numeric' })} ·{' '}
                      {formatAstTimeRange(at, s.durationMinutes)} · {s.durationMinutes} min
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium text-brand-deep">
                      {s.discountPercent}% off the class if you continue
                      {spaces != null && state.kind !== 'reserved' && (
                        <span className="font-semibold text-coral">
                          {' '}
                          · {spaces} {spaces === 1 ? 'spot' : 'spots'} left
                        </span>
                      )}
                    </p>
                  </div>

                  {ended ? null : state.kind === 'reserved' ? (
                    <Link
                      href="/class-match-week/my-classes"
                      className="inline-flex shrink-0 items-center gap-1 rounded-2xl bg-brand-soft px-3 py-2 text-xs font-bold text-brand-deep"
                    >
                      <Check className="size-3.5" /> Reserved
                    </Link>
                  ) : state.kind === 'full' || spaces === 0 ? (
                    <span className="shrink-0 rounded-2xl bg-border px-4 py-2.5 text-xs font-bold text-ink-muted">
                      Full
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={state.kind === 'busy'}
                      onClick={() => reserve(s.sessionId, false)}
                      className={`shrink-0 rounded-2xl px-4 py-2.5 text-xs font-bold text-white transition-colors ${
                        highlighted ? 'bg-brand-deep ring-2 ring-brand/40' : 'bg-brand hover:bg-brand-deep'
                      } ${state.kind === 'busy' ? 'opacity-60' : ''}`}
                    >
                      {state.kind === 'busy' ? 'Reserving…' : 'Reserve'}
                    </button>
                  )}
                </div>

                {state.kind === 'clash' && (
                  <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                    This overlaps with <span className="font-semibold">{state.clash.title}</span> at{' '}
                    {astShort(state.clash.scheduledAt)} — reserve anyway?
                    <span className="mt-1.5 flex gap-3">
                      <button
                        type="button"
                        onClick={() => reserve(s.sessionId, true)}
                        className="font-bold text-brand-deep underline underline-offset-2"
                      >
                        Reserve anyway
                      </button>
                      <button
                        type="button"
                        onClick={() => setState(s.sessionId, { kind: 'idle' })}
                        className="text-ink-muted underline underline-offset-2"
                      >
                        Never mind
                      </button>
                    </span>
                  </div>
                )}

                {state.kind === 'reserved' && state.confirmation && (
                  <p className="mt-2 rounded-xl bg-brand-soft/60 px-3 py-2 text-[11px] leading-relaxed text-brand-deep">
                    Your free session has been reserved. {state.confirmation}
                  </p>
                )}

                {state.kind === 'error' && (
                  <p className="mt-2 text-[11px] text-coral">{state.message}</p>
                )}
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
