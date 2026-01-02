'use client';

import { Session } from '@/lib/types/database';

type NextStepCardProps = {
  upcomingSessions: Session[];
  subjects: string[] | null;
  onFindTutor: () => void;
  onAddSubjects: () => void;
};

export default function NextStepCard({ 
  upcomingSessions, 
  subjects, 
  onFindTutor, 
  onAddSubjects 
}: NextStepCardProps) {
  const hasUpcomingSessions = upcomingSessions.length > 0;
  const hasSubjects = subjects && subjects.length > 0;
  const topSubject = subjects && subjects.length > 0 ? subjects[0] : null;

  if (hasUpcomingSessions) {
    return (
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-2xl p-8 shadow-md hover:shadow-lg transition-shadow">
        <div className="flex items-start gap-4">
          <div className="bg-green-500 rounded-full p-3 flex-shrink-0">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">You're all set ✅</h2>
            <p className="text-gray-700 mb-4">Your next session is coming up</p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={onFindTutor}
                className="px-6 py-3 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-black rounded-lg font-semibold shadow-md hover:shadow-lg transition-all"
              >
                View session
              </button>
              <button
                onClick={onFindTutor}
                className="px-6 py-3 bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-200 rounded-lg font-medium transition-all"
              >
                Find another iTutor
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!hasSubjects) {
    return (
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-8 shadow-md hover:shadow-lg transition-shadow">
        <div className="flex items-start gap-4">
          <div className="bg-blue-500 rounded-full p-3 flex-shrink-0">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Your next step</h2>
            <p className="text-gray-700 mb-4">Add subjects to get personalised iTutor matches</p>
            <button
              onClick={onAddSubjects}
              className="px-6 py-3 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-black rounded-lg font-semibold shadow-md hover:shadow-lg transition-all"
            >
              Add Subjects
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-2xl p-8 shadow-md hover:shadow-lg transition-shadow">
      <div className="flex items-start gap-4">
        <div className="bg-purple-500 rounded-full p-3 flex-shrink-0">
          <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Your next step</h2>
          <p className="text-gray-700 mb-4">
            Find an iTutor for <span className="font-semibold text-purple-700">{topSubject}</span>
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onFindTutor}
              className="px-6 py-3 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-black rounded-lg font-semibold shadow-md hover:shadow-lg transition-all"
            >
              Find an iTutor
            </button>
            <button
              onClick={onAddSubjects}
              className="px-6 py-3 bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-200 rounded-lg font-medium transition-all"
            >
              Edit my subjects
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

