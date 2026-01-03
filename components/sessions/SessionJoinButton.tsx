'use client';

import { useState, useEffect } from 'react';
import { Session } from '@/lib/types/sessions';
import { isJoinWindowOpen } from '@/lib/types/sessions';

type SessionJoinButtonProps = {
  session: Session;
  userRole: 'student' | 'tutor';
};

export default function SessionJoinButton({ session, userRole }: SessionJoinButtonProps) {
  const [timeUntilJoin, setTimeUntilJoin] = useState<number>(0);
  const [canJoin, setCanJoin] = useState(false);

  useEffect(() => {
    function updateJoinStatus() {
      const scheduledStart = new Date(session.scheduled_start_at);
      const joinOpenTime = new Date(scheduledStart.getTime() - 5 * 60000);
      const now = new Date();

      setCanJoin(isJoinWindowOpen(session.scheduled_start_at));
      
      if (now < joinOpenTime) {
        setTimeUntilJoin(Math.floor((joinOpenTime.getTime() - now.getTime()) / 1000));
      } else {
        setTimeUntilJoin(0);
      }
    }

    updateJoinStatus();
    const interval = setInterval(updateJoinStatus, 1000);
    
    return () => clearInterval(interval);
  }, [session.scheduled_start_at]);

  function formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  if (!canJoin) {
    return (
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-blue-500 rounded-lg">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Session Starts Soon</h3>
            <p className="text-sm text-gray-600">Join button opens in:</p>
          </div>
        </div>
        
        <div className="text-center py-4 bg-white rounded-lg border border-blue-200">
          <p className="text-3xl font-bold text-blue-600">{formatTime(timeUntilJoin)}</p>
          <p className="text-xs text-gray-600 mt-1">Until join available (5 min before start)</p>
        </div>

        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-gray-800">
            <span className="font-semibold">⚠️ Important:</span> If you don't join within{' '}
            <span className="font-bold text-red-600">{session.no_show_wait_minutes} minutes</span>{' '}
            after the session starts, the {userRole === 'student' ? 'tutor may end the session' : 'session may be marked as no-show'}.
          </p>
        </div>
      </div>
    );
  }

  if (!session.join_url) {
    return (
      <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-6">
        <p className="text-gray-800">Meeting link is being generated...</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">Ready to Join!</h3>
          <p className="text-sm text-gray-600">Your session is ready</p>
        </div>
      </div>

      <a
        href={session.join_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-emerald-600 hover:to-green-600 text-white text-center font-bold text-lg rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
      >
        <div className="flex items-center justify-center gap-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
          Join Session Now
        </div>
      </a>

      <div className="mt-4 p-3 bg-white/80 rounded-lg border border-green-200">
        <p className="text-sm text-gray-700 text-center">
          Using: <span className="font-semibold capitalize">{session.provider.replace('_', ' ')}</span>
        </p>
      </div>
    </div>
  );
}






