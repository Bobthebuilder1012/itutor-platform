'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import TutorCalendarWidget from '@/components/booking/TutorCalendarWidget';

interface RescheduleSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  tutorId: string;
  tutorName: string;
  studentName: string;
  subjectName: string;
  currentStartTime: string;
  currentDuration: number;
  childColor: string;
  onSuccess: () => void;
}

export default function RescheduleSessionModal({
  isOpen,
  onClose,
  sessionId,
  tutorId,
  tutorName,
  studentName,
  subjectName,
  currentStartTime,
  currentDuration,
  childColor,
  onSuccess
}: RescheduleSessionModalProps) {
  const [selectedStartAt, setSelectedStartAt] = useState<string | null>(null);
  const [selectedEndAt, setSelectedEndAt] = useState<string | null>(null);
  const [duration, setDuration] = useState(currentDuration);
  const [durationError, setDurationError] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSlotSelect = (startAt: string, endAt: string) => {
    setSelectedStartAt(startAt);
    setSelectedEndAt(endAt);
  };

  const handleDurationChange = (newDuration: number) => {
    setDuration(newDuration);
    if (newDuration < 30) {
      setDurationError('Minimum 30 minutes');
    } else if (newDuration > 300) {
      setDurationError('Maximum 5 hours');
    } else {
      setDurationError('');
    }
  };

  const handleSubmit = async () => {
    if (!selectedStartAt || durationError) return;

    setSubmitting(true);
    try {
      // Calculate new end time based on duration
      const startDate = new Date(selectedStartAt);
      const endDate = new Date(startDate.getTime() + duration * 60000);
      const calculatedEndAt = endDate.toISOString();

      // First, get the session to find the tutor ID
      const { data: session, error: sessionFetchError } = await supabase
        .from('sessions')
        .select('tutor_id, student_id')
        .eq('id', sessionId)
        .single();

      if (sessionFetchError) throw sessionFetchError;

      // Update session with new time
      const { error: updateError } = await supabase
        .from('sessions')
        .update({
          scheduled_start_at: selectedStartAt,
          scheduled_end_at: calculatedEndAt,
          duration_minutes: duration,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (updateError) throw updateError;

      // Notify tutor of reschedule
      const formattedDate = new Date(selectedStartAt).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });

      const reasonText = rescheduleReason ? ` Reason: ${rescheduleReason}` : '';

      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: session.tutor_id,
          type: 'session_rescheduled',
          title: 'Session Rescheduled',
          message: `A parent has rescheduled ${studentName}'s ${subjectName} session to ${formattedDate} (${duration} minutes).${reasonText}`,
          link: `/tutor/sessions`,
          created_at: new Date().toISOString()
        });

      if (notificationError) {
        console.error('Failed to create notification:', notificationError);
        // Don't throw - reschedule was successful even if notification failed
      }

      // Also notify the student
      const { error: studentNotificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: session.student_id,
          type: 'session_rescheduled',
          title: 'Session Rescheduled',
          message: `Your ${subjectName} session with ${tutorName} has been rescheduled to ${formattedDate} (${duration} minutes).${reasonText}`,
          link: `/student/sessions`,
          created_at: new Date().toISOString()
        });

      if (studentNotificationError) {
        console.error('Failed to create student notification:', studentNotificationError);
      }

      // TODO: Create new meeting link with video provider if needed

      alert(`Session rescheduled! New time: ${new Date(selectedStartAt).toLocaleString()}`);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error rescheduling session:', error);
      alert(error.message || 'Failed to reschedule session');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div 
          className="p-6 border-b-4"
          style={{ borderColor: childColor }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Reschedule Session</h2>
              <p className="text-gray-600 mt-1">
                Move <span className="font-semibold" style={{ color: childColor }}>{studentName}</span>'s{' '}
                <span className="font-semibold">{subjectName}</span> session with <span className="font-semibold">{tutorName}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Current Time Display */}
          <div 
            className="p-4 rounded-lg border-2"
            style={{ 
              backgroundColor: `${childColor}10`,
              borderColor: `${childColor}40`
            }}
          >
            <p className="text-sm font-semibold" style={{ color: childColor }}>
              Current Time:
            </p>
            <p className="text-gray-900 font-medium mt-1">
              {new Date(currentStartTime).toLocaleString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              })}
            </p>
            <p className="text-gray-600 text-sm mt-1">Duration: {currentDuration} minutes</p>
          </div>

          {/* Duration Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Session Duration (minutes)
            </label>
            <input
              type="number"
              min="30"
              max="300"
              step="15"
              value={duration}
              onChange={(e) => handleDurationChange(parseInt(e.target.value) || 60)}
              className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:border-transparent focus:outline-none transition"
              style={{ 
                borderColor: selectedStartAt ? childColor : undefined
              }}
            />
            {durationError && <p className="text-red-600 text-sm mt-1">{durationError}</p>}
            <p className="text-sm text-gray-600 mt-1">
              {Math.floor(duration / 60)}h {duration % 60}m
            </p>
          </div>

          {/* Calendar Widget */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Select New Date & Time
            </label>
            <TutorCalendarWidget
              tutorId={tutorId}
              onSlotSelect={handleSlotSelect}
              maxWeeksAhead={8}
            />
          </div>

          {/* Selected Time Display */}
          {selectedStartAt && (
            <div 
              className="p-4 rounded-lg border-2"
              style={{ 
                backgroundColor: `${childColor}10`,
                borderColor: childColor
              }}
            >
              <p className="text-sm font-semibold" style={{ color: childColor }}>
                ✓ New Time Selected:
              </p>
              <p className="text-gray-900 font-medium mt-1">
                {new Date(selectedStartAt).toLocaleString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                })}
              </p>
              <p className="text-gray-600 text-sm mt-1">Duration: {duration} minutes</p>
            </div>
          )}

          {/* Optional Note */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Reason for Rescheduling (Optional)
            </label>
            <textarea
              value={rescheduleReason}
              onChange={(e) => setRescheduleReason(e.target.value)}
              placeholder="Let the iTutor know why you're rescheduling..."
              rows={3}
              className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:border-transparent focus:outline-none transition resize-none"
              style={{ 
                borderColor: rescheduleReason ? childColor : undefined
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedStartAt || submitting || !!durationError}
            className="flex-1 px-6 py-3 text-white rounded-lg font-semibold shadow-lg hover:scale-105 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{ backgroundColor: childColor }}
          >
            {submitting ? 'Rescheduling...' : 'Confirm Reschedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

