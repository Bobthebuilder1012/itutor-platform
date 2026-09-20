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

  // Inline venue creation. A tutor's FIRST physical class has no venue to pick,
  // so without this the format choice dead-ends into "go to another screen,
  // come back, start again" — at the exact moment they are trying to do the
  // thing. Every later class is two taps because the venue is then in the list.
  const [addingVenue, setAddingVenue] = useState(false);
  const [savingVenue, setSavingVenue] = useState(false);
  const [venueError, setVenueError] = useState<string | null>(null);
  const [newVenue, setNewVenue] = useState({ name: '', region_id: '', address_line: '' });

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

  const saveVenue = async () => {
    if (savingVenue) return;
    setVenueError(null);
    if (!newVenue.name.trim()) return setVenueError('Give the venue a name.');
    if (!newVenue.region_id) return setVenueError('Choose the area it is in.');
    if (!newVenue.address_line.trim()) return setVenueError('Add the street address.');

    setSavingVenue(true);
    try {
      const res = await fetch('/api/tutor/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newVenue),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setVenueError(
          json?.field ? `Check the ${json.field.replace(/_/g, ' ')} field.` : 'That did not save.'
        );
        return;
      }
      const created = json.venue as Venue;
      setVenues((prev) => [...prev, created]);
      // Select it immediately — the tutor created it in order to use it, and
      // making them then pick it from a list is a step that exists for no one.
      onChange({ venueId: created.id });
      setAddingVenue(false);
      setNewVenue({ name: '', region_id: '', address_line: '' });
    } catch {
      setVenueError('That did not save.');
    } finally {
      setSavingVenue(false);
    }
  };

  const seats = seatTypesFor(draft.classFormat);
  const offersOnline = seats.includes('online');
  const offersPhysical = seats.includes('physical');
  /** Only a hybrid class has two kinds of seat to tell apart. */
  const bothSeatKinds = offersOnline && offersPhysical;
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
          // NOT disabled when the tutor has no venue yet — that dead-ended the
          // first physical class, which is the one that matters most. Picking
          // the format now opens the inline venue form below instead.
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => {
                // No venue yet and they want a room: open the form rather than
                // refuse. The API still enforces the rule at save time.
                if (f.value !== 'online' && venues.length === 0) setAddingVenue(true);
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
              }`}
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
                <span className="mt-0.5 block text-xs text-muted-foreground">{f.detail}</span>
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
              onChange={e => {
                if (e.target.value === '__new') { setAddingVenue(true); return; }
                onChange({ venueId: e.target.value || null });
              }}
            >
              <option value="">Choose a venue…</option>
              {venues.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {regionOf(v) ? ` — ${regionOf(v)}` : ''}
                </option>
              ))}
              <option value="__new">+ Add a new venue…</option>
            </select>
          </label>

          {/* Inline venue creation. The first physical class always comes
              through here, so it asks for the three things the API requires and
              nothing else — the rest is editable later in My Business → Venues. */}
          {addingVenue ? (
            <div className="space-y-2 rounded-lg border border-brand/40 bg-brand/5 p-3">
              <p className="text-xs font-semibold text-ink">New venue</p>
              <input
                className={FIELD}
                placeholder="Name — e.g. Chaguanas Learning Centre"
                value={newVenue.name}
                maxLength={120}
                onChange={e => setNewVenue(v => ({ ...v, name: e.target.value }))}
              />
              <select
                className={FIELD}
                value={newVenue.region_id}
                onChange={e => setNewVenue(v => ({ ...v, region_id: e.target.value }))}
              >
                <option value="">Choose an area…</option>
                {regions.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <input
                className={FIELD}
                placeholder="Street address"
                value={newVenue.address_line}
                maxLength={300}
                onChange={e => setNewVenue(v => ({ ...v, address_line: e.target.value }))}
              />
              {/* Said before they type it, not after. */}
              <p className="text-xs text-muted-foreground">
                The area is always shown to students. The street address follows
                the setting below.
              </p>
              {venueError ? <p className="text-xs text-coral">{venueError}</p> : null}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={saveVenue}
                  disabled={savingVenue}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {savingVenue ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Save venue
                </button>
                <button
                  type="button"
                  onClick={() => { setAddingVenue(false); setVenueError(null); }}
                  className="text-xs font-medium text-muted-foreground hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

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
        {/* The rule, stated once, where the numbers are — and only the part
            that applies. A class with one kind of seat cannot have a full room
            close its online seats, so saying so there is noise. */}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Leave a limit blank for no limit.
          {bothSeatKinds ? (
            <>
              {' '}The class is only full when{' '}
              <strong className="font-semibold">every</strong> kind of seat is
              full — so a full room does not close your online seats.
            </>
          ) : null}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {offersOnline ? (
            <SeatFields
              title={bothSeatKinds ? 'Online seats' : 'Student limit'}
              cap={draft.maxStudentsOnline}
              price={draft.priceOnlineTtd}
              enrolled={enrolledOnline}
              onCap={v => onChange({ maxStudentsOnline: v })}
              onPrice={v => onChange({ priceOnlineTtd: v })}
              showPrice={bothSeatKinds}
            />
          ) : null}
          {offersPhysical ? (
            <SeatFields
              title={bothSeatKinds ? 'In-person seats' : 'Student limit'}
              cap={draft.maxStudentsPhysical}
              price={draft.pricePhysicalTtd}
              enrolled={enrolledPhysical}
              onCap={v => onChange({ maxStudentsPhysical: v })}
              onPrice={v => onChange({ pricePhysicalTtd: v })}
              showPrice={bothSeatKinds}
            />
          ) : null}
        </div>

        {/* Only a tally is worth showing. With one kind of seat the "total"
            is the number the tutor just typed, restated. */}
        {bothSeatKinds ? (
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          Class total:{' '}
          <strong className="font-semibold text-foreground">
            {derivedTotal === null ? 'no limit' : `${derivedTotal} students`}
          </strong>
          . This is worked out from the seats above — you do not set it
          separately.
        </p>
        ) : null}
      </div>

      {venues.length === 0 && draft.classFormat === 'online' ? (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <MapPin aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Pick “In person only” or “Both” and you can add a venue right here.
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
  showPrice,
}: {
  title: string;
  cap: number | null;
  price: number | null;
  enrolled: number;
  onCap: (v: number | null) => void;
  onPrice: (v: number | null) => void;
  /**
   * Only a class offering BOTH kinds of seat can price them differently. On a
   * class that offers one, the class price IS that seat's price and asking a
   * second time is the same question twice — the server already falls back to
   * price_monthly when a seat price is null.
   */
  showPrice: boolean;
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
      {showPrice ? (
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
      ) : null}
    </div>
  );
}
