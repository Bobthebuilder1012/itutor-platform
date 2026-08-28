'use client';

import { DAY_FILTER_OPTIONS, TIME_BANDS, type TimeBand } from '@/lib/utils/scheduleFormat';

export type GroupFiltersState = {
  subject: string;
  difficulty: '' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  recurrenceType: '' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'NONE';
  minPrice: string;
  maxPrice: string;
  /** Day-of-week indices, 0 = Sunday. Empty means no day filter. */
  days: number[];
  timeOfDay: TimeBand[];
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const chipClass = (active: boolean) =>
  `rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
    active
      ? 'border-emerald-500 bg-emerald-500 text-white'
      : 'border-gray-300 bg-white text-gray-700 hover:border-emerald-400'
  }`;

export default function FilterPanel({
  filters,
  onChange,
  onReset,
}: {
  filters: GroupFiltersState;
  onChange: (next: GroupFiltersState) => void;
  onReset: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Filters</h3>
        <button type="button" onClick={onReset} className="text-xs text-blue-600 hover:text-blue-700">
          Reset
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <input
          value={filters.subject}
          onChange={(e) => onChange({ ...filters, subject: e.target.value })}
          placeholder="Subject"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />

        <select
          value={filters.difficulty}
          onChange={(e) => onChange({ ...filters, difficulty: e.target.value as GroupFiltersState['difficulty'] })}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Levels</option>
          <option value="BEGINNER">Beginner</option>
          <option value="INTERMEDIATE">Intermediate</option>
          <option value="ADVANCED">Advanced</option>
        </select>

        <select
          value={filters.recurrenceType}
          onChange={(e) => onChange({ ...filters, recurrenceType: e.target.value as GroupFiltersState['recurrenceType'] })}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Schedules</option>
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="MONTHLY">Monthly</option>
          <option value="NONE">One-time</option>
        </select>

        <div className="grid grid-cols-2 gap-2">
          <input
            value={filters.minPrice}
            onChange={(e) => onChange({ ...filters, minPrice: e.target.value })}
            placeholder="Min $"
            type="number"
            min={0}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            value={filters.maxPrice}
            onChange={(e) => onChange({ ...filters, maxPrice: e.target.value })}
            placeholder="Max $"
            type="number"
            min={0}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Meets on — the filter that actually matters when fitting classes
          around school and work. Only classes with a recurring schedule can
          match, so one-off classes drop out while this is active. */}
      <div className="mt-4 border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold text-gray-700">Meets on</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DAY_FILTER_OPTIONS.map((d) => {
            const active = filters.days.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                aria-pressed={active}
                aria-label={d.label}
                onClick={() => onChange({ ...filters, days: toggle(filters.days, d.value) })}
                className={chipClass(active)}
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs font-semibold text-gray-700">Time of day</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TIME_BANDS.map((b) => {
            const active = filters.timeOfDay.includes(b.value);
            return (
              <button
                key={b.value}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ ...filters, timeOfDay: toggle(filters.timeOfDay, b.value) })}
                className={chipClass(active)}
              >
                {b.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-gray-500">Class times are shown in AST (Trinidad &amp; Tobago).</p>
      </div>
    </div>
  );
}

