'use client';

import { useState } from 'react';
import { Session } from '@/lib/types/sessions';
import { tutorCancelSession } from '@/lib/services/tutorSessionService';

type CancelSessionModalProps = {
  session: Session;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function CancelSessionModal({ session, isOpen, onClose, onSuccess }: CancelSessionModalProps) {
  const [cancellationReason, setCancellationReason] = useState('');
  const [wantsReschedule, setWantsReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleStartTime, setRescheduleStartTime] = useState('09:00');
  const [rescheduleEndTime, setRescheduleEndTime] = useState('10:00');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!cancellationReason.trim()) {
      setError('Please provide a reason for cancellation');
      return;
    }

    if (wantsReschedule) {
      if (!rescheduleDate || !rescheduleStartTime || !rescheduleEndTime) {
        setError('Please fill in all reschedule fields');
        return;
      }

      const start = new Date(`${rescheduleDate}T${rescheduleStartTime}`);
      const end = new Date(`${rescheduleDate}T${rescheduleEndTime}`);

      if (end <= start) {
        setError('End time must be after start time');
        return;
      }

      if (start < new Date()) {
        setError('Reschedule time cannot be in the past');
        return;
      }
    }

    setLoading(true);

    try {
      await tutorCancelSession({
        sessionId: session.id,
        cancellationReason: cancellationReason.trim(),
        rescheduleStart: wantsReschedule ? new Date(`${rescheduleDate}T${rescheduleStartTime}`).toISOString() : undefined,
        rescheduleEnd: wantsReschedule ? new Date(`${rescheduleDate}T${rescheduleEndTime}`).toISOString() : undefined
      });

      alert(wantsReschedule ? 'Session cancelled and reschedule request sent!' : 'Session cancelled successfully');
      onSuccess();
      onClose();
      resetForm();
    } catch (err: any) {
      console.error('Error cancelling session:', err);
      setError(err.message || 'Failed to cancel session');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setCancellationReason('');
    setWantsReschedule(false);
    setRescheduleDate('');
    setRescheduleStartTime('09:00');
    setRescheduleEndTime('10:00');
    setError('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  const sessionDate = new Date(session.scheduled_start_at).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const sessionTime = `${new Date(session.scheduled_start_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  })} - ${new Date(session.scheduled_end_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  })}`;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-red-50 border-b border-red-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Cancel Session</h2>
              <p className="text-sm text-gray-600 mt-1">{sessionDate}</p>
              <p className="text-sm text-gray-600">{sessionTime}</p>
            </div>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Warning */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-yellow-800">Important</p>
                <p className="text-sm text-yellow-700 mt-1">
                  Sessions can only be cancelled at least 2 hours before the start time. The student will be notified immediately.
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Cancellation Reason */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Reason for Cancellation <span className="text-red-500">*</span>
            </label>
            <textarea
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="Please explain why you need to cancel this session..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
              rows={4}
              required
            />
          </div>

          {/* Reschedule Option */}
          <div className="border-t border-gray-200 pt-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={wantsReschedule}
                onChange={(e) => setWantsReschedule(e.target.checked)}
                className="w-5 h-5 text-itutor-green border-gray-300 rounded focus:ring-itutor-green"
              />
              <span className="text-sm font-semibold text-gray-700">
                Propose a new time to reschedule
              </span>
            </label>

            {wantsReschedule && (
              <div className="mt-4 space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-blue-800">
                    The student will receive your reschedule request and can accept or decline the new time.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Proposed Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required={wantsReschedule}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Start Time <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={rescheduleStartTime}
                      onChange={(e) => setRescheduleStartTime(e.target.value)}
                      step="60"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required={wantsReschedule}
                    />
                    <p className="text-xs text-gray-500 mt-1">Hour marks only (e.g., 7:00, 8:00)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      End Time <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={rescheduleEndTime}
                      onChange={(e) => setRescheduleEndTime(e.target.value)}
                      step="60"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required={wantsReschedule}
                    />
                    <p className="text-xs text-gray-500 mt-1">Hour marks only (e.g., 8:00, 9:00)</p>
                  </div>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-green-800">
                    ✅ Your reschedule request will be sent to the student when you click the button below
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Keep Session
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading 
                ? 'Processing...' 
                : wantsReschedule 
                  ? 'Cancel & Send Reschedule Request' 
                  : 'Cancel Session'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
