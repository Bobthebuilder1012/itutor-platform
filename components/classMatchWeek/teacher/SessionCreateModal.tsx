'use client';

import { useMemo, useState } from 'react';
import { X, Loader2, AlertTriangle, ExternalLink, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DISCOUNT_MIN,
  DISCOUNT_MAX,
  type ClassMatchSession,
} from '@/lib/classMatchWeek/types';

/** A class the teacher can back a session with — already filtered by the API's blocked list. */
export type SessionableClass = {
  id: string;
  name: string;
  /** Pre-formatted, e.g. "TT$120/mo" — the modal never touches raw money fields. */
  priceLabel: string;
};

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

/**
 * How long the discounted price holds once a family enrols. Labelled from the
 * teacher's point of view — "their first 3 months" — because the count starts at
 * THEIR enrolment, not at the class's start date. A family joining in week six
 * of a term still gets three discounted months.
 */
const PRICE_HOLD_OPTIONS = [
  { months: 1, label: 'Their first month' },
  { months: 3, label: 'Their first 3 months' },
  { months: 6, label: 'Their first 6 months' },
  { months: 12, label: 'Their first 12 months' },
  { months: 24, label: 'Their first 24 months' },
];

const FIELD =
  'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand';

const LABEL = 'block text-sm font-semibold text-ink mb-1.5';

/**
 * Create a Class Match Week session: the free taster, and the offer an attendee
 * unlocks by turning up.
 *
 * TWO SECTIONS, BECAUSE THEY ARE TWO DIFFERENT THINGS. The session is a one-off
 * free half-hour tied to one class. The offer is a discount that can span
 * several of the teacher's classes, outlives the session, and is the part that
 * earns money. Teachers were conflating them when both sat in one flat list.
 *
 * Every offer field ships with a working default (docs 01 §1.4: teachers abandon
 * long forms on a free product), so the required inputs remain class, name and a
 * time. The offer block is expanded rather than hidden behind a toggle, on the
 * owner's decision that these are terms a teacher should choose deliberately
 * rather than discover later.
 */
