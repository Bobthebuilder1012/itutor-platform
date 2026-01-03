'use client';

import { useState } from 'react';
import { Session } from '@/lib/types/sessions';
import { canMarkNoShow } from '@/lib/types/sessions';

type MarkNoShowButtonProps = {
  session: Session;
  onSuccess: () => void;
};

export default function MarkNoShowButton({ session, onSuccess }: MarkNoShowButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canMark = canMarkNoShow(session);

  if (!canMark) {
    return null; // Don't show button if can't mark yet
  }

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

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl shadow-lg transition-all duration-300 flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
        End & Mark Student No-Show
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border-2 border-gray-300">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-red-500 to-red-600">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Mark Student No-Show</h2>
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

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">⚠️ Note:</span> Only mark as no-show if the student genuinely did not join within {session.no_show_wait_minutes} minutes. False no-show reports may result in account penalties.
                </p>
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







