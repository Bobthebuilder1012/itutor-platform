'use client';

export type GroupFiltersState = {
  subject: string;
  difficulty: '' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  recurrenceType: '' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'NONE';
  minPrice: string;
  maxPrice: string;
};

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
    </div>
  );
}

