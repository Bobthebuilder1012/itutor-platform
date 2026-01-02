'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import TutorCalendarWidget from '@/components/booking/TutorCalendarWidget';

interface SuggestTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  tutorId: string;
  tutorName: string;
  studentName: string;
  childColor: string;
  onSuccess: () => void;
}

export default function SuggestTimeModal({
  isOpen,
  onClose,
  bookingId,
  tutorId,
  tutorName,
  studentName,
  childColor,
  onSuccess
}: SuggestTimeModalProps) {
  const [selectedStartAt, setSelectedStartAt] = useState<string | null>(null);
  const [selectedEndAt, setSelectedEndAt] = useState<string | null>(null);
  const [duration, setDuration] = useState(60);
  const [durationError, setDurationError] = useState('');
  const [parentNote, setParentNote] = useState('');
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

      // Update booking with parent's suggested time
      const { error } = await supabase
        .from('bookings')
        .update({
          requested_start_at: selectedStartAt,
          requested_end_at: calculatedEndAt,
          duration_minutes: duration,
          parent_notes: parentNote,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      if (error) throw error;

      alert(`Time suggestion sent! New request: ${new Date(selectedStartAt).toLocaleString()}, ${duration} minutes`);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error suggesting time:', error);
      alert(error.message || 'Failed to suggest time');
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
              <h2 className="text-2xl font-bold text-gray-900">Suggest Different Time</h2>
              <p className="text-gray-600 mt-1">
                Propose a new time for <span className="font-semibold">{studentName}</span>'s session with{' '}
                <span className="font-semibold" style={{ color: childColor }}>{tutorName}</span>
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
                focusRing: `2px solid ${childColor}`,
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
              durationMinutes={duration}
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
              Note to Tutor (Optional)
            </label>
            <textarea
              value={parentNote}
              onChange={(e) => setParentNote(e.target.value)}
              placeholder="Let the iTutor know why you're suggesting a different time..."
              rows={3}
              className="w-full px-4 py-3 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:border-transparent focus:outline-none transition resize-none"
              style={{ 
                borderColor: parentNote ? childColor : undefined
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
            {submitting ? 'Sending...' : 'Suggest This Time'}
          </button>
        </div>
      </div>
    </div>
  );
}


