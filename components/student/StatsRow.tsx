'use client';

type StatsRowProps = {
  completedSessions: number;
  totalHours: number;
  loading: boolean;
};

export default function StatsRow({ 
  completedSessions, 
  totalHours, 
  loading 
}: StatsRowProps) {
  const hasStats = completedSessions > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Completed Sessions */}
      <div className="bg-white border-2 border-blue-200 shadow-md rounded-2xl p-6 hover:shadow-lg transition-all group">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-blue-600 mb-2 font-medium">Completed Sessions</p>
            <p className="text-4xl font-bold text-blue-600 mb-1">
              {loading ? '...' : completedSessions}
            </p>
            {!hasStats && !loading && (
              <p className="text-xs text-gray-500">
                Start your first session to build your streak.
              </p>
            )}
          </div>
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 shadow-md group-hover:scale-110 transition-transform duration-300">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Total Hours Learned */}
      <div className="bg-white border-2 border-green-200 shadow-md rounded-2xl p-6 hover:shadow-lg transition-all group">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-green-600 mb-2 font-medium">Total Hours Learned</p>
            <p className="text-4xl font-bold text-green-600 mb-1">
              {loading ? '...' : totalHours}
            </p>
            {!hasStats && !loading && (
              <p className="text-xs text-gray-500">
                Start your first session to build your streak.
              </p>
            )}
          </div>
          <div className="bg-gradient-to-br from-itutor-green to-emerald-600 rounded-2xl p-4 shadow-md group-hover:scale-110 transition-transform duration-300">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}



