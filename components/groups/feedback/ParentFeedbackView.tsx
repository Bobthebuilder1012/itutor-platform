'use client';

import { useCallback, useEffect, useState } from 'react';
import type { StudentFeedbackCard } from '@/lib/types/feedback';

interface ParentFeedbackViewProps {
  groupId: string;
  childId: string;
  groupName: string;
  tutorName: string;
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
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

export default function ParentFeedbackView({ groupId, childId, groupName, tutorName }: ParentFeedbackViewProps) {
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<StudentFeedbackCard[]>([]);
  const [childName, setChildName] = useState('Student');

  const fetchFeedback = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/feedback/parent/${childId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCards(data.feedback ?? []);
      if (data.child?.full_name) setChildName(data.child.full_name);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [groupId, childId]);

  useEffect(() => { fetchFeedback(); }, [fetchFeedback]);

  if (loading) {
    return <div className="py-8 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" /></div>;
  }

  return (
    <div>
      {/* Parent header */}
      <div className="flex items-center gap-3 px-[18px] py-4 bg-white border border-[#e4e8ee] rounded-[14px] mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="w-10 h-10 rounded-full bg-[#6366f1] text-white flex items-center justify-center text-[14px] font-bold">
          {getInitials(childName)}
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-bold">{childName}&apos;s Progress</div>
          <div className="text-[12px] text-[#6b7280]">{groupName} &middot; Tutor: {tutorName}</div>
        </div>
        <span className="px-3 py-1 rounded-md bg-[#ede9fe] text-[#7c3aed] text-[11px] font-semibold">Parent Account</span>
      </div>

      {cards.length === 0 ? (
        <div className="text-center py-14">
          <svg className="w-10 h-10 opacity-30 mx-auto mb-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
          <h3 className="text-[15px] font-bold mb-1">No feedback yet</h3>
          <p className="text-[12.5px] text-[#6b7280] max-w-[280px] mx-auto">The tutor hasn&apos;t submitted any feedback for {childName} yet.</p>
        </div>
      ) : (
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
        </div>
      )}
    </div>
  );
}
