'use client';

import Link from 'next/link';
import { Session } from '@/lib/types/database';
import StudentSessionAttendance, { type SessionAttendanceState } from '@/components/student/StudentSessionAttendance';

type EnrichedSession = Session & {
  tutor?: { id: string; full_name?: string; display_name?: string; username?: string } | null;
  subject?: { id: string; label?: string; name?: string } | null;
};

type Props = {
  sessions: EnrichedSession[];
  loading: boolean;
  onViewSession?: (sessionId: string) => void;
  attendanceBySessionId?: Record<string, SessionAttendanceState>;
  onAttendanceRefresh?: () => void;
};

const cardBase = 'bg-white border border-gray-100 rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-all duration-200';

export default function UpcomingSessionsCard({
  sessions,
  loading,
  onViewSession,
  attendanceBySessionId,
  onAttendanceRefresh,
}: Props) {
  const getTutorName = (tutor: EnrichedSession['tutor']) =>
    tutor ? (tutor.display_name || tutor.full_name || tutor.username || 'Tutor') : 'Tutor';

  const getSubjectName = (subject: EnrichedSession['subject']) =>
    subject ? (subject.label || subject.name || 'Session') : 'Session';

  const cardHeader = (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={1.8} />
            <path d="M16 2v4M8 2v4M3 10h18" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
        </div>
        <h2 className="text-base font-bold text-gray-900">Your Next Session</h2>
      </div>
      <Link href="/student/dashboard" className="text-xs font-semibold text-itutor-green hover:text-emerald-600 transition-colors">
        View all →
      </Link>
    </div>
  );

  if (loading) {
    return (
      <div className={cardBase}>
        {cardHeader}
        <p className="text-sm text-gray-500">Loading sessions…</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className={cardBase}>
        {cardHeader}
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-14 h-14 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-center mb-4">
            <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={1.8} />
              <path d="M16 2v4M8 2v4M3 10h18" strokeWidth={1.8} strokeLinecap="round" />
            </svg>
          </div>
          <h4 className="text-sm font-semibold text-gray-900 mb-1">No upcoming sessions yet</h4>
          <p className="text-xs text-gray-500 max-w-[180px] leading-relaxed mb-4">Let's book your first one and start learning!</p>
          <Link
            href="/student/find-tutors"
            className="px-5 py-2.5 bg-itutor-green hover:bg-emerald-600 text-black font-semibold rounded-xl text-sm transition-all"
          >
            Find an iTutor
          </Link>
        </div>
      </div>
    );
  }

  const next = sessions[0];
  const sessionStart = new Date(next.scheduled_start_at);
  const sessionEnd = new Date(sessionStart.getTime() + (next.duration_minutes || 60) * 60000);
  const now = new Date();
  const status = next.status?.toUpperCase();
  const isInProgress = now >= sessionStart && now <= sessionEnd;
  const hasEnded = now > sessionEnd;

  let displayStatus = 'Upcoming';
  let statusClass = 'bg-itutor-green/10 text-itutor-green';

  if (status === 'CANCELLED') { displayStatus = 'Cancelled'; statusClass = 'bg-red-50 text-red-600'; }
  else if (status === 'COMPLETED' || status === 'COMPLETED_ASSUMED') { displayStatus = 'Completed'; statusClass = 'bg-itutor-green/10 text-itutor-green'; }
  else if (status === 'NO_SHOW_STUDENT') { displayStatus = 'No Show'; statusClass = 'bg-orange-50 text-orange-600'; }
  else if (isInProgress) { displayStatus = 'In Progress'; statusClass = 'bg-purple-50 text-purple-600'; }
  else if (hasEnded) { displayStatus = 'Past'; statusClass = 'bg-gray-100 text-gray-500'; }

  return (
    <div className={cardBase}>
      {cardHeader}

      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-900">{getSubjectName(next.subject)}</h3>
          <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${statusClass}`}>{displayStatus}</span>
        </div>
        {next.tutor && (
          <p className="text-sm text-gray-500 mb-3">
            with <span className="font-semibold text-gray-700">{getTutorName(next.tutor)}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-3 text-sm text-gray-600 mb-4">
          <div className="flex items-center gap-1.5">
            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={1.8} />
              <path d="M16 2v4M8 2v4M3 10h18" strokeWidth={1.8} strokeLinecap="round" />
            </svg>
            <span>{sessionStart.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" strokeWidth={1.8} />
              <path strokeLinecap="round" strokeWidth={1.8} d="M12 6v6l4 2" />
            </svg>
            <span>{sessionStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {next.duration_minutes} min</span>
          </div>
        </div>
        {onViewSession && (
          <button
            onClick={() => onViewSession(next.id)}
            className="px-5 py-2 bg-itutor-green hover:bg-emerald-600 text-black font-semibold rounded-xl text-sm transition-all"
          >
            View session details
          </button>
        )}
        {attendanceBySessionId && (
          <StudentSessionAttendance
            sessionId={next.id}
            scheduledStartAt={next.scheduled_start_at}
            sessionStatus={next.status || ''}
            attendance={attendanceBySessionId[next.id] ?? null}
            compact
            onUpdated={onAttendanceRefresh}
          />
        )}
      </div>

      {sessions.length > 1 && (
        <p className="mt-3 text-xs text-gray-400 pt-3 border-t border-gray-100">
          + {sessions.length - 1} more upcoming session{sessions.length - 1 > 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
