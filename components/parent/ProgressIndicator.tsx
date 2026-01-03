type Progress = {
  subject: string;
  status: 'Improving' | 'Stable' | 'Needs Attention';
};

type ProgressIndicatorProps = {
  progressData: Progress[];
};

export default function ProgressIndicator({ progressData }: ProgressIndicatorProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Improving':
        return {
          bg: 'bg-green-900/30',
          border: 'border-green-700/50',
          text: 'text-green-400',
          icon: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          ),
        };
      case 'Stable':
        return {
          bg: 'bg-blue-900/30',
          border: 'border-blue-700/50',
          text: 'text-blue-400',
          icon: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
            </svg>
          ),
        };
      case 'Needs Attention':
        return {
          bg: 'bg-orange-900/30',
          border: 'border-orange-700/50',
          text: 'text-orange-400',
          icon: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
        };
      default:
        return {
          bg: 'bg-gray-900/30',
          border: 'border-gray-700/50',
          text: 'text-gray-400',
          icon: null,
        };
    }
  };

  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 shadow-2xl rounded-2xl p-6 mb-6">
      <h2 className="text-2xl font-bold text-itutor-white mb-6">Progress Indicators</h2>
      
      {progressData.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {progressData.map((item) => {
            const statusStyle = getStatusColor(item.status);
            return (
              <div
                key={item.subject}
                className={`${statusStyle.bg} border ${statusStyle.border} rounded-xl p-4 hover:scale-105 transition-transform duration-200`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold text-itutor-white">{item.subject}</h3>
                  <div className={statusStyle.text}>
                    {statusStyle.icon}
                  </div>
                </div>
                <p className={`text-sm font-semibold ${statusStyle.text}`}>
                  {item.status}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="bg-gray-800 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-gray-400">Progress data not yet available</p>
        </div>
      )}

      <div className="mt-6 bg-gray-900/50 rounded-lg p-4 border border-gray-700">
        <p className="text-sm text-gray-400">
          <span className="font-semibold text-itutor-green">Note:</span> Progress indicators are based on tutor observations and session performance. They do not reflect grades or test scores.
        </p>
      </div>
    </div>
  );
}









