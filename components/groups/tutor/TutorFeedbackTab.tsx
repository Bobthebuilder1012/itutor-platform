'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FeedbackSettings, FeedbackPeriodWithEntries, FeedbackEntryWithStudent } from '@/lib/types/feedback';

interface TutorFeedbackTabProps {
  groupId: string;
  memberCount: number;
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = ['#6366f1', '#f59e0b', '#e11d48', '#0891b2', '#7c3aed', '#10b981', '#f97316'];
function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const QUICK_TEMPLATES = [
  'Good effort this week. ',
  'Needs to participate more in class. ',
  'Showing strong understanding of the material. ',
  'Missed a session — please try to attend consistently. ',
  'Great improvement from last week! ',
];

function StarRow({ value, onChange, readonly }: { value: number; onChange?: (v: number) => void; readonly?: boolean }) {
  return (
    <div className="flex gap-[2px]">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          onClick={() => !readonly && onChange?.(i)}
          className={`w-6 h-6 transition-transform ${readonly ? '' : 'cursor-pointer hover:scale-110'} ${i <= value ? 'text-[#f59e0b]' : 'text-[#d1d5db]'}`}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
        </svg>
      ))}
    </div>
  );
}

function dueLabel(dueAt: string): { text: string; urgent: boolean } {
  const diff = new Date(dueAt).getTime() - Date.now();
  if (diff < 0) return { text: 'Overdue', urgent: true };
  const days = Math.ceil(diff / 86400000);
  if (days <= 2) return { text: `Due in ${days} day${days === 1 ? '' : 's'}`, urgent: true };
  return { text: `Due in ${days} days`, urgent: false };
}

