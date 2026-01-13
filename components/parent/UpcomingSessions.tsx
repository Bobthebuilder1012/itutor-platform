type Session = {
  id: string;
  date: string;
  time: string;
  subject: string;
  tutorName: string;
  sessionType: 'online' | 'in_person';
};

type UpcomingSessionsProps = {
  sessions: Session[];
};

export default function UpcomingSessions({ sessions }: UpcomingSessionsProps) {
  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 shadow-2xl rounded-2xl p-6 mb-6">
      <h2 className="text-2xl font-bold text-itutor-white mb-6">Upcoming Sessions</h2>
      
      {sessions.length > 0 ? (
        <div className="space-y-4">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 hover:bg-gray-800 hover:border-itutor-green/50 transition-all duration-200"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold text-itutor-white">{session.subject}</h3>
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                      session.sessionType === 'online'
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                        : 'bg-gradient-to-r from-purple-500 to-purple-600 text-white'
                    }`}>
                      {session.sessionType === 'online' ? 'Online' : 'In-Person'}
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm mb-1">
                    <span className="font-medium text-itutor-green">Tutor:</span> {session.tutorName}
                  </p>
                  <p className="text-gray-400 text-sm">
                    <span className="font-medium text-itutor-green">Date:</span> {session.date} at {session.time}
                  </p>
                </div>
                
                {session.sessionType === 'online' && (
                  <button className="bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white px-6 py-2.5 rounded-lg font-semibold shadow-lg hover:shadow-itutor-green/50 transition-all duration-300 whitespace-nowrap">
                    Join Session
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="bg-gray-800 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-gray-400">No upcoming sessions scheduled</p>
        </div>
      )}
    </div>
  );
}















