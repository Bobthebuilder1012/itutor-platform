'use client';

import Link from 'next/link';
import { Session } from '@/lib/types/database';

type EnrichedSession = Session & {
  tutor?: {
    id: string;
    full_name?: string;
    display_name?: string;
    username?: string;
  } | null;
  subject?: {
    id: string;
    label?: string;
    name?: string;
  } | null;
};

type UpcomingSessionsCardProps = {
  sessions: EnrichedSession[];
  loading: boolean;
  onViewSession?: (sessionId: string) => void;
};

export default function UpcomingSessionsCard({ 
  sessions, 
  loading,
  onViewSession 
}: UpcomingSessionsCardProps) {
  const getTutorName = (tutor: EnrichedSession['tutor']) => {
    if (!tutor) return 'Tutor';
    return tutor.display_name || tutor.full_name || tutor.username || 'Tutor';
  };

  const getSubjectName = (subject: EnrichedSession['subject']) => {
    if (!subject) return 'Session';
    return subject.label || subject.name || 'Session';
  };

  if (loading) {
    return (
      <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-md">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Your next session</h2>
        <p className="text-gray-600">Loading sessions...</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-md">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Your next session</h2>
        <div className="text-center py-8">
          <div className="bg-gray-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
            <svg className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-gray-700 mb-2 text-lg">No upcoming sessions yet</p>
          <p className="text-gray-500 mb-6">Let's book your first one 🌱</p>
          <Link 
            href="/student/find-tutors"
            className="inline-block px-6 py-3 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-black rounded-lg font-semibold shadow-md hover:shadow-lg transition-all"
          >
            Find an iTutor
          </Link>
        </div>
      </div>
    );
  }

  const nextSession = sessions[0];

  // Calculate display status
  const sessionStart = new Date(nextSession.scheduled_start_at);
  const sessionEnd = new Date(sessionStart.getTime() + (nextSession.duration_minutes || 60) * 60000);
  const now = new Date();
  const sessionStatus = nextSession.status?.toUpperCase();
  
  let displayStatus = 'Unknown';
  let statusColor = 'bg-gradient-to-r from-gray-500 to-gray-600 text-white';
  
  // Check if session has ended
  const hasEnded = now > sessionEnd;
  // Check if session is in progress (between start and end time)
  const isInProgress = now >= sessionStart && now <= sessionEnd;
  
  if (sessionStatus === 'CANCELLED') {
    displayStatus = 'Cancelled';
    statusColor = 'bg-gradient-to-r from-red-500 to-red-600 text-white';
  } else if (sessionStatus === 'COMPLETED' || sessionStatus === 'COMPLETED_ASSUMED') {
    displayStatus = 'Completed';
    statusColor = 'bg-gradient-to-r from-green-500 to-emerald-600 text-white';
  } else if (sessionStatus === 'NO_SHOW_STUDENT') {
    displayStatus = 'No Show';
    statusColor = 'bg-gradient-to-r from-orange-500 to-orange-600 text-white';
  } else if (isInProgress && (sessionStatus === 'SCHEDULED' || sessionStatus === 'JOIN_OPEN')) {
    // Session is currently happening
    displayStatus = 'In Progress';
    statusColor = 'bg-gradient-to-r from-purple-500 to-purple-600 text-white';
  } else if (hasEnded && (sessionStatus === 'SCHEDULED' || sessionStatus === 'JOIN_OPEN')) {
    // Session has ended but not marked complete
    displayStatus = 'Past (Not Completed)';
    statusColor = 'bg-gradient-to-r from-gray-500 to-gray-600 text-white';
  } else if (sessionStatus === 'SCHEDULED' || sessionStatus === 'BOOKED' || sessionStatus === 'JOIN_OPEN') {
    // Session is upcoming
    displayStatus = 'Upcoming';
    statusColor = 'bg-gradient-to-r from-blue-500 to-purple-500 text-white';
  }

  return (
    <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-md hover:shadow-lg transition-shadow">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Your next session</h2>
        <Link 
          href="/student/sessions"
          className="text-sm text-itutor-green hover:text-emerald-600 font-medium flex items-center gap-1 transition-colors"
        >
          View all →
        </Link>
      </div>

      <div className="bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              {getSubjectName(nextSession.subject)}
            </h3>
            {nextSession.tutor && (
              <p className="text-gray-700 mb-1">
                with <span className="font-semibold">{getTutorName(nextSession.tutor)}</span>
              </p>
            )}
          </div>
          <span className={`px-3 py-1 text-xs font-semibold rounded-full shadow-md ${statusColor}`}>
            {displayStatus}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-gray-700 mb-4">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="font-medium">
              {new Date(nextSession.scheduled_start_at).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </span>
          </div>
          <span className="hidden sm:inline text-gray-400">•</span>
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              {new Date(nextSession.scheduled_start_at).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit'
              })}
              {' • '}
              {nextSession.duration_minutes} min
            </span>
          </div>
        </div>

        {onViewSession && (
          <button
            onClick={() => onViewSession(nextSession.id)}
            className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-black rounded-lg font-semibold shadow-md hover:shadow-lg transition-all"
          >
            View session details
          </button>
        )}
      </div>

      {sessions.length > 1 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-sm text-gray-600">
            + {sessions.length - 1} more upcoming session{sessions.length - 1 > 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}

