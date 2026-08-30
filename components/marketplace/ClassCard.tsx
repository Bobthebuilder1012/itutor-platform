'use client';

/**
 * THE class card. One component, rendered by the Explore marketplace and by the
 * Find Your iTutor results — so the two cannot drift.
 *
 * It used to exist only as inline JSX inside ExploreMarketplace, and the Finder
 * carried a thinner card of its own built from the stored match snapshot. That
 * card had no banner, no subject/level line, no description, no start date and
 * no recurrence text, so a family who answered the questionnaire saw a visibly
 * poorer version of the same catalogue they would see one click later. Matching
 * the two by eye failed twice; sharing the markup is what actually fixes it.
 *
 * The Finder therefore renders from LIVE class rows, not from the snapshot.
 * A cover image, a description and a start date all change after a run is
 * recorded, and a frozen copy of them would be wrong rather than merely stale.
 * The snapshot still decides WHICH classes appear and in what order — that is
 * the part which must not move.
 */

import Link from 'next/link';
import { Star, Calendar, Clock, Users, Flame, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import { classCapacityDisplay } from '@/lib/utils/classCapacity';
import type { ScheduleEntry } from '@/lib/utils/scheduleFormat';

/** Everything the card renders. Filter-only fields live on the caller. */
export type ClassCardData = {
  id: string;
  title: string;
  tutor: string;
  tutorAvatar?: string | null;
  subject: string;
  level: string;
  day: string;
  time: string;
  hasCompactSchedule: boolean;
  scheduleEntries: ScheduleEntry[];
  monthlyPrice: number;
  seats: { taken: number; total: number | null };
  sessionLength: number | null;
  tutorRating: number | null;
  tutorReviews: number;
  color: string;
  description?: string | null;
  coverImage?: string | null;
  requireJoinRequests?: boolean;
  classFormat?: 'online' | 'physical' | 'hybrid';
  venueArea?: string | null;
  activePromotion?: { id: string; kind: string; discount: number; student_cap: number | null; duration_days: number | null } | null;
  preorder?: { firstSession: string; releaseDate: string; shortClass: boolean } | null;
};

function promoLabel(promo: { kind: string; discount: number; student_cap: number | null; duration_days: number | null; created_at?: string; used_count?: number }): string {
  if (promo.kind === 'early-bird' && promo.student_cap) {
    const remaining = promo.student_cap - (promo.used_count ?? 0);
    return `Next ${remaining} student${remaining !== 1 ? 's' : ''} get ${promo.discount}% off`;
  }
  if (promo.kind === 'time-limited' && promo.duration_days && promo.created_at) {
    const exp = new Date(promo.created_at);
    exp.setDate(exp.getDate() + promo.duration_days);
    const daysLeft = Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 86400000));
    return `${promo.discount}% off · ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`;
  }
  return `${promo.discount}% off`;
}

function formatDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function TutorAvatar({ avatarUrl, name, size = 40 }: { avatarUrl?: string | null; name: string; size?: number }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className="rounded-md object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = name.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '').split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      className="inline-flex items-center justify-center rounded-md font-semibold shrink-0 bg-brand-soft text-forest"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

export { TutorAvatar, promoLabel, formatDuration };

export default function ClassCard({
  l,
  enrolled = false,
  href,
  enrolledHref,
  /** Finder-only: a line naming what the family asked for and did not get. */
  missNote,
}: {
  l: ClassCardData;
  enrolled?: boolean;
  href: string;
  enrolledHref?: string;
  missNote?: React.ReactNode;
}) {
  const remaining = l.seats.total !== null ? l.seats.total - l.seats.taken : null;
  const lowStock = remaining !== null && remaining > 0 && remaining <= 3;
  const full = remaining !== null && remaining <= 0;
  // Capacity is withheld until it argues for joining — see
  // lib/utils/classCapacity. The fill bar is withheld with it:
  // an empty bar says "nobody is here" just as plainly as the
  // count did, so showing one without the other keeps the
  // problem and only removes the words.
  const capacity = classCapacityDisplay(l.seats.taken, l.seats.total);
  const pctFull =
    capacity.kind === 'hidden' || !l.seats.total
      ? null
      : Math.round((l.seats.taken / l.seats.total) * 100);
  return (
    <div key={l.id} className={cn('group rounded-3xl bg-background border overflow-hidden hover:shadow-card transition-all hover:-translate-y-0.5 flex flex-col', enrolled ? 'border-brand/40' : 'border-border')}>
      <div className={`relative h-24 ${l.coverImage ? '' : `bg-gradient-to-br ${l.color}`}`}
        style={l.coverImage ? { backgroundImage: `url(${l.coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        {enrolled && (
          <div className="absolute top-2.5 left-2.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand text-white">
            Enrolled
          </div>
        )}
      </div>
      <div className="p-4 space-y-3 flex-1 flex flex-col">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-ink leading-tight">{l.title}</h3>
            {/* The tutor's rating, not the class's — said out loud
                so it can't be read as a rating of this class. */}
            {l.tutorRating !== null && (
              <span
                title={`Tutor rating · ${l.tutorReviews} review${l.tutorReviews === 1 ? '' : 's'}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold tabular-nums shrink-0"
              >
                <Star className="size-3 fill-amber-500 text-amber-500" />
                {l.tutorRating.toFixed(1)}
                <span className="font-medium text-amber-700/80">tutor</span>
              </span>
            )}
          </div>
          <div className="mt-1.5 inline-flex items-center gap-2">
            {/* TutorAvatar already does photo-then-initials, which
                is what the payment branch built separately. */}
            <TutorAvatar avatarUrl={l.tutorAvatar} name={l.tutor} size={22} />
            <span className="text-sm text-muted-foreground">by {l.tutor}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">{l.subject}{l.level ? ` · ${l.level}` : ''}</div>
          {l.description && (
            <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{l.description}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {l.requireJoinRequests && !enrolled && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground">
              Approval required
            </span>
          )}
          {/* Parent feedback badges hidden — parent accounts coming soon */}
          {(lowStock || full) && (
            <div className={cn('inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full', full ? 'bg-muted text-muted-foreground' : 'bg-coral-soft text-coral')}>
              <Flame className="size-3.5" />
              {full ? 'Class full' : `Only ${remaining} spot${remaining === 1 ? '' : 's'} left!`}
            </div>
          )}
        </div>

        <div className="space-y-1.5 text-xs">
          {/* Starts-on date, above the recurrence: for a class that
              hasn't begun, "when does this start" is the question
              the student is actually asking. */}
          {l.preorder && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 font-semibold text-forest">
              <Calendar className="size-3.5 shrink-0" />
              Starts{' '}
              {new Date(l.preorder.firstSession).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </div>
          )}
          {/* Recurring schedule — days and time on one line, e.g.
              "Recurring every Monday and Wednesday · 5:00–7:00 PM AST".
              Renders nothing when the class has no recurring
              schedule, rather than a "Schedule TBD" placeholder —
              `day` is '' in that case, not the placeholder string. */}
          {l.day && (
            <div className="text-muted-foreground whitespace-pre-line leading-relaxed">{l.day}</div>
          )}
          {/* Finder-only, and sits directly under the schedule because that is
              the line it is disagreeing with. Amber, not red: a near miss is
              still a recommendation, not an error. */}
          {missNote ? (
            <div className="text-amber-700 leading-snug">{missNote}</div>
          ) : null}
          {/* Time / duration only for free-text or legacy schedules —
              a compact line already states the range. */}
          {!l.hasCompactSchedule && l.time && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="size-3.5" /> {l.time}
              {l.sessionLength && <span className="text-muted-foreground/70">· {formatDuration(l.sessionLength)}</span>}
            </div>
          )}
          {!l.hasCompactSchedule && !l.time && l.sessionLength && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="size-3.5" /> {formatDuration(l.sessionLength)} per session
            </div>
          )}
          {/* Only shown when the class meets somewhere. A line
              reading "Online" on every card in the catalogue is
              noise; a line naming an area is the fact that decides
              whether the class is reachable at all. */}
          {l.classFormat && l.classFormat !== 'online' && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="size-3.5" />
              {l.classFormat === 'hybrid' ? 'In person or online' : 'In person'}
              {l.venueArea ? (
                <span className="text-muted-foreground/70">· {l.venueArea}</span>
              ) : null}
            </div>
          )}
          {capacity.kind !== 'hidden' && (
            <div className={cn(
              'flex items-center gap-1.5',
              capacity.kind === 'full' ? 'text-muted-foreground' : 'text-coral font-semibold'
            )}>
              <Users className="size-3.5" />
              {capacity.label}
            </div>
          )}
          {pctFull !== null && (
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div className={cn('h-full rounded-full', lowStock ? 'bg-coral' : 'bg-brand')} style={{ width: `${pctFull}%` }} />
            </div>
          )}
        </div>

        <div className="flex items-end justify-between pt-3 mt-auto border-t border-border">
          <div>
            {l.monthlyPrice > 0 ? (
              l.activePromotion ? (
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                      {promoLabel(l.activePromotion)}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-lg font-bold text-brand-deep">{fmtTTD(Math.round(l.monthlyPrice * (1 - l.activePromotion.discount / 100)))}</span>
                    <span className="text-xs line-through text-muted-foreground">{fmtTTD(l.monthlyPrice)}</span>
                    <span className="text-xs text-muted-foreground">/month</span>
                  </div>
                </div>
              ) : (
                <>
                  <span className="text-lg font-bold text-ink">{fmtTTD(l.monthlyPrice)}</span>
                  <span className="text-xs text-muted-foreground">/month</span>
                </>
              )
            ) : (
              <span className="text-lg font-bold text-brand-deep">Free</span>
            )}
          </div>
          {/* `enrolled` is only ever true where the caller knows the enrolled
              destination, but the type cannot say that — the Finder renders to
              signed-out visitors and passes neither. Falling back to `href`
              keeps the card honest instead of linking nowhere. */}
          {enrolled ? (
            <Link
              href={enrolledHref ?? href}
              className="px-3 py-1.5 rounded-xl bg-brand-soft text-forest text-xs font-semibold hover:bg-brand/20 transition"
            >
              Open Class
            </Link>
          ) : (
            <Link
              href={href}
              className="px-3 py-1.5 rounded-xl bg-brand text-white text-xs font-semibold hover:bg-brand-deep transition"
            >
              {/* This link goes to the class page; joining happens
                  there, so the card says what the click does
                  (f6132c9 / f6b4162 — lost on this branch when
                  dd7c04f restored main's copy of the file, and
                  rebuilt from that base by the preorder CTA).
                  A preorderable class said "Secure your spot"
                  here, which promised a checkout the click does
                  not open. The "Starts <date>" badge above
                  already tells a student the class is upcoming;
                  reserving is offered on the class page itself. */}
              {full ? 'Join waitlist' : 'View class'}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
