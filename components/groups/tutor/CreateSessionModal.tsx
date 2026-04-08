'use client';

import { useState } from 'react';
import type { CreateGroupSessionInput, DayOfWeek, RecurrenceType } from '@/lib/types/groups';

interface CreateSessionModalProps {
  groupId: string;
  onCreated: () => void;
  onClose: () => void;
}

const DAY_LABELS: Record<number, string> = {
  0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat',
};

export default function CreateSessionModal({ groupId, onCreated, onClose }: CreateSessionModalProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<CreateGroupSessionInput>({
    title: '',
    recurrence_type: 'none',
    recurrence_days: [],
    start_time: '09:00',
    duration_minutes: 60,
    starts_on: today,
    ends_on: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggleDay = (day: DayOfWeek) => {
    const current = form.recurrence_days ?? [];
    const updated = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort();
    setForm({ ...form, recurrence_days: updated as DayOfWeek[] });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Session title is required'); return; }
    if (form.recurrence_type === 'weekly' && (!form.recurrence_days || form.recurrence_days.length === 0)) {
      setError('Select at least one day for weekly recurrence'); return;
    }

    setSubmitting(true);
    setError('');
    try {
      const payload = {
        ...form,
        starts_on: form.recurrence_type !== 'none' ? today : form.starts_on,
        ends_on: undefined,
      };
      const res = await fetch(`/api/groups/${groupId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create session');
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Add Session</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Session Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Algebra 1 Weekly"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
              <input
                type="number"
                min={15}
                max={480}
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) || 60 })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recurrence</label>
            <div className="flex gap-2">
              {(['none', 'weekly', 'daily'] as RecurrenceType[]).map((rt) => (
                <button
                  key={rt}
                  type="button"
                  onClick={() => setForm({ ...form, recurrence_type: rt })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                    form.recurrence_type === rt
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400'
                  }`}
                >
                  {rt === 'none' ? 'One-time' : rt}
                </button>
              ))}
            </div>
          </div>

          {form.recurrence_type === 'weekly' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Days</label>
              <div className="flex gap-1.5">
                {([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]).map((day) => {
                  const selected = (form.recurrence_days ?? []).includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        selected
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400'
                      }`}
                    >
                      {DAY_LABELS[day]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {form.recurrence_type === 'none' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Session Date <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={form.starts_on}
                onChange={(e) => setForm({ ...form, starts_on: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-xs text-gray-400 mt-1">The date this one-time session will take place.</p>
            </div>
          )}

          {form.recurrence_type !== 'none' && (
            <div className="flex items-start gap-2 p-3 bg-indigo-50 rounded-lg text-[11px] text-indigo-600 leading-relaxed">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="flex-shrink-0 mt-px"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              <span>Sessions start from the nearest upcoming day you selected. They repeat automatically until the class is archived.</span>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
              {submitting ? 'Saving…' : 'Add Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
