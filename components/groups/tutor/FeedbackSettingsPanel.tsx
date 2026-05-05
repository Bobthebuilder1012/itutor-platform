'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FeedbackSettings } from '@/lib/types/feedback';

interface FeedbackSettingsPanelProps {
  groupId: string;
  memberCount: number;
}

export default function FeedbackSettingsPanel({ groupId, memberCount }: FeedbackSettingsPanelProps) {
  const [settings, setSettings] = useState<FeedbackSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/feedback/settings`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSettings(data.settings);
    } catch {
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const update = (field: string, value: any) => {
    setSettings((prev) => prev ? { ...prev, [field]: value } : prev);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/feedback/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-6 flex justify-center"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600" /></div>;
  }

  if (!settings) return null;

  const freqLabel = settings.frequency === 'session' ? 'After each session' : settings.frequency === 'weekly' ? 'Weekly' : 'Monthly';
  const freqUnit = settings.frequency === 'session' ? 'session' : settings.frequency === 'weekly' ? 'week' : 'month';

  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-[.08em] text-[#6b7280] mb-4 flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
        Student Feedback
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between py-3">
        <div className="flex-1 mr-4">
          <div className="text-[13px] font-semibold">Enable student feedback</div>
          <div className="text-[11px] text-[#6b7280] mt-px leading-relaxed">Give written feedback to each student on their progress. Feedback is private — students only see their own, and linked parent accounts can also view it.</div>
        </div>
        <div
          onClick={() => update('enabled', !settings.enabled)}
          className={`w-[42px] h-6 rounded-xl cursor-pointer relative transition-colors flex-shrink-0 ${settings.enabled ? 'bg-[#0d9668]' : 'bg-[#d1d5db]'}`}
        >
          <div className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-all ${settings.enabled ? 'left-[21px]' : 'left-[3px]'}`} />
        </div>
      </div>

      {settings.enabled && (
        <>
          {/* Commitment warning */}
          <div className="flex items-start gap-2.5 p-3 rounded-[10px] bg-[#fef3c7] border border-[#fde68a] my-3 text-[12px] leading-relaxed text-[#92400e]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="flex-shrink-0 mt-px"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            <div><strong>Heads up:</strong> Enabling feedback means you commit to writing individual feedback for every student in this class at the frequency you choose. Make sure you have the time to follow through — students and parents will expect it.</div>
          </div>

          {/* Big class warning */}
          {memberCount > 50 && (
            <div className="flex items-start gap-2.5 p-3 rounded-[10px] bg-[#fee2e2] border border-[#fca5a5] mb-3 text-[12px] leading-relaxed text-[#991b1b]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="flex-shrink-0 mt-px"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              <div><strong>Warning: Your class has more than 50 students.</strong> Writing individual feedback for this many students will be very time-consuming. Consider switching to monthly feedback or disabling this feature unless you&apos;re certain you can keep up.</div>
            </div>
          )}

          {/* Frequency & deadline */}
          <div className="grid grid-cols-2 gap-3.5 mt-3.5">
            <div>
              <label className="text-[12.5px] font-semibold block mb-1">Feedback frequency</label>
              <div className="text-[11px] text-[#6b7280] mb-1.5">How often you'll write feedback for each student</div>
              <select
                value={settings.frequency}
                onChange={(e) => update('frequency', e.target.value)}
                className="w-full py-2.5 px-3 border border-[#e4e8ee] rounded-[10px] text-[13px] outline-none focus:border-[#0d9668] focus:shadow-[0_0_0_3px_#d1fae5]"
              >
                <option value="session">After each session</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="text-[12.5px] font-semibold block mb-1">Feedback deadline</label>
              <div className="text-[11px] text-[#6b7280] mb-1.5">Days after period ends to submit feedback</div>
              <select
                value={settings.deadline_days}
                onChange={(e) => update('deadline_days', parseInt(e.target.value))}
                className="w-full py-2.5 px-3 border border-[#e4e8ee] rounded-[10px] text-[13px] outline-none focus:border-[#0d9668] focus:shadow-[0_0_0_3px_#d1fae5]"
              >
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={5}>5 days</option>
                <option value={7}>7 days</option>
              </select>
            </div>
          </div>

          {/* Frequency preview */}
          <div className="flex items-start gap-2.5 p-3 rounded-[10px] bg-[#fef3c7] border border-[#fde68a] mt-3.5 text-[12px] leading-relaxed text-[#92400e]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="flex-shrink-0 mt-px"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            <div><strong>{freqLabel} feedback:</strong> You&apos;ll need to write <strong>{memberCount > 0 ? memberCount : 1}</strong> individual feedback report(s) every {freqUnit}. Make sure this is manageable.</div>
          </div>

          {/* Toggles */}
          <div className="mt-2 divide-y divide-[#f1f5f9]">
            <div className="flex items-center justify-between py-3">
              <div className="flex-1 mr-4">
                <div className="text-[13px] font-semibold">Include quick ratings</div>
                <div className="text-[11px] text-[#6b7280] mt-px">Add star ratings for Participation, Understanding, and Effort alongside your written feedback.</div>
              </div>
              <div
                onClick={() => update('include_ratings', !settings.include_ratings)}
                className={`w-[42px] h-6 rounded-xl cursor-pointer relative transition-colors flex-shrink-0 ${settings.include_ratings ? 'bg-[#0d9668]' : 'bg-[#d1d5db]'}`}
              >
                <div className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-all ${settings.include_ratings ? 'left-[21px]' : 'left-[3px]'}`} />
              </div>
            </div>

            <div className="flex items-center justify-between py-3">
              <div className="flex-1 mr-4">
                <div className="text-[13px] font-semibold">Notify students when feedback is posted</div>
                <div className="text-[11px] text-[#6b7280] mt-px">Students and linked parent accounts receive a notification when new feedback is available.</div>
              </div>
              <div
                onClick={() => update('notify_students', !settings.notify_students)}
                className={`w-[42px] h-6 rounded-xl cursor-pointer relative transition-colors flex-shrink-0 ${settings.notify_students ? 'bg-[#0d9668]' : 'bg-[#d1d5db]'}`}
              >
                <div className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-all ${settings.notify_students ? 'left-[21px]' : 'left-[3px]'}`} />
              </div>
            </div>

            <div className="flex items-center justify-between py-3">
              <div className="flex-1 mr-4">
                <div className="text-[13px] font-semibold">Allow parent account access</div>
                <div className="text-[11px] text-[#6b7280] mt-px">Parent accounts linked to a student can view all feedback given to their child.</div>
              </div>
              <div
                onClick={() => update('allow_parent_access', !settings.allow_parent_access)}
                className={`w-[42px] h-6 rounded-xl cursor-pointer relative transition-colors flex-shrink-0 ${settings.allow_parent_access ? 'bg-[#0d9668]' : 'bg-[#d1d5db]'}`}
              >
                <div className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-all ${settings.allow_parent_access ? 'left-[21px]' : 'left-[3px]'}`} />
              </div>
            </div>
          </div>

          {/* Save */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-[10px] bg-[#0d9668] text-white text-[12px] font-semibold hover:bg-[#047857] transition-colors disabled:opacity-40"
            >
              {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Feedback Settings'}
            </button>
          </div>
        </>
      )}

      {!settings.enabled && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-[10px] bg-[#0d9668] text-white text-[12px] font-semibold hover:bg-[#047857] transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}
