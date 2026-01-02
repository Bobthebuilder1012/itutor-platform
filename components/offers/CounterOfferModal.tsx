'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { LessonOffer } from '@/lib/types/lessonOffers';
import TutorCalendarWidget from '@/components/booking/TutorCalendarWidget';

type CounterOfferModalProps = {
  isOpen: boolean;
  onClose: () => void;
  offer: LessonOffer;
  onSuccess: () => void;
};

export default function CounterOfferModal({ isOpen, onClose, offer, onSuccess }: CounterOfferModalProps) {
  const [selectedSlot, setSelectedSlot] = useState<{ startAt: string; endAt: string } | null>(null);
  const [counterNote, setCounterNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(offer.duration_minutes || 60);
  const [durationError, setDurationError] = useState('');

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!selectedSlot) {
      alert('Please select a time slot from the calendar');
      return;
    }

    // Validate duration
    if (durationMinutes < 30 || durationMinutes > 300) {
      alert('Duration must be between 30 minutes and 5 hours (300 minutes)');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('lesson_offers')
        .update({
          status: 'countered',
          counter_proposed_start_at: selectedSlot.startAt,
          counter_duration_minutes: durationMinutes,
          counter_tutor_note: counterNote || null
        })
        .eq('id', offer.id);

      if (error) throw error;

      onSuccess();
    } catch (err) {
      console.error('Error sending counter offer:', err);
      alert('Failed to send counter offer');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSlotSelect(startAt: string, endAt: string) {
    setSelectedSlot({ startAt, endAt });
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border-2 border-gray-300">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Counter Offer</h2>
            <p className="text-sm text-gray-600 mt-1">Select a time that works better for you</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
            disabled={submitting}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Original Offer Info */}
          <div className="bg-yellow-50 rounded-lg p-4 border-2 border-yellow-200">
            <p className="text-sm text-gray-700 mb-1 font-medium">Original iTutor proposal:</p>
            <p className="text-gray-900 font-bold text-lg">
              {new Date(offer.proposed_start_at).toLocaleString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              })}
            </p>
          </div>

          {/* Selected Slot Display */}
          {selectedSlot && (
            <div className="bg-green-50 rounded-lg p-4 border-2 border-green-200">
              <p className="text-sm text-gray-700 mb-1 font-medium">Your counter proposal:</p>
              <p className="text-gray-900 font-bold text-lg">
                {new Date(selectedSlot.startAt).toLocaleString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </p>
            </div>
          )}

          {/* Calendar Widget */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Select from iTutor's Available Times
            </h3>
            <TutorCalendarWidget
              tutorId={(offer as any).tutor_id}
              onSlotSelect={handleSlotSelect}
            />
          </div>

          {/* Duration Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Duration (minutes)
            </label>
            <input
              type="number"
              min="30"
              max="300"
              step="15"
              value={durationMinutes}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 60;
                setDurationMinutes(val);
                if (val < 30) {
                  setDurationError('Minimum 30 minutes');
                } else if (val > 300) {
                  setDurationError('Maximum 5 hours (300 minutes)');
                } else {
                  setDurationError('');
                }
              }}
              className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:outline-none text-gray-900"
            />
            {durationError && <p className="text-red-600 text-sm mt-1">{durationError}</p>}
            <p className="text-xs text-gray-600 mt-1">
              {Math.floor(durationMinutes / 60)}h {durationMinutes % 60}m
              {durationMinutes === 60 && ' (1 hour)'}
              {durationMinutes === 90 && ' (1.5 hours)'}
              {durationMinutes === 120 && ' (2 hours)'}
            </p>
          </div>

          {/* Optional Note */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Note to Tutor (Optional)
            </label>
            <textarea
              value={counterNote}
              onChange={(e) => setCounterNote(e.target.value)}
              rows={3}
              placeholder="Any additional details about your counter proposal..."
              className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:outline-none resize-none text-gray-900 placeholder-gray-400"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-200 sticky bottom-0 bg-white">
            <button
              type="submit"
              disabled={submitting || !selectedSlot}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white font-bold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Sending Counter...' : selectedSlot ? 'Send Counter Offer' : 'Select a Time Slot First'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-6 py-3 bg-white hover:bg-gray-50 text-gray-700 border-2 border-gray-300 rounded-lg font-semibold transition disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


