'use client';

/**
 * My Business → Venues. Where a tutor says where their in-person classes meet.
 *
 * THIS IS THE UNBLOCKER, not a nicety. Migration 242 added `class_format` and a
 * `groups_venue_required_check` that refuses a non-online class with no
 * `venue_id` — correct, and it made physical classes unreachable, because there
 * was nothing anywhere that could create a venue. The class editor's format
 * picker is useless until this list has a row in it.
 *
 * WHAT THE ADDRESS IS AND IS NOT. The street address is entered here and shown
 * to students according to each class's `venue_visibility`, which defaults to
 * `after_enrolment`. The REGION is always public — a location filter nobody can
 * see does not work — so the copy says which half is which. A tutor deciding
 * whether to type their home address deserves to know that before they type it,
 * not in a settings page they never open.
 *
 * `capacity` here is the ROOM's size, for the tutor's own reference. It is NOT
 * the seat cap that blocks enrolment: that is `groups.max_students_physical`,
 * because one venue can host several classes. The label says so, because the two
 * numbers being different is exactly what a tutor will assume is a bug.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react';

type Venue = {
  id: string;
  name: string;
  region_id: string;
  address_line: string | null;
  access_instructions: string | null;
  arrival_notes: string | null;
  capacity: number | null;
};

type Region = { id: string; name: string };

type Draft = {
  name: string;
  region_id: string;
  address_line: string;
  access_instructions: string;
  arrival_notes: string;
  capacity: string;
};

const EMPTY_DRAFT: Draft = {
  name: '',
  region_id: '',
  address_line: '',
  access_instructions: '',
  arrival_notes: '',
  capacity: '',
};

const FIELD =
  'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-itutor-green focus:outline-none focus:ring-1 focus:ring-itutor-green';

export default function VenuesTab() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tutor/venues', { cache: 'no-store' });
      const json = await res.json();
      setVenues(json.venues ?? []);
      setRegions(json.regions ?? []);
      setUnavailable(Boolean(json.unavailable));
    } catch {
      setVenues([]);
      setRegions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const regionName = (id: string) => regions.find(r => r.id === id)?.name ?? 'Unknown area';

  const openCreate = () => {
    setEditingId(null);
    setCreating(true);
    setError(null);
    setDraft(EMPTY_DRAFT);
  };

  const openEdit = (venue: Venue) => {
    setCreating(false);
    setEditingId(venue.id);
    setError(null);
    setDraft({
      name: venue.name,
      region_id: venue.region_id,
      address_line: venue.address_line ?? '',
      access_instructions: venue.access_instructions ?? '',
      arrival_notes: venue.arrival_notes ?? '',
      capacity: venue.capacity === null ? '' : String(venue.capacity),
    });
  };

  const close = () => {
    setCreating(false);
    setEditingId(null);
    setError(null);
  };

  const save = async () => {
    if (saving) return;
    setError(null);

    if (!draft.name.trim()) return setError('Give the venue a name.');
    if (!draft.region_id) return setError('Choose the area it is in.');
    if (!draft.address_line.trim()) return setError('Add the street address.');

    setSaving(true);
    try {
      const url = editingId ? `/api/tutor/venues/${editingId}` : '/api/tutor/venues';
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          region_id: draft.region_id,
          address_line: draft.address_line,
          access_instructions: draft.access_instructions,
          arrival_notes: draft.arrival_notes,
          capacity: draft.capacity === '' ? null : draft.capacity,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        // The API names the field it rejected, so the message can point at it
        // rather than saying "something went wrong".
        setError(
          json?.field
            ? `Check the ${json.field.replace(/_/g, ' ')} field.`
            : 'That did not save. Please try again.'
        );
        return;
      }

      close();
      await load();
    } catch {
      setError('That did not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const archive = async (venue: Venue) => {
    setError(null);
    try {
      const res = await fetch(`/api/tutor/venues/${venue.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        if (json?.error === 'venue_in_use') {
          const names = (json.classes ?? []).map((c: { name: string }) => c.name).join(', ');
          // Named rather than generic: a physical class with no venue is an
          // invalid row, so the tutor has to move or change those classes first
          // and needs to know which ones.
          setError(
            `${venue.name} is still used by ${names}. Change those classes to online, or point them at another venue, first.`
          );
          return;
        }
        setError('That did not save. Please try again.');
        return;
      }
      await load();
    } catch {
      setError('That did not save. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading venues…
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        In-person classes are not enabled on this environment yet — migration 242
        has not been applied. Nothing is broken; there is simply nowhere to store
        a venue.
      </div>
    );
  }

  const formOpen = creating || editingId !== null;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Venues</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-600">
            Where your in-person classes meet. Students always see the{' '}
            <strong className="font-semibold">area</strong> so they can find
            classes near them; the{' '}
            <strong className="font-semibold">street address</strong> is shown
            only after they enrol, unless you choose otherwise on the class.
          </p>
        </div>
        {!formOpen ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-itutor-green px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" /> Add a venue
          </button>
        ) : null}
      </header>

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {formOpen ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">
              {editingId ? 'Edit venue' : 'New venue'}
            </h3>
            <button
              type="button"
              onClick={close}
              aria-label="Cancel"
              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Name
              </span>
              <input
                className={FIELD}
                value={draft.name}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Chaguanas Learning Centre"
                maxLength={120}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Area
              </span>
              <select
                className={FIELD}
                value={draft.region_id}
                onChange={e => setDraft(d => ({ ...d, region_id: e.target.value }))}
              >
                <option value="">Choose an area…</option>
                {regions.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[12px] text-gray-500">
                Always visible to students — this is what they filter on.
              </span>
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Street address
              </span>
              <input
                className={FIELD}
                value={draft.address_line}
                onChange={e => setDraft(d => ({ ...d, address_line: e.target.value }))}
                placeholder="e.g. 12 Endeavour Road, Chaguanas"
                maxLength={300}
              />
              <span className="mt-1 block text-[12px] text-gray-500">
                Shown after a student enrols, by default.
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Room capacity <span className="font-normal normal-case">(optional)</span>
              </span>
              <input
                className={FIELD}
                type="number"
                min={1}
                value={draft.capacity}
                onChange={e => setDraft(d => ({ ...d, capacity: e.target.value }))}
                placeholder="e.g. 12"
              />
              {/* The distinction that will otherwise read as a bug. */}
              <span className="mt-1 block text-[12px] text-gray-500">
                Your own note. Seats are set per class, since one venue can host
                several.
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Getting in <span className="font-normal normal-case">(optional)</span>
              </span>
              <input
                className={FIELD}
                value={draft.access_instructions}
                onChange={e => setDraft(d => ({ ...d, access_instructions: e.target.value }))}
                placeholder="e.g. Blue gate, ring the top bell"
                maxLength={1000}
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                Anything else on arrival <span className="font-normal normal-case">(optional)</span>
              </span>
              <textarea
                className={`${FIELD} min-h-[76px]`}
                value={draft.arrival_notes}
                onChange={e => setDraft(d => ({ ...d, arrival_notes: e.target.value }))}
                placeholder="e.g. Parking on the street. Please arrive 5 minutes early."
                maxLength={1000}
              />
            </label>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-itutor-green px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingId ? 'Save changes' : 'Add venue'}
            </button>
            <button
              type="button"
              onClick={close}
              className="text-sm font-medium text-gray-500 transition hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      {venues.length === 0 && !formOpen ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 p-8 text-center">
          <MapPin aria-hidden className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-3 font-semibold text-gray-900">No venues yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-600">
            Add one and you can set a class to meet in person — on its own, or
            alongside the online seats.
          </p>
        </div>
      ) : null}

      {venues.length > 0 ? (
        <ul className="grid gap-3">
          {venues.map(venue => (
            <li
              key={venue.id}
              className="flex items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4"
            >
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">{venue.name}</p>
                <p className="mt-0.5 text-sm text-gray-600">
                  {regionName(venue.region_id)}
                  {venue.address_line ? ` · ${venue.address_line}` : ''}
                </p>
                {venue.capacity !== null ? (
                  <p className="mt-0.5 text-[13px] text-gray-500">
                    Room holds {venue.capacity}
                  </p>
                ) : null}
                {venue.access_instructions ? (
                  <p className="mt-1 text-[13px] text-gray-500">{venue.access_instructions}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => openEdit(venue)}
                  aria-label={`Edit ${venue.name}`}
                  className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => archive(venue)}
                  aria-label={`Remove ${venue.name}`}
                  className="rounded-lg p-2 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
