'use client';

import { Session } from '@/lib/types/database';

type NextStepCardProps = {
  upcomingSessions: Session[];
  subjects: string[] | null | undefined;
  onFindTutor: () => void;
  onAddSubjects: () => void;
};

const cardBase = 'bg-white border border-gray-100 rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200';
const iconPill = 'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-itutor-green/10 text-itutor-green';
const btnPrimary = 'inline-flex items-center gap-2 px-5 py-2.5 bg-itutor-green hover:bg-emerald-600 text-black font-semibold rounded-xl transition-all text-sm';
const btnOutline = 'inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 hover:border-itutor-green hover:text-itutor-green text-gray-600 font-medium rounded-xl transition-all text-sm';

export default function NextStepCard({ upcomingSessions, subjects, onFindTutor, onAddSubjects }: NextStepCardProps) {
  const hasUpcomingSessions = upcomingSessions.length > 0;
  const hasSubjects = subjects && subjects.length > 0;
  const topSubject = subjects && subjects.length > 0 ? subjects[0] : null;

  if (hasUpcomingSessions) {
    return (
      <div className={cardBase}>
        <div className="flex items-start gap-4">
          <div className={iconPill}>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900 mb-1">You're all set ✅</h2>
            <p className="text-sm text-gray-500 mb-4">Your next session is coming up.</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={onFindTutor} className={btnPrimary}>View session</button>
              <button onClick={onFindTutor} className={btnOutline}>Find another iTutor</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!hasSubjects) {
    return (
      <div className={cardBase}>
        <div className="flex items-start gap-4">
          <div className={iconPill}>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Your next step</h2>
            <p className="text-sm text-gray-500 mb-4">Add subjects to get personalised iTutor matches.</p>
            <button onClick={onAddSubjects} className={btnPrimary}>Add Subjects</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${cardBase} border-l-4 border-l-itutor-green`}>
      <div className="flex items-start gap-4">
        <div className={iconPill}>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-itutor-green mb-1">Your next step</p>
          <h2 className="text-xl font-bold text-gray-900 mb-1">{topSubject}</h2>
          <p className="text-sm text-gray-500 mb-4">You haven't found a tutor for this subject yet. Connect with a verified iTutor and start making progress today.</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={onFindTutor} className={btnPrimary}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" strokeWidth={2} />
                <path d="m21 21-4.35-4.35" strokeWidth={2} strokeLinecap="round" />
              </svg>
              Find an iTutor
            </button>
            <button onClick={onAddSubjects} className={btnOutline}>Edit my subjects</button>
          </div>
        </div>
      </div>
    </div>
  );
}
