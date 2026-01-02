'use client';

import { useState, useEffect, useMemo } from 'react';
import { createBookingRequest, getSessionTypes } from '@/lib/services/bookingService';
import { SessionType } from '@/lib/types/booking';
import { formatDateTime, getDurationMinutes, formatDuration } from '@/lib/utils/calendar';

interface BookingRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  tutorId: string;
  tutorName: string;
  studentId: string;
  subjectId: string;
  subjectName: string;
  pricePerHour: number;
  selectedStartAt: string;
  selectedEndAt: string;
  onSuccess: (bookingId: string) => void;
}

export default function BookingRequestModal({
  isOpen,
  onClose,
  tutorId,
  tutorName,
  studentId,
  subjectId,
  subjectName,
  pricePerHour,
  selectedStartAt,
  selectedEndAt,
  onSuccess
}: BookingRequestModalProps) {
  const [studentNotes, setStudentNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [durationError, setDurationError] = useState('');

  // Calculate price based on duration
  const calculatedPrice = useMemo(() => {
    return (pricePerHour / 60) * durationMinutes;
  }, [pricePerHour, durationMinutes]);

  // Validate duration
  const validateDuration = () => {
    if (durationMinutes < 30) {
      setDurationError('Minimum duration is 30 minutes');
      return false;
    }
    if (durationMinutes > 300) {
      setDurationError('Maximum duration is 5 hours (300 minutes)');
      return false;
    }
    setDurationError('');
    return true;
  };

  // No need to load session types - we'll auto-create/use a default one behind the scenes

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validate duration
    if (!validateDuration()) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      // First, get or create a session type for this tutor-subject combination
      const sessionTypes = await getSessionTypes(tutorId);
      let sessionType = sessionTypes.find(st => st.subject_id === subjectId);
      
      // Calculate end time based on start time + duration
      const endAt = new Date(new Date(selectedStartAt).getTime() + durationMinutes * 60000).toISOString();
      
      const result = await createBookingRequest(
        studentId,
        tutorId,
        subjectId,
        sessionType?.id || '', // Will be handled by a modified backend function
        selectedStartAt,
        endAt,
        studentNotes || undefined,
        durationMinutes
      );

      onSuccess(result.booking_id);
      handleClose();
    } catch (error: any) {
      console.error('Error creating booking:', error);
      setError(error.message || 'Failed to create booking request');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setStudentNotes('');
    setError('');
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border-2 border-indigo-200 shadow-2xl rounded-2xl p-5 max-w-lg w-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Book Session</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Booking Details */}
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-3 mb-4 space-y-2">
          {/* Subject */}
          <div className="flex items-center gap-2">
            <div className="bg-itutor-green p-1.5 rounded-lg">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-600">Subject</p>
              <p className="text-gray-900 font-bold text-sm">{subjectName}</p>
            </div>
          </div>
          
          {/* Tutor */}
          <div className="flex items-center gap-2">
            <div className="bg-blue-500 p-1.5 rounded-lg">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-600">Tutor</p>
              <p className="text-gray-900 font-bold text-sm">{tutorName}</p>
            </div>
          </div>
          
          {/* Time */}
          <div className="flex items-center gap-2">
            <div className="bg-purple-500 p-1.5 rounded-lg">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-600">When</p>
              <p className="text-gray-900 font-bold text-sm">{formatDateTime(selectedStartAt)}</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Duration Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
                if (val >= 30 && val <= 300) {
                  setDurationError('');
                }
              }}
              className="w-full px-3 py-2 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition text-sm"
            />
            {durationError && <p className="text-red-600 text-sm mt-1">{durationError}</p>}
            <p className="text-xs text-gray-600 mt-1">
              {Math.floor(durationMinutes / 60)}h {durationMinutes % 60}m
              {durationMinutes === 60 && ' (1 hour)'}
              {durationMinutes === 90 && ' (1.5 hours)'}
              {durationMinutes === 120 && ' (2 hours)'}
            </p>
          </div>

          {/* Student Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-gray-500">(optional)</span>
            </label>
            <textarea
              value={studentNotes}
              onChange={(e) => setStudentNotes(e.target.value)}
              placeholder="Any specific topics you'd like to cover?"
              rows={2}
              className="w-full px-3 py-2 bg-white border-2 border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-400 text-sm resize-none"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border-2 border-red-300 text-red-700 px-3 py-2 rounded-lg">
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Total Price */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-itutor-green rounded-xl p-3">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-gray-700 font-semibold text-sm">Estimated Price:</span>
                <p className="text-xs text-gray-600">
                  ${pricePerHour}/hour × {durationMinutes} minutes
                </p>
              </div>
              <span className="text-2xl font-bold text-itutor-green">${calculatedPrice.toFixed(2)} TTD</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold transition disabled:opacity-50 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-black rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-md"
            >
              {loading ? 'Sending...' : 'Send Booking Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

