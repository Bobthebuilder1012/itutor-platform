'use client';

/**
 * Format and Where — the controls for finding a class you can actually get to.
 *
 * Its own component because the spec asks for it on every browse surface, and a
 * second copy would diverge on the first change. The rule it drives lives in
 * `lib/classes/locationFilter.ts`, deliberately apart from any component, so the
 * one non-obvious part is testable without a browser.
 *
 * ── THE TOGGLE IS THE WHOLE POINT ───────────────────────────────────────────
 * "Also show online classes" is on by default and appears only once a region is
 * chosen, because it has no meaning before that. It exists because picking a
 * town means "what can I attend from here", and an online class is attendable
 * from anywhere — so the default has to include them. Off is the narrower,
 * deliberate intent: someone who specifically wants a room.
 *
 * It is a visible control rather than an invisible rule so the visitor can see
 * why an online class is in their town's results. Without it the list looks
 * like the filter is not working.
 *
 * Hidden entirely when there are no regions — an environment without migration
 * 242 has nowhere for a class to meet, so a Where control would offer one
 * option and narrow nothing.
 */

import { MapPin } from 'lucide-react';
import type { FormatFilter, LocationFilterState } from '@/lib/classes/locationFilter';

const FORMATS: Array<{ value: FormatFilter; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: 'online', label: 'Online' },
  { value: 'in_person', label: 'In person' },
];

export default function LocationFilter({
  value,
  onChange,
  regions,
}: {
  value: LocationFilterState;
  onChange: (next: LocationFilterState) => void;
  regions: Array<{ id: string; name: string }>;
}) {
  if (regions.length === 0) return null;

  const set = (patch: Partial<LocationFilterState>) => onChange({ ...value, ...patch });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Format — a segmented control, because there are three mutually
          exclusive options and a dropdown would hide two of them. */}
      <div
        role="group"
        aria-label="Class format"
        className="inline-flex rounded-xl bg-muted p-1"
      >
        {FORMATS.map((f) => {
          const selected = value.format === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => set({ format: f.value })}
              aria-pressed={selected}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                selected ? 'bg-background text-ink shadow-sm' : 'text-muted-foreground hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Where */}
      <label className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2">
        <MapPin aria-hidden className="size-3.5 text-muted-foreground" />
        <span className="sr-only">Area</span>
        <select
          value={value.regionId ?? ''}
          onChange={(e) => set({ regionId: e.target.value || null })}
          className="bg-transparent text-xs font-semibold text-ink focus:outline-none"
        >
          <option value="">Anywhere</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      {/* Only once a region is chosen — before that it narrows nothing, and an
          always-visible toggle with no effect trains people to ignore it.
          Hidden for 'in person' too: that choice already excludes online, so
          offering to add it back would contradict the control above. */}
      {value.regionId && value.format !== 'in_person' ? (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={value.alsoShowOnline}
            onChange={(e) => set({ alsoShowOnline: e.target.checked })}
            className="size-3.5 rounded border-border text-brand focus:ring-brand"
          />
          Also show online classes
        </label>
      ) : null}
    </div>
  );
}
