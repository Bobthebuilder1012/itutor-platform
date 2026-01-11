'use client';

type LearningJourneyCardProps = {
  completedSessions: number;
  totalHours: number;
  subjects: number;
};

export default function LearningJourneyCard({ 
  completedSessions, 
  totalHours, 
  subjects 
}: LearningJourneyCardProps) {
  const hasProgress = completedSessions > 0;

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-2xl p-4 sm:p-6 md:p-8 shadow-md">
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 mb-6">
        <div className="bg-amber-500 rounded-full p-3 flex-shrink-0">
          <svg className="h-6 w-6 sm:h-8 sm:w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <div className="flex-1 text-center sm:text-left">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Your learning journey</h2>
          {hasProgress ? (
            <p className="text-sm sm:text-base text-gray-700">Keep up the great work!</p>
          ) : (
            <p className="text-sm sm:text-base text-gray-600">Progress appears here after your first session.</p>
          )}
        </div>
      </div>

      {hasProgress ? (
        <div className="space-y-4">
          {/* Progress Items */}
          <div className="flex items-center gap-3">
            <div className="bg-green-500 rounded-full p-2">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-600">Sessions completed</p>
              <p className="text-xl font-bold text-gray-900">{completedSessions}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-blue-500 rounded-full p-2">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-600">Hours learned</p>
              <p className="text-xl font-bold text-gray-900">{totalHours}</p>
            </div>
          </div>

          {subjects > 0 && (
            <div className="flex items-center gap-3">
              <div className="bg-purple-500 rounded-full p-2">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-600">Subjects in progress</p>
                <p className="text-xl font-bold text-gray-900">{subjects}</p>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          <div className="pt-4">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Learning streak</span>
              <span>{completedSessions} session{completedSessions !== 1 ? 's' : ''}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-itutor-green to-emerald-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min((completedSessions / 10) * 100, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {completedSessions < 10 
                ? `${10 - completedSessions} more session${10 - completedSessions !== 1 ? 's' : ''} to reach your first milestone!`
                : 'Milestone reached! Keep going! 🎉'
              }
            </p>
          </div>
        </div>
      ) : (
        <div className="text-center py-6">
          <div className="bg-amber-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-3">
            <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-600 text-sm">
            Your learning progress will appear here once you complete your first session
          </p>
        </div>
      )}
    </div>
  );
}











