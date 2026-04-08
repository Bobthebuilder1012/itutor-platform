'use client';

import { useCallback, useEffect, useState } from 'react';
import type { StudentFeedbackCard } from '@/lib/types/feedback';

interface StudentFeedbackTabProps {
  groupId: string;
}

const FREQ_STYLE: Record<string, { bg: string; text: string }> = {
  weekly: { bg: 'bg-[#eef2ff]', text: 'text-[#6366f1]' },
  monthly: { bg: 'bg-[#dbeafe]', text: 'text-[#1d4ed8]' },
  session: { bg: 'bg-[#d1fae5]', text: 'text-[#047857]' },
};

function StarDisplay({ value }: { value: number | null }) {
  if (value == null) return null;
  return (
    <div className="flex gap-[2px] justify-center">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          className={`w-4 h-4 ${i <= value ? 'text-[#f59e0b]' : 'text-[#e5e7eb]'}`}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
        </svg>
      ))}
    </div>
  );
}

export default function StudentFeedbackTab({ groupId }: StudentFeedbackTabProps) {
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<StudentFeedbackCard[]>([]);

  const fetchFeedback = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/feedback/student`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCards(data.feedback ?? []);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { fetchFeedback(); }, [fetchFeedback]);

  if (loading) {
    return <div className="py-8 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" /></div>;
  }

  if (cards.length === 0) {
    return (
      <div className="text-center py-14">
        <svg className="w-10 h-10 opacity-30 mx-auto mb-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
        <h3 className="text-[15px] font-bold mb-1">No feedback yet</h3>
        <p className="text-[12.5px] text-[#6b7280] max-w-[280px] mx-auto">Your tutor hasn't submitted any feedback for you yet. Check back later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {cards.map((c) => {
        const style = FREQ_STYLE[c.frequency] ?? FREQ_STYLE.weekly;
        const hasRatings = c.rating_participation != null || c.rating_understanding != null || c.rating_effort != null;

        return (
          <div key={c.id} className="bg-white border border-[#e4e8ee] rounded-[14px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="px-[18px] py-4 flex items-center gap-3 border-b border-[#e4e8ee]">
              <span className={`px-3 py-1 rounded-md text-[11px] font-semibold capitalize ${style.bg} ${style.text}`}>{c.frequency}</span>
              <div className="text-[13px] font-semibold flex-1">{c.period_label}</div>
              <div className="text-[11px] text-[#6b7280]">By {c.tutor_name}</div>
            </div>

            <div className="p-[18px]">
              {(c.sessions_total ?? 0) > 0 && (
                <div className="mb-3.5 p-2.5 rounded-[10px] bg-[#f4f6fa] flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-[12px] font-semibold">Attendance: {c.sessions_attended}/{c.sessions_total} sessions ({Math.round(((c.sessions_attended ?? 0) / c.sessions_total!) * 100)}%)</div>
                    <div className="h-1.5 bg-[#e5e7eb] rounded-full mt-1 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          (c.sessions_attended ?? 0) / c.sessions_total! >= 0.8 ? 'bg-[#0d9668]' :
                          (c.sessions_attended ?? 0) / c.sessions_total! >= 0.5 ? 'bg-[#f59e0b]' : 'bg-[#ef4444]'
                        }`}
                        style={{ width: `${Math.round(((c.sessions_attended ?? 0) / c.sessions_total!) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {hasRatings && (
                <div className="flex gap-4 mb-3.5 flex-wrap">
                  {c.rating_participation != null && (
                    <div className="text-center">
                      <div className="text-[10px] text-[#6b7280] mb-1">Participation</div>
                      <StarDisplay value={c.rating_participation} />
                    </div>
                  )}
                  {c.rating_understanding != null && (
                    <div className="text-center">
                      <div className="text-[10px] text-[#6b7280] mb-1">Understanding</div>
                      <StarDisplay value={c.rating_understanding} />
                    </div>
                  )}
                  {c.rating_effort != null && (
                    <div className="text-center">
                      <div className="text-[10px] text-[#6b7280] mb-1">Effort</div>
                      <StarDisplay value={c.rating_effort} />
                    </div>
                  )}
                </div>
              )}

              {c.comment && (
                <div className="text-[14px] leading-[1.65] p-3.5 bg-[#f4f6fa] rounded-[10px] border-l-[3px] border-[#0d9668]">
                  {c.comment}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div className="text-center py-6">
        <svg className="w-10 h-10 opacity-30 mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
        <h3 className="text-[15px] font-bold mb-1">That&apos;s all your feedback so far</h3>
        <p className="text-[12.5px] text-[#6b7280] max-w-[280px] mx-auto">New feedback will appear here as your tutor submits it.</p>
      </div>
    </div>
  );
}
