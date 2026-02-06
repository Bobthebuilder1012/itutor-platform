'use client';

import { useState } from 'react';
import { Session } from '@/lib/types/sessions';

type SessionJoinButtonProps = {
  session: Session;
  userRole: 'student' | 'tutor';
  onRetrySuccess?: () => void;
};

export default function SessionJoinButton({ session, userRole, onRetrySuccess }: SessionJoinButtonProps) {
  const [retrying, setRetrying] = useState(false);
  const now = new Date();
  const scheduledStart = new Date(session.scheduled_start_at);
  const scheduledEnd = new Date(scheduledStart.getTime() + session.duration_minutes * 60000);
  const hasSessionEnded = now > scheduledEnd;

  async function handleRetryMeetingLink() {
    setRetrying(true);
    try {
      const response = await fetch('/api/sessions/retry-meeting-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create meeting link');
      }

      if (onRetrySuccess) {
        onRetrySuccess();
      } else {
        window.location.reload();
      }
    } catch (error: any) {
      console.error('Error retrying meeting link:', error);
      alert(`Failed to create meeting link: ${error.message}`);
    } finally {
      setRetrying(false);
    }
  }

  if (!session.join_url) {
    return (
      <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <p className="text-gray-800 font-medium">Meeting link is being generated...</p>
          {userRole === 'tutor' && (
            <button
              onClick={handleRetryMeetingLink}
              disabled={retrying}
              className="px-6 py-2.5 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400 text-white font-semibold rounded-lg transition-colors"
            >
              {retrying ? 'Retrying...' : 'Retry Now'}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (hasSessionEnded) {
    return (
      <div className="bg-gray-50 border-2 border-gray-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-3 bg-gray-400 rounded-xl">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">Session Ended</h3>
            <p className="text-sm text-gray-600">The meeting link is no longer available</p>
          </div>
        </div>
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











