'use client';

type LearningJourneyCardProps = {
  completedSessions: number;
  totalHours: number;
  subjects: number;
};

export default function LearningJourneyCard({ completedSessions, totalHours, subjects }: LearningJourneyCardProps) {
  const hasProgress = completedSessions > 0;
  const streakPct = Math.min((completedSessions / 10) * 100, 100);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      {/* Card header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-itutor-green/10 text-itutor-green flex items-center justify-center">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          <h2 className="text-base font-bold text-gray-900">Your Learning Journey</h2>
        </div>
        <span className="text-xs text-gray-400">
          {hasProgress ? 'Keep it up!' : 'Progress appears after your first session'}
        </span>
      </div>

      {hasProgress ? (
        <div className="space-y-5">
          {/* Mini stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Sessions', value: completedSessions, color: 'text-itutor-green' },
              { label: 'Hours', value: totalHours, color: 'text-gray-900' },
              { label: 'Subjects', value: subjects, color: 'text-gray-900' },
            ].map((s) => (
              <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                <p className={`text-2xl font-bold leading-none mb-1 ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              <span>Learning streak</span>
              <span className="font-semibold text-itutor-green">{completedSessions} / 10 sessions</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-itutor-green rounded-full transition-all duration-700"
                style={{ width: `${streakPct}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {completedSessions < 10
                ? `${10 - completedSessions} more session${10 - completedSessions !== 1 ? 's' : ''} to reach your first milestone!`
                : 'Milestone reached! Keep going! 🎉'}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 bg-gray-50 border border-gray-100 rounded-xl p-4">
          <div className="text-3xl">🎯</div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900 mb-0.5">Ready to begin?</p>
            <p className="text-xs text-gray-500 leading-relaxed">Your learning progress will appear here once you complete your first session.</p>
          </div>
        </div>
      )}
    </div>
  );
}
