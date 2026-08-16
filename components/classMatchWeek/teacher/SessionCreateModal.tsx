'use client';

import { useState } from 'react';
import { X, ChevronDown, ChevronUp, Loader2, AlertTriangle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClassMatchSession, DiscountTier } from '@/lib/classMatchWeek/types';

/** A class the teacher can back a session with — already filtered by the API's blocked list. */
export type SessionableClass = {
  id: string;
  name: string;
  /** Pre-formatted, e.g. "TT$120/mo" — the modal never touches raw money fields. */
  priceLabel: string;
};

const DISCOUNT_TIERS: DiscountTier[] = [10, 15, 20];
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

const FIELD =
  'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand';

/**
 * One tap to publish. Teachers abandon long forms on a free product, so the
 * only required inputs are class, title (prefilled) and a time; every discount
 * variable ships with a default and hides behind "Customise offer".
 * Deliberately a single scrollable panel — no multi-step wizard.
 */
export default function SessionCreateModal({
  open,
  classes,
  onClose,
  onCreated,
}: {
  open: boolean;
  classes: SessionableClass[];
  onClose: () => void;
  onCreated: (session: ClassMatchSession, groupName: string, warning?: string) => void;
}) {
  const [groupId, setGroupId] = useState('');
  const [title, setTitle] = useState('');
  // Once the teacher edits the title we stop rewriting it on class change.
  const [titleTouched, setTitleTouched] = useState(false);
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [duration, setDuration] = useState(30);

  // Discount block — defaults are the product decision, not placeholders.
  const [customising, setCustomising] = useState(false);
  const [discount, setDiscount] = useState<DiscountTier>(10);
  const [windowDays, setWindowDays] = useState(14);
  const [priceMonths, setPriceMonths] = useState(3);
  const [capacity, setCapacity] = useState(''); // blank = unlimited

  const [submitting, setSubmitting] = useState<'publish' | 'draft' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [defectMessages, setDefectMessages] = useState<string[]>([]);
  const [reconnectUrl, setReconnectUrl] = useState<string | null>(null);

  if (!open) return null;

  const pickClass = (id: string) => {
    setGroupId(id);
    if (!titleTouched) {
      const name = classes.find((c) => c.id === id)?.name ?? '';
      setTitle(name ? `Meet your teacher: ${name}` : '');
    }
  };

  const reset = () => {
    setGroupId('');
    setTitle('');
    setTitleTouched(false);
    setScheduledLocal('');
    setDuration(30);
    setCustomising(false);
    setDiscount(10);
    setWindowDays(14);
    setPriceMonths(3);
    setCapacity('');
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
  const canSubmit =
    !!groupId && !!title.trim() && !!scheduledLocal && !capacityInvalid && !submitting;

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

    try {
      const res = await fetch('/api/class-match/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId,
          title: title.trim(),
          scheduledAt: `${withSeconds}-04:00`,
          durationMinutes: duration,
          discountPercent: discount,
          redemptionWindowDays: windowDays,
          priceDurationMonths: priceMonths,
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={close} />

      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-background border border-border shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background px-5 py-4">
          <div>
            <span className="inline-flex items-center rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-deep">
              Class Match Week
            </span>
            <h2 className="mt-1 text-lg font-bold text-ink">Create a taster session</h2>
          </div>
          <button
            onClick={close}
            className="size-8 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Class */}
          <div>
            <label className="block text-sm font-semibold text-ink mb-1.5">Class</label>
            <select value={groupId} onChange={(e) => pickClass(e.target.value)} className={FIELD}>
              <option value="">Select a class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.priceLabel}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Attendees get a discount on this class if they enrol afterwards.
            </p>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-ink mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
              placeholder="Meet your teacher: …"
              className={FIELD}
            />
          </div>

          {/* Date + time and duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-ink mb-1.5">Date &amp; time</label>
              <input
                type="datetime-local"
                value={scheduledLocal}
                onChange={(e) => setScheduledLocal(e.target.value)}
                className={FIELD}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Trinidad &amp; Tobago time</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-ink mb-1.5">Duration</label>
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

          {/* Discount block — collapsed behind a summary of the defaults */}
          <div className="rounded-2xl border border-border bg-card">
            <button
              type="button"
              onClick={() => setCustomising((c) => !c)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink">Customise offer</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {discount}% off · claim within {windowDays} days · price holds {priceMonths}{' '}
                  month{priceMonths === 1 ? '' : 's'}
                  {capacityNumber ? ` · cap ${capacityNumber}` : ''}
                </div>
              </div>
              {customising ? (
                <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              )}
            </button>

            {customising && (
              <div className="space-y-4 border-t border-border px-4 py-4">
                <div>
                  <div className="text-xs font-semibold text-ink mb-1.5">Discount for attendees</div>
                  <div className="grid grid-cols-3 gap-2">
                    {DISCOUNT_TIERS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setDiscount(t)}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-sm font-semibold transition',
                          discount === t
                            ? 'border-brand bg-brand/10 text-brand-deep'
                            : 'border-border bg-background text-muted-foreground hover:text-ink'
                        )}
                      >
                        {t}%
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-ink mb-1.5">
                    <span>Days to claim the discount</span>
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
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-semibold text-ink mb-1.5">Price holds for</div>
                    <select
                      value={priceMonths}
                      onChange={(e) => setPriceMonths(Number(e.target.value))}
                      className={FIELD}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>
                          {m} month{m === 1 ? '' : 's'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-ink mb-1.5">Capacity</div>
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={capacity}
                      onChange={(e) => setCapacity(e.target.value)}
                      placeholder="Unlimited"
                      className={FIELD}
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">Blank = unlimited</p>
                  </div>
                </div>
                {capacityInvalid && (
                  <p className="text-xs text-coral">Capacity must be a whole number of 1 or more.</p>
                )}
              </div>
            )}
          </div>

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