export default function SessionCreateModal({
  open,
  classes,
  promotable,
  onClose,
  onCreated,
}: {
  open: boolean;
  classes: SessionableClass[];
  /**
   * Every published monthly class the teacher owns — the pool the discount can
   * cover. Wider than `classes`, which is only what can HOST a taster: a class
   * with no weekly schedule cannot host one but can still be discounted.
   */
  promotable: SessionableClass[];
  onClose: () => void;
  onCreated: (session: ClassMatchSession, groupName: string, warning?: string) => void;
}) {
  const [groupId, setGroupId] = useState('');
  const [title, setTitle] = useState('');
  // Once the teacher edits the name we stop rewriting it on class change.
  const [titleTouched, setTitleTouched] = useState(false);
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [duration, setDuration] = useState(30);
  const [capacity, setCapacity] = useState(''); // blank = unlimited

  // Offer. Defaults are the product decision, not placeholders.
  const [discount, setDiscount] = useState('10');
  const [extraGroupIds, setExtraGroupIds] = useState<string[]>([]);
  const [priceMonths, setPriceMonths] = useState(3);
  const [windowDays, setWindowDays] = useState(14);
  const [expiryDate, setExpiryDate] = useState(''); // blank = no hard deadline

  const [submitting, setSubmitting] = useState<'publish' | 'draft' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [defectMessages, setDefectMessages] = useState<string[]>([]);
  const [reconnectUrl, setReconnectUrl] = useState<string | null>(null);

  // The taster's own class always qualifies, so it is never offered as a
  // choice — it is shown as already included. A discount that excludes the
  // class the family just sampled is worthless, which is why the server
  // enforces the same floor rather than trusting this list.
  const otherPromotable = useMemo(
    () => promotable.filter((c) => c.id !== groupId),
    [promotable, groupId]
  );

  if (!open) return null;

  const pickClass = (id: string) => {
    setGroupId(id);
    // Anything previously ticked that is now the taster's own class would be a
    // duplicate; the server drops it, but the UI should not imply two rows.
    setExtraGroupIds((prev) => prev.filter((x) => x !== id));
    if (!titleTouched) {
      const name = classes.find((c) => c.id === id)?.name ?? '';
      setTitle(name ? `Meet your teacher: ${name}` : '');
    }
  };

  const toggleExtra = (id: string) =>
    setExtraGroupIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const reset = () => {
    setGroupId('');
    setTitle('');
    setTitleTouched(false);
    setScheduledLocal('');
    setDuration(30);
    setCapacity('');
    setDiscount('10');
    setExtraGroupIds([]);
    setPriceMonths(3);
    setWindowDays(14);
    setExpiryDate('');
    setError(null);
    setDefectMessages([]);
    setReconnectUrl(null);
  };

  const close = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const capacityNumber = capacity.trim() === '' ? null : Number(capacity);
  const capacityInvalid =
    capacityNumber !== null && (!Number.isInteger(capacityNumber) || capacityNumber < 1);

  const discountNumber = discount.trim() === '' ? NaN : Number(discount);
  const discountInvalid =
    !Number.isInteger(discountNumber) ||
    discountNumber < DISCOUNT_MIN ||
    discountNumber > DISCOUNT_MAX;

  // A deadline before the taster runs would hand every attendee a coupon that
  // had already expired at the moment they earned it. Compared as wall-clock
  // dates, since both inputs are Trinidad-local.
  const expiryBeforeSession =
    !!expiryDate && !!scheduledLocal && expiryDate < scheduledLocal.slice(0, 10);

  const canSubmit =
    !!groupId &&
    !!title.trim() &&
    !!scheduledLocal &&
    !capacityInvalid &&
    !discountInvalid &&
    !expiryBeforeSession &&
    !submitting;

  const submit = async (status: 'published' | 'draft') => {
    if (!canSubmit) return;
    setSubmitting(status === 'published' ? 'publish' : 'draft');
    setError(null);
    setDefectMessages([]);
    setReconnectUrl(null);

    // datetime-local gives Trinidad wall-clock with no zone. AST is UTC-4 with
    // no DST, so pin the offset explicitly rather than trusting the browser's
    // timezone — a teacher on a mistimed device still schedules correctly.
    const withSeconds = scheduledLocal.length === 16 ? `${scheduledLocal}:00` : scheduledLocal;
    // A deadline is a DAY the teacher picked, so it runs to the end of it.
    // Expiring at midnight would cut the last day off the offer they described.
    const discountExpiresAt = expiryDate ? `${expiryDate}T23:59:59-04:00` : null;

    try {
      const res = await fetch('/api/class-match/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          title: title.trim(),
          scheduledAt: `${withSeconds}-04:00`,
          durationMinutes: duration,
          discountPercent: discountNumber,
          redemptionWindowDays: windowDays,
          priceDurationMonths: priceMonths,
          discountExpiresAt,
          qualifyingGroupIds: extraGroupIds,
          maxAttendees: capacityNumber,
          publish: status === 'published',
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.ok && json.session) {
        const groupName = classes.find((c) => c.id === groupId)?.name ?? '';
        onCreated(json.session, groupName, json.warning);
        reset();
        return;
      }

      // 422 shapes: well-formedness defects come with human messages to render
      // verbatim; meet_link_failed comes with a reason and a reconnect URL.
      if (Array.isArray(json.messages) && json.messages.length > 0) {
        setDefectMessages(json.messages);
      } else if (json.error === 'meet_link_failed' || json.reconnectUrl) {
        // `reason` carries the human sentence from the minter; `error` is the slug.
        setError(json.reason ?? 'We could not create the Google Meet link.');
        if (json.reconnectUrl) setReconnectUrl(json.reconnectUrl);
      } else {
        setError(json.error ?? 'Something went wrong — please try again.');
      }
    } catch {
      setError('Something went wrong — please try again.');
    } finally {
      setSubmitting(null);
    }
  };

  const tasterClassName = classes.find((c) => c.id === groupId)?.name ?? '';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={close} />

      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-background border border-border shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background px-5 py-4">
          <div>
            <span className="inline-flex items-center rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-deep">
              Class Match Week
            </span>
            <h2 className="mt-1 text-lg font-bold text-ink">Create a session</h2>
          </div>
          <button
            onClick={close}
            className="size-8 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {/* ── The free session ─────────────────────────────────────── */}
          <section className="space-y-4">
            <div>
              <label className={LABEL}>Name your session</label>
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleTouched(true);
                }}
                placeholder="Meet your teacher: …"
                className={FIELD}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Families see this name when they browse Class Match Week.
              </p>
            </div>

            <div>
              <label className={LABEL}>Which class is this a taster for?</label>
              <select value={groupId} onChange={(e) => pickClass(e.target.value)} className={FIELD}>
                <option value="">Select a class…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.priceLabel}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Date &amp; time</label>
                <input
                  type="datetime-local"
                  value={scheduledLocal}
                  onChange={(e) => setScheduledLocal(e.target.value)}
                  className={FIELD}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">Trinidad &amp; Tobago time</p>
              </div>
              <div>
                <label className={LABEL}>Duration</label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className={FIELD}
                >
                  {DURATION_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} minutes
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {duration > 60 && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-500" />
                Google may end this call after 60 minutes on free accounts.
              </div>
            )}

            <div>
              <label className={LABEL}>Maximum attendees</label>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="Unlimited"
                className={FIELD}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Students and parents together. Leave blank for unlimited.
              </p>
              {capacityInvalid && (
                <p className="mt-1 text-xs text-coral">
                  Enter a whole number of 1 or more, or leave it blank.
                </p>
              )}
            </div>
          </section>

          {/* ── The offer ────────────────────────────────────────────── */}
          <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
            <div>
              <h3 className="text-sm font-bold text-ink">What attendees unlock</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                A discount for the families who turn up, applied at checkout if they enrol.
              </p>
            </div>

            <div>
              <label className={LABEL}>Discount</label>
              <div className="relative">
                <input
                  type="number"
                  min={DISCOUNT_MIN}
                  max={DISCOUNT_MAX}
                  inputMode="numeric"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className={cn(FIELD, 'pr-8')}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                  %
                </span>
              </div>
              {discountInvalid ? (
                <p className="mt-1 text-xs text-coral">
                  Enter a whole number between {DISCOUNT_MIN} and {DISCOUNT_MAX}.
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Minimum {DISCOUNT_MIN}%.
                </p>
              )}
            </div>

            <div>
              <label className={LABEL}>Which classes the discount covers</label>
              {groupId ? (
                <div className="flex items-center gap-2 rounded-lg border border-brand/40 bg-brand/5 px-3 py-2">
                  <Check className="size-4 shrink-0 text-brand-deep" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                    {tasterClassName}
                  </span>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-brand-deep">
                    Always
                  </span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Pick the taster&rsquo;s class above — it is always covered.
                </p>
              )}

              {otherPromotable.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {otherPromotable.map((c) => {
                    const on = extraGroupIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleExtra(c.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition',
                          on
                            ? 'border-brand bg-brand/5'
                            : 'border-border bg-background hover:border-brand/40'
                        )}
                      >
                        <span
                          className={cn(
                            'grid size-4 shrink-0 place-items-center rounded border',
                            on ? 'border-brand bg-brand text-white' : 'border-muted-foreground/40'
                          )}
                        >
                          {on && <Check className="size-3" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.name}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {c.priceLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                Add other classes if you want an attendee to be able to spend the discount on any of
                them.
              </p>
            </div>

            <div>
              <label className={LABEL}>Discounted price holds for</label>
              <select
                value={priceMonths}
                onChange={(e) => setPriceMonths(Number(e.target.value))}
                className={FIELD}
              >
                {PRICE_HOLD_OPTIONS.map((o) => (
                  <option key={o.months} value={o.months}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Counted from the day they enrol, not from the day the class starts.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between text-sm font-semibold text-ink mb-1.5">
                <span>Days to claim it</span>
                <span className="tabular-nums text-brand-deep">{windowDays} days</span>
              </div>
              <input
                type="range"
                min={7}
                max={30}
                value={windowDays}
                onChange={(e) => setWindowDays(Number(e.target.value))}
                className="w-full accent-brand"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>7</span>
                <span>30</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Counted from the day each family attends, so everyone gets the same window.
              </p>
            </div>

            <div>
              <label className={LABEL}>Offer ends (optional)</label>
              <input
                type="date"
                value={expiryDate}
                min={scheduledLocal ? scheduledLocal.slice(0, 10) : undefined}
                onChange={(e) => setExpiryDate(e.target.value)}
                className={FIELD}
              />
              {expiryBeforeSession ? (
                <p className="mt-1 text-xs text-coral">
                  This date is before the session runs, so nobody could ever claim the discount.
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  A hard deadline. Whichever comes first — this date or the days above — ends the
                  offer. Leave blank to use the days alone.
                </p>
              )}
            </div>
          </section>

          {/* Errors — defect messages come from the API as finished human copy */}
          {defectMessages.length > 0 && (
            <div className="rounded-xl border border-coral/30 bg-coral/5 p-3 space-y-1">
              {defectMessages.map((m) => (
                <p key={m} className="text-sm text-ink">
                  {m}
                </p>
              ))}
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-coral/30 bg-coral/5 p-3">
              <p className="text-sm text-ink">{error}</p>
              {reconnectUrl && (
                <a
                  href={reconnectUrl}
                  className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-brand-deep hover:underline"
                >
                  Reconnect Google <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-background px-5 py-4">
          <button
            type="button"
            onClick={() => submit('draft')}
            disabled={!canSubmit}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-ink hover:bg-muted disabled:opacity-50"
          >
            {submitting === 'draft' ? 'Saving…' : 'Save draft'}
          </button>
          <button
            type="button"
            onClick={() => submit('published')}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
          >
            {submitting === 'publish' && <Loader2 className="size-4 animate-spin" />}
            {submitting === 'publish' ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}
