'use client';

import { useState, useEffect } from 'react';
import { Session } from '@/lib/types/sessions';

type MarkNoShowButtonEnhancedProps = {
  session: Session;
  userRole: 'tutor' | 'student';
  onSuccess: () => void;
};

export default function MarkNoShowButtonEnhanced({ 
  session, 
  userRole,
  onSuccess 
}: MarkNoShowButtonEnhancedProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minutesRemaining, setMinutesRemaining] = useState<number | null>(null);
  const [canMark, setCanMark] = useState(false);

  // Check eligibility every second
  useEffect(() => {
    const checkEligibility = () => {
      const now = new Date();
      const sessionStart = new Date(session.scheduled_start_at);
      const twentyMinutesAfterStart = new Date(sessionStart.getTime() + 20 * 60 * 1000);
      const sessionEnd = new Date(sessionStart.getTime() + session.duration_minutes * 60 * 1000);

      // Can mark no-show if:
      // 1. At least 20 minutes have passed since session start
      // 2. Session hasn't ended yet
      // 3. Session status is SCHEDULED or JOIN_OPEN
      const canMarkNow = now >= twentyMinutesAfterStart && 
                         now <= sessionEnd &&
                         (session.status === 'SCHEDULED' || session.status === 'JOIN_OPEN');

      setCanMark(canMarkNow);

      // Calculate minutes remaining until button becomes active
      if (now < twentyMinutesAfterStart) {
        const msRemaining = twentyMinutesAfterStart.getTime() - now.getTime();
        const minsRemaining = Math.ceil(msRemaining / (60 * 1000));
        setMinutesRemaining(minsRemaining);
      } else {
        setMinutesRemaining(null);
      }
    };

    checkEligibility();
    const interval = setInterval(checkEligibility, 1000);
    return () => clearInterval(interval);
  }, [session]);

  async function handleMarkNoShow() {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${session.id}/mark-no-show`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to mark no-show');
      }

      setIsOpen(false);
      onSuccess();
    } catch (err) {
      console.error('Error marking no-show:', err);
      setError(err instanceof Error ? err.message : 'Failed to mark no-show');
    } finally {
      setSubmitting(false);
    }
  }

  // Don't show button if session status doesn't allow it
  if (session.status !== 'SCHEDULED' && session.status !== 'JOIN_OPEN') {
    return null;
  }

  const buttonLabel = userRole === 'tutor' 
    ? 'Mark Student No-Show' 
    : 'Report Tutor No-Show';

  const tooltipText = canMark
    ? `Click to report that the ${userRole === 'tutor' ? 'student' : 'tutor'} did not join the session. ⚠️ False reports may result in account suspension.`
    : minutesRemaining !== null
    ? `This button will be enabled ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''} after the session starts (20 minutes total). You can use it if the ${userRole === 'tutor' ? 'student' : 'tutor'} doesn't show up.`
    : 'This button is currently unavailable';

  return (
    <>
      {/* Button with Lock Icon */}
      <div className="relative group">
        <button
          onClick={() => canMark && setIsOpen(true)}
          disabled={!canMark}
          className={`
            px-6 py-3 font-bold rounded-xl shadow-lg transition-all duration-300 flex items-center gap-2
            ${canMark 
              ? 'bg-red-500 hover:bg-red-600 text-white cursor-pointer' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }
          `}
          title={tooltipText}
        >
          {!canMark && (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          )}
          {canMark ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : null}
          <span>{buttonLabel}</span>
          {minutesRemaining !== null && (
            <span className="text-xs">({minutesRemaining}m)</span>
          )}
        </button>

        {/* Tooltip on hover */}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-50">
          <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 max-w-xs whitespace-normal shadow-lg">
            {tooltipText}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
              <div className="border-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal for Confirmation */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border-2 border-gray-300 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-red-500 to-red-600">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    {buttonLabel}
                  </h2>
                  <p className="text-white/90 text-sm">This action cannot be undone</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              {/* Different content for student vs tutor */}
              {userRole === 'student' ? (
                <>
                  {/* Student View */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-bold text-gray-900 mb-2">What happens:</h3>
                    <ul className="space-y-2 text-sm text-gray-700">
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 font-bold">•</span>
                        <span>Your refund will be processed automatically</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 font-bold">•</span>
                        <span>You will receive a <span className="font-bold text-green-600">full refund</span> of the session price</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 font-bold">•</span>
                        <span>Refund status: <span className="font-bold text-amber-600">Pending (2-5 business days)</span></span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 font-bold">•</span>
                        <span>The tutor will be notified of the no-show report</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 font-bold">•</span>
                        <span>This will be recorded in the tutor's history</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="text-sm">
                      <p className="text-gray-600 mb-1">Session Price:</p>
                      <p className="font-bold text-gray-900 text-lg">TTD {session.charge_amount_ttd.toFixed(2)}</p>
                      <p className="text-green-600 font-semibold mt-2">→ Full Refund Pending</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Tutor View */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-bold text-gray-900 mb-2">What happens:</h3>
                    <ul className="space-y-2 text-sm text-gray-700">
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 font-bold">•</span>
                        <span>The student will be charged <span className="font-bold text-red-600">50%</span> of the session price</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 font-bold">•</span>
                        <span>You will receive <span className="font-bold text-green-600">45%</span> of the original price as compensation</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 font-bold">•</span>
                        <span>The session will be marked as completed with no-show status</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-600 font-bold">•</span>
                        <span>This will be recorded in the student's history</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600">Original Price:</p>
                        <p className="font-bold text-gray-900">TTD {session.charge_amount_ttd.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Student Charge:</p>
                        <p className="font-bold text-red-600">TTD {(session.charge_amount_ttd * 0.5).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Your Payout:</p>
                        <p className="font-bold text-green-600">TTD {(session.charge_amount_ttd * 0.45).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Platform Fee:</p>
                        <p className="font-bold text-gray-600">TTD {(session.charge_amount_ttd * 0.05).toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Warning about false reports */}
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="font-bold text-red-900 mb-1">⚠️ Important Warning</p>
                    <p className="text-sm text-red-800">
                      Only mark as no-show if the {userRole === 'tutor' ? 'student' : 'tutor'} genuinely did not join within 20 minutes of the session start. 
                      <span className="font-bold"> False no-show reports will result in account suspension or permanent ban from the platform.</span>
                    </p>
                  </div>
                </div>
              </div>

              {userRole === 'tutor' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">📝 Note:</span> Only mark as no-show if the student genuinely did not join within 20 minutes. False no-show reports may result in account penalties.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 bg-gray-50 flex gap-3">
              <button
                onClick={() => setIsOpen(false)}
                disabled={submitting}
                className="flex-1 px-6 py-3 bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-300 rounded-xl font-semibold transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkNoShow}
                disabled={submitting}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Confirm No-Show
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