export default function TutorFeedbackTab({ groupId, memberCount }: TutorFeedbackTabProps) {
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settings, setSettings] = useState<FeedbackSettings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);

  const [periodsLoading, setPeriodsLoading] = useState(true);
  const [periods, setPeriods] = useState<FeedbackPeriodWithEntries[]>([]);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [formState, setFormState] = useState<Record<string, {
    participation: number;
    understanding: number;
    effort: number;
    comment: string;
  }>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/feedback/settings`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSettings(data.settings);
    } catch {
      setSettings(null);
    } finally {
      setSettingsLoading(false);
    }
  }, [groupId]);

  const fetchPeriods = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/feedback/periods`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPeriods(data.periods ?? []);
    } catch {
      setPeriods([]);
    } finally {
      setPeriodsLoading(false);
    }
  }, [groupId]);

  useEffect(() => { fetchSettings(); fetchPeriods(); }, [fetchSettings, fetchPeriods]);

  const updateSetting = (field: string, value: any) => {
    setSettings((prev) => prev ? { ...prev, [field]: value } : prev);
    setSettingsSaved(false);
  };

  const [settingsError, setSettingsError] = useState('');

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSettingsSaving(true);
    setSettingsError('');
    try {
      const res = await fetch(`/api/groups/${groupId}/feedback/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSettingsSaved(true);
        setTimeout(() => setSettingsSaved(false), 2000);
        fetchPeriods();
      } else {
        const data = await res.json().catch(() => ({}));
        setSettingsError(data.error ?? `Save failed (${res.status})`);
      }
    } catch {
      setSettingsError('Network error — could not save settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const getForm = (entryId: string) =>
    formState[entryId] ?? { participation: 0, understanding: 0, effort: 0, comment: '' };

  const updateForm = (entryId: string, field: string, value: any) => {
    setFormState((prev) => ({
      ...prev,
      [entryId]: { ...getForm(entryId), [field]: value },
    }));
  };

  const handleSubmit = async (entry: FeedbackEntryWithStudent) => {
    const f = getForm(entry.id);
    setSubmitting(entry.id);
    try {
      await fetch(`/api/groups/${groupId}/feedback/entries`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_id: entry.id,
          action: 'submit',
          rating_participation: f.participation || null,
          rating_understanding: f.understanding || null,
          rating_effort: f.effort || null,
          comment: f.comment || null,
        }),
      });
      await fetchPeriods();
      setExpandedEntry(null);
    } finally {
      setSubmitting(null);
    }
  };

  const handleSkip = async (entryId: string) => {
    setSubmitting(entryId);
    try {
      await fetch(`/api/groups/${groupId}/feedback/entries`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_id: entryId, action: 'skip' }),
      });
      await fetchPeriods();
      setExpandedEntry(null);
    } finally {
      setSubmitting(null);
    }
  };

  if (settingsLoading) {
    return <div className="py-8 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" /></div>;
  }

  const freqLabel = settings?.frequency === 'session' ? 'After each session' : settings?.frequency === 'weekly' ? 'Weekly' : 'Monthly';
  const freqUnit = settings?.frequency === 'session' ? 'session' : settings?.frequency === 'weekly' ? 'week' : 'month';

  return (
    <div>
      {/* ─── Settings Section ─── */}
      {settings && (
        <div className="bg-white border border-[#e4e8ee] rounded-[14px] p-[22px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-5">
          <div
            className="text-[11px] font-bold uppercase tracking-[.08em] text-[#6b7280] mb-4 flex items-center gap-2 cursor-pointer select-none"
            onClick={() => setSettingsCollapsed(!settingsCollapsed)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
            Feedback Settings
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              className={`ml-auto transition-transform ${settingsCollapsed ? '' : 'rotate-180'}`}
            ><polyline points="6 9 12 15 18 9" /></svg>
          </div>

          {!settingsCollapsed && <><div className="flex items-center justify-between py-3">
            <div className="flex-1 mr-4">
              <div className="text-[13px] font-semibold">Enable student feedback</div>
              <div className="text-[11px] text-[#6b7280] mt-px leading-relaxed">Give written feedback to each student on their progress. Feedback is private — students only see their own, and linked parent accounts can also view it.</div>
            </div>
            <div
              onClick={() => updateSetting('enabled', !settings.enabled)}
              className={`w-[42px] h-6 rounded-xl cursor-pointer relative transition-colors flex-shrink-0 ${settings.enabled ? 'bg-[#0d9668]' : 'bg-[#d1d5db]'}`}
            >
              <div className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-all ${settings.enabled ? 'left-[21px]' : 'left-[3px]'}`} />
            </div>
          </div>

          {settings.enabled && (
            <>
              <div className="flex items-start gap-2.5 p-3 rounded-[10px] bg-[#fef3c7] border border-[#fde68a] my-3 text-[12px] leading-relaxed text-[#92400e]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="flex-shrink-0 mt-px"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                <div><strong>Heads up:</strong> Enabling feedback means you commit to writing individual feedback for every student in this class at the frequency you choose. Make sure you have the time to follow through — students and parents will expect it.</div>
              </div>

              {memberCount > 50 && (
                <div className="flex items-start gap-2.5 p-3 rounded-[10px] bg-[#fee2e2] border border-[#fca5a5] mb-3 text-[12px] leading-relaxed text-[#991b1b]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="flex-shrink-0 mt-px"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                  <div><strong>Warning: Your class has more than 50 students.</strong> Writing individual feedback for this many students will be very time-consuming. Consider switching to monthly feedback or disabling this feature unless you&apos;re certain you can keep up.</div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3.5 mt-3.5">
                <div>
                  <label className="text-[12.5px] font-semibold block mb-1">Feedback frequency</label>
                  <div className="text-[11px] text-[#6b7280] mb-1.5">How often you&apos;ll write feedback for each student</div>
                  <select
                    value={settings.frequency}
                    onChange={(e) => updateSetting('frequency', e.target.value)}
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
                    onChange={(e) => updateSetting('deadline_days', parseInt(e.target.value))}
                    className="w-full py-2.5 px-3 border border-[#e4e8ee] rounded-[10px] text-[13px] outline-none focus:border-[#0d9668] focus:shadow-[0_0_0_3px_#d1fae5]"
                  >
                    <option value={1}>1 day</option>
                    <option value={3}>3 days</option>
                    <option value={5}>5 days</option>
                    <option value={7}>7 days</option>
                  </select>
                </div>
              </div>

              <div className="mt-2 divide-y divide-[#f1f5f9]">

                <div className="flex items-center justify-between py-3">
                  <div className="flex-1 mr-4">
                    <div className="text-[13px] font-semibold">Notify students when feedback is posted</div>
                    <div className="text-[11px] text-[#6b7280] mt-px">Students and linked parent accounts receive a notification when new feedback is available.</div>
                  </div>
                  <div
                    onClick={() => updateSetting('notify_students', !settings.notify_students)}
                    className={`w-[42px] h-6 rounded-xl cursor-pointer relative transition-colors flex-shrink-0 ${settings.notify_students ? 'bg-[#0d9668]' : 'bg-[#d1d5db]'}`}
                  >
                    <div className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-all ${settings.notify_students ? 'left-[21px]' : 'left-[3px]'}`} />
                  </div>
                </div>

              </div>
            </>
          )}

          {settingsError && (
            <div className="mt-3 p-3 rounded-[10px] bg-[#fee2e2] border border-[#fca5a5] text-[12px] text-[#991b1b]">{settingsError}</div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSaveSettings}
              disabled={settingsSaving}
              className="px-5 py-2 rounded-[10px] bg-[#0d9668] text-white text-[12px] font-semibold hover:bg-[#047857] transition-colors disabled:opacity-40"
            >
              {settingsSaving ? 'Saving…' : settingsSaved ? 'Saved!' : 'Save Feedback Settings'}
            </button>
          </div>
          </>}
        </div>
      )}

      {/* ─── Feedback Periods (only when enabled) ─── */}
      {settings?.enabled && (
        <>
          {periodsLoading ? (
            <div className="py-8 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" /></div>
          ) : periods.length === 0 ? (
            <div className="text-center py-14">
              <div className="w-20 h-20 rounded-[20px] bg-[#f4f6fa] flex items-center justify-center mx-auto mb-4">
                <svg className="w-9 h-9 text-[#64748b] opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
              </div>
              <h3 className="text-base font-bold mb-1.5">No feedback periods yet</h3>
              <p className="text-[13px] text-[#64748b] max-w-[300px] mx-auto">Save your settings above to create the first feedback period.</p>
            </div>
          ) : (
            periods.map((period) => {
              const due = dueLabel(period.due_at);
              const pct = period.total > 0 ? Math.round((period.submitted / period.total) * 100) : 0;
              const barColor = pct >= 80 ? 'bg-[#0d9668]' : pct >= 40 ? 'bg-[#f59e0b]' : 'bg-[#ef4444]';

              return (
                <div key={period.id} className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-[16px] font-bold mb-0.5 capitalize">{period.frequency} Feedback</div>
                      <div className="text-[12px] text-[#6b7280]">{period.period_label}</div>
                    </div>
                    <div className={`flex items-center gap-1 text-[12px] font-medium ${due.urgent ? 'text-[#ef4444]' : 'text-[#6b7280]'}`}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                      {due.text}
                    </div>
                  </div>

                  <div className="mb-[18px]">
                    <div className="h-2 bg-[#f4f6fa] rounded overflow-hidden mb-1">
                      <div className={`h-full rounded transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-[11px] text-[#6b7280]">
                      <span>{period.submitted} of {period.total} completed</span>
                      <span>{period.pending} remaining</span>
                    </div>
                  </div>

                  {period.entries.map((entry) => {
                    const name = entry.student?.full_name ?? 'Student';
                    const isOpen = expandedEntry === entry.id;
                    const isDone = entry.status === 'submitted';
                    const isSkipped = entry.status === 'skipped';
                    const f = getForm(entry.id);

                    return (
                      <div
                        key={entry.id}
                        className={`bg-white border border-[#e4e8ee] rounded-[10px] mb-2.5 overflow-hidden transition-all hover:border-[#0d9668] hover:shadow-[0_4px_14px_rgba(0,0,0,0.06)] ${isDone || isSkipped ? 'opacity-70 hover:opacity-100' : ''}`}
                      >
                        <div
                          className="flex items-center gap-3 px-4 py-[14px] cursor-pointer"
                          onClick={() => setExpandedEntry(isOpen ? null : entry.id)}
                        >
                          <div
                            className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                            style={{ background: avatarColor(entry.student_id) }}
                          >
                            {getInitials(name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[14px] font-semibold truncate">{name}</div>
                            <div className="flex items-center gap-2 text-[11px] text-[#6b7280] mt-px">
                              <span>Student</span>
                              {(entry.sessions_total ?? 0) > 0 && (
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  (entry.sessions_attended ?? 0) / entry.sessions_total! >= 0.8
                                    ? 'bg-[#d1fae5] text-[#047857]'
                                    : (entry.sessions_attended ?? 0) / entry.sessions_total! >= 0.5
                                    ? 'bg-[#fef3c7] text-[#92400e]'
                                    : 'bg-[#fee2e2] text-[#991b1b]'
                                }`}>
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                                  {entry.sessions_attended}/{entry.sessions_total} sessions
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-semibold flex-shrink-0 ${
                            isDone ? 'bg-[#d1fae5] text-[#047857]' :
                            isSkipped ? 'bg-[#f4f6fa] text-[#6b7280]' :
                            'bg-[#fef3c7] text-[#92400e]'
                          }`}>
                            {isDone ? 'Submitted' : isSkipped ? 'Skipped' : 'Pending'}
                          </span>
                          <button className="w-7 h-7 rounded-md flex items-center justify-center text-[#6b7280] hover:bg-[#f4f6fa] flex-shrink-0 transition-colors">
                            <svg
                              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                              className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
                            ><polyline points="6 9 12 15 18 9" /></svg>
                          </button>
                        </div>

                        {isOpen && (
                          <div className="px-4 pb-4 pt-3.5 border-t border-[#f1f5f9]">
                            {(entry.sessions_total ?? 0) > 0 && (
                              <div className="mb-3.5 p-2.5 rounded-[10px] bg-[#f4f6fa] flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                                </div>
                                <div className="flex-1">
                                  <div className="text-[12px] font-semibold">Attendance: {entry.sessions_attended}/{entry.sessions_total} sessions ({Math.round(((entry.sessions_attended ?? 0) / entry.sessions_total!) * 100)}%)</div>
                                  <div className="h-1.5 bg-[#e5e7eb] rounded-full mt-1 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${
                                        (entry.sessions_attended ?? 0) / entry.sessions_total! >= 0.8 ? 'bg-[#0d9668]' :
                                        (entry.sessions_attended ?? 0) / entry.sessions_total! >= 0.5 ? 'bg-[#f59e0b]' : 'bg-[#ef4444]'
                                      }`}
                                      style={{ width: `${Math.round(((entry.sessions_attended ?? 0) / entry.sessions_total!) * 100)}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                            {isDone ? (
                              <>
                                <div className="flex gap-[10px] mb-3.5 flex-wrap">
                                  {entry.rating_participation != null && (
                                    <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                                      <label className="text-[11px] font-semibold text-[#6b7280]">Participation</label>
                                      <StarRow value={entry.rating_participation} readonly />
                                    </div>
                                  )}
                                  {entry.rating_understanding != null && (
                                    <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                                      <label className="text-[11px] font-semibold text-[#6b7280]">Understanding</label>
                                      <StarRow value={entry.rating_understanding} readonly />
                                    </div>
                                  )}
                                  {entry.rating_effort != null && (
                                    <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                                      <label className="text-[11px] font-semibold text-[#6b7280]">Effort</label>
                                      <StarRow value={entry.rating_effort} readonly />
                                    </div>
                                  )}
                                </div>
                                {entry.comment && (
                                  <textarea
                                    readOnly
                                    value={entry.comment}
                                    className="w-full p-[10px] border border-[#e4e8ee] rounded-[10px] text-[13px] min-h-[70px] resize-none bg-[#f4f6fa] outline-none leading-relaxed"
                                  />
                                )}
                              </>
                            ) : (
                              <>
                                <div className="flex gap-[10px] mb-3.5 flex-wrap">
                                  <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                                    <label className="text-[11px] font-semibold text-[#6b7280]">Participation</label>
                                    <StarRow value={f.participation} onChange={(v) => updateForm(entry.id, 'participation', v)} />
                                  </div>
                                  <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                                    <label className="text-[11px] font-semibold text-[#6b7280]">Understanding</label>
                                    <StarRow value={f.understanding} onChange={(v) => updateForm(entry.id, 'understanding', v)} />
                                  </div>
                                  <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                                    <label className="text-[11px] font-semibold text-[#6b7280]">Effort</label>
                                    <StarRow value={f.effort} onChange={(v) => updateForm(entry.id, 'effort', v)} />
                                  </div>
                                </div>

                                <textarea
                                  value={f.comment}
                                  onChange={(e) => updateForm(entry.id, 'comment', e.target.value)}
                                  placeholder={`Write feedback for ${name}...`}
                                  className="w-full p-[10px] border border-[#e4e8ee] rounded-[10px] text-[13px] min-h-[70px] resize-y outline-none leading-relaxed transition-colors focus:border-[#0d9668] focus:shadow-[0_0_0_3px_#d1fae5] placeholder:text-[#9ca3af]"
                                />

                                <div className="flex gap-[5px] flex-wrap mt-2 mb-3">
                                  {QUICK_TEMPLATES.map((tpl) => (
                                    <button
                                      key={tpl}
                                      type="button"
                                      onClick={() => updateForm(entry.id, 'comment', f.comment + tpl)}
                                      className="px-2.5 py-1 rounded-[14px] text-[11px] font-medium border border-[#e4e8ee] bg-white text-[#6b7280] transition-colors hover:border-[#0d9668] hover:text-[#0d9668] hover:bg-[#d1fae5]"
                                    >
                                      {tpl.trim().replace(/\.$/, '')}
                                    </button>
                                  ))}
                                </div>

                                <div className="flex justify-between items-center mt-2.5">
                                  <button
                                    type="button"
                                    onClick={() => handleSkip(entry.id)}
                                    disabled={submitting === entry.id}
                                    className="text-[12px] text-[#6b7280] px-3 py-1.5 rounded-[10px] hover:bg-[#f4f6fa] hover:text-[#111827] transition-colors disabled:opacity-40"
                                  >
                                    Skip this student
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSubmit(entry)}
                                    disabled={submitting === entry.id}
                                    className="flex items-center gap-[5px] px-5 py-2 rounded-[10px] bg-[#0d9668] text-white text-[12px] font-semibold hover:bg-[#047857] transition-colors disabled:opacity-40"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width="14" height="14"><polyline points="20 6 9 17 4 12" /></svg>
                                    {submitting === entry.id ? 'Saving…' : 'Submit Feedback'}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
