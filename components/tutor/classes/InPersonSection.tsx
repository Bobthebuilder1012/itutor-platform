'use client';

/**
 * Class settings → In person. Where a class becomes physical or hybrid.
 *
 * A separate component rather than another branch inside the 3,200-line class
 * page, because it needs the venue list (its own fetch), it needs the seat-type
 * rules from lib/utils/seatCapacity, and it has three inter-dependent fields
 * whose validity depends on the format. Inlining it would put all of that in the
 * middle of a file that is already hard to move around in.
 *
 * ── THE ONE RULE THIS SCREEN HAS TO TEACH ───────────────────────────────────
 * Seats are PER SEAT TYPE, and the class total is derived from them. A trigger
 * (sync_group_max_students) keeps `groups.max_students` as the sum, so the
 * Capacity tab's single "student limit" and these two numbers are not three
 * facts to reconcile — they are one fact and its parts. A hybrid class with ten
 * physical seats taken and online space left is NOT at capacity: physical
 * enrolment closes, online stays open. The copy says so, because a tutor who
 * does not know that will read the difference as a bug.
 *
 * NULL MEANS UNLIMITED, 0 MEANS NONE. They are different answers and the
 * distinction is load-bearing all the way down to seatCapacity.ts, so the inputs
 * are left blank for unlimited rather than defaulted to a number.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import {
  seatTypesFor,
  type ClassFormat,
  type SeatConfig,
} from '@/lib/utils/seatCapacity';

type Venue = { id: string; name: string; region_id: string; address_line: string | null };
type Region = { id: string; name: string };

export interface InPersonDraft {
  classFormat: ClassFormat;
  venueId: string | null;
  venueVisibility: 'public' | 'after_enrolment';
  maxStudentsOnline: number | null;
  maxStudentsPhysical: number | null;
  priceOnlineTtd: number | null;
  pricePhysicalTtd: number | null;
  acceptsCash: boolean;
}

const FORMATS: Array<{ value: ClassFormat; label: string; detail: string }> = [
  { value: 'online', label: 'Online only', detail: 'Everyone joins from home.' },
  { value: 'physical', label: 'In person only', detail: 'Everyone comes to a venue.' },
  {
    value: 'hybrid',
    label: 'Both',
    detail: 'Students choose when they join — some in the room, some online.',
  },
];

const FIELD =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand';

/** '' → null, so "unlimited" survives a round trip through an input. */
function numOrNull(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export default function InPersonSection({
  draft,
  onChange,
  enrolledOnline,
  enrolledPhysical,
}: {
  draft: InPersonDraft;
  onChange: (patch: Partial<InPersonDraft>) => void;
  /** Seats already sold, per type. The floor for each cap. */
  enrolledOnline: number;
  enrolledPhysical: number;
}) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/venues', { cache: 'no-store' });
      const json = await res.json();
      setVenues(json.venues ?? []);
      setRegions(json.regions ?? []);
      setUnavailable(Boolean(json.unavailable));
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const seats = seatTypesFor(draft.classFormat);
  const offersOnline = seats.includes('online');
  const offersPhysical = seats.includes('physical');
  const regionOf = (venue: Venue) => regions.find(r => r.id === venue.region_id)?.name ?? '';

  // The class total, shown rather than edited. It is what groups.max_students
  // will become, and seeing it here is what stops the Capacity tab's single
  // number reading as a contradiction.
  const config: SeatConfig = {
    class_format: draft.classFormat,
    max_students_online: draft.maxStudentsOnline,
    max_students_physical: draft.maxStudentsPhysical,
    price_online_ttd: draft.priceOnlineTtd,
    price_physical_ttd: draft.pricePhysicalTtd,
  };
  const anyUncapped = seats.some(s =>
    s === 'online' ? config.max_students_online === null : config.max_students_physical === null
  );
  const derivedTotal = anyUncapped
    ? null
    : seats.reduce(
        (sum, s) =>
          sum + (s === 'online' ? (config.max_students_online ?? 0) : (config.max_students_physical ?? 0)),
        0
      );

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading venues…
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        In-person classes are not enabled on this environment yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Format ─────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {FORMATS.map(f => {
          const selected = draft.classFormat === f.value;
          // Choosing a physical format with no venue is refused by the API
          // (groups_venue_required_check), so the option is disabled with the
          // reason rather than letting the save fail.
          const blocked = f.value !== 'online' && venues.length === 0;
          return (
            <button
              key={f.value}
              type="button"
              disabled={blocked}
              onClick={() => {
                if (blocked) return;
                onChange({
                  classFormat: f.value,
                  // Online classes cannot take cash — there is no room to hand
                  // it over in. Cleared here so the save is never refused for a
                  // flag the tutor cannot see any more.
                  ...(f.value === 'online' ? { acceptsCash: false, venueId: null } : {}),
                });
              }}
              className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
                selected
                  ? 'border-brand bg-brand/5'
                  : 'border-border hover:border-brand/50 hover:bg-muted/40'
              } ${blocked ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <span
                aria-hidden
                className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 ${
                  selected ? 'border-brand' : 'border-border'
                }`}
              >
                {selected ? <span className="size-2 rounded-full bg-brand" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{f.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {blocked ? 'Add a venue in My Business → Venues first.' : f.detail}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Venue ──────────────────────────────────────────────────────── */}
      {offersPhysical ? (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Venue
            </span>
            <select
              className={FIELD}
              value={draft.venueId ?? ''}
              onChange={e => onChange({ venueId: e.target.value || null })}
            >
              <option value="">Choose a venue…</option>
              {venues.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {regionOf(v) ? ` — ${regionOf(v)}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Who sees the street address
            </span>
            <select
              className={FIELD}
              value={draft.venueVisibility}
              onChange={e =>
                onChange({ venueVisibility: e.target.value as InPersonDraft['venueVisibility'] })
              }
            >
              <option value="after_enrolment">Only students who have joined</option>
              <option value="public">Anyone looking at the class</option>
            </select>
            {/* The half that is never hidden, said plainly — a tutor choosing
                "only students" should not think the class is invisible to
                people searching their area. */}
            <span className="mt-1.5 block text-xs text-muted-foreground">
              The area is always shown, so families can find classes near them.
              This only controls the street address and your arrival notes.
            </span>
          </label>

          <label className="flex items-start gap-2.5 pt-1">
            <input
              type="checkbox"
              checked={draft.acceptsCash}
              onChange={e => onChange({ acceptsCash: e.target.checked })}
              className="mt-0.5 size-4 rounded border-border text-brand focus:ring-brand"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">Accept cash at the venue</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Students can pay you in person instead of online. You collect and
                record it yourself — iTutor does not process or track it.
              </span>
            </span>
          </label>
        </div>
      ) : null}

      {/* ── Seats and prices, per type ─────────────────────────────────── */}
      <div className="space-y-3 rounded-xl border border-border p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Seats
        </p>
        {/* The rule, stated once, where the numbers are. */}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Leave a limit blank for no limit. The class is only full when{' '}
          <strong className="font-semibold">every</strong> kind of seat is full —
          so a full room does not close your online seats.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {offersOnline ? (
            <SeatFields
              title="Online seats"
              cap={draft.maxStudentsOnline}
              price={draft.priceOnlineTtd}
              enrolled={enrolledOnline}
              onCap={v => onChange({ maxStudentsOnline: v })}
              onPrice={v => onChange({ priceOnlineTtd: v })}
            />
          ) : null}
          {offersPhysical ? (
            <SeatFields
              title="In-person seats"
              cap={draft.maxStudentsPhysical}
              price={draft.pricePhysicalTtd}
              enrolled={enrolledPhysical}
              onCap={v => onChange({ maxStudentsPhysical: v })}
              onPrice={v => onChange({ pricePhysicalTtd: v })}
            />
          ) : null}
        </div>

        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          Class total:{' '}
          <strong className="font-semibold text-foreground">
            {derivedTotal === null ? 'no limit' : `${derivedTotal} students`}
          </strong>
          . This is worked out from the seats above — you do not set it
          separately.
        </p>
      </div>

      {venues.length === 0 ? (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <MapPin aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          To run this class in person, add a venue in My Business → Venues.
        </p>
      ) : null}
    </div>
  );
}

function SeatFields({
  title,
  cap,
  price,
  enrolled,
  onCap,
  onPrice,
}: {
  title: string;
  cap: number | null;
  price: number | null;
  enrolled: number;
  onCap: (v: number | null) => void;
  onPrice: (v: number | null) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{title}</p>
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">Limit</span>
        <input
          className={FIELD}
          type="number"
          min={enrolled}
          value={cap === null ? '' : String(cap)}
          onChange={e => onCap(numOrNull(e.target.value))}
          placeholder="No limit"
        />
        {enrolled > 0 ? (
          // The floor, said before the save is refused. There is no rule for who
          // would be dropped if a cap went below the seats already sold.
          <span className="mt-1 block text-xs text-muted-foreground">
            {enrolled} already taken — the limit cannot go below that.
          </span>
        ) : null}
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">
          Price / month (TTD)
        </span>
        <input
          className={FIELD}
          type="number"
          min={0}
          value={price === null ? '' : String(price)}
          onChange={e => onPrice(numOrNull(e.target.value))}
          placeholder="Same as the class price"
        />
      </label>
    </div>
  );
}
