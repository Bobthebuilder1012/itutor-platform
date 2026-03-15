'use client';

import { useMemo, useState } from 'react';
import { createBookingRequest, getSessionTypes } from '@/lib/services/bookingService';

interface SuggestTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (bookingId: string) => void;
  tutorId: string;
  tutorName: string;
  studentId: string;
  subjectId: string;
  subjectName: string;
  pricePerHour: number;
}

type Step = 'intro' | 'form' | 'success';

export default function SuggestTimeModal({
  isOpen,
  onClose,
  onSuccess,
  tutorId,
  tutorName,
  studentId,
  subjectId,
  subjectName,
  pricePerHour,
}: SuggestTimeModalProps) {
  const [step, setStep] = useState<Step>('intro');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [suggestedStartAt, setSuggestedStartAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [notes, setNotes] = useState('');

  const estimatedPrice = useMemo(() => {
    return (pricePerHour / 60) * durationMinutes;
  }, [pricePerHour, durationMinutes]);

  if (!isOpen) return null;

  const handleClose = () => {
    setStep('intro');
    setLoading(false);
    setError('');
    setSuggestedStartAt('');
    setDurationMinutes(60);
    setNotes('');
    onClose();
  };

  const submitSuggestion = async () => {
    if (!suggestedStartAt) {
      setError('Please select your suggested start time.');
      return;
    }
    if (durationMinutes < 30 || durationMinutes > 300) {
      setError('Duration must be between 30 and 300 minutes.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const sessionTypes = await getSessionTypes(tutorId);
      const preferredType =
        sessionTypes.find((item) => item.subject_id === subjectId) ??
        sessionTypes[0] ??
        null;

      if (!preferredType?.id) {
        throw new Error('This tutor has no active session type configured yet.');
      }

      const startIso = new Date(suggestedStartAt).toISOString();
      const endIso = new Date(new Date(suggestedStartAt).getTime() + durationMinutes * 60_000).toISOString();

      const request = await createBookingRequest(
        studentId,
        tutorId,
        subjectId,
        preferredType.id,
        startIso,
        endIso,
        notes || 'Suggested outside listed availability',
        durationMinutes
      );

      setStep('success');
      onSuccess?.(request.booking_id);
    } catch (err: any) {
      setError(err?.message ?? 'Could not send your suggestion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border-2 border-blue-200 bg-white p-5 shadow-2xl">
        {step === 'intro' && (
          <>
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-900">Suggest a Different Time</h2>
              <p className="mt-2 text-sm text-gray-600">
                Can&apos;t find a suitable slot? Send {tutorName} a custom time request outside listed availability.
              </p>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              Your request is sent as a booking request and the tutor can accept, decline, or counter-offer.
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-lg bg-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep('form')}
                className="flex-1 rounded-lg bg-gradient-to-r from-itutor-green to-emerald-600 px-4 py-2.5 text-sm font-semibold text-black"
              >
                Continue
              </button>
            </div>
          </>
        )}

        {step === 'form' && (
          <>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-amber-700">
              Suggested outside of availability
            </p>
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-900">Suggest Your Time</h2>
              <p className="mt-1 text-sm text-gray-600">
                {subjectName} with {tutorName}
              </p>
            </div>

            <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-800">
                Disclaimer: This suggested time is outside the tutor&apos;s listed availability.
              </p>
              <p className="mt-1 text-xs text-amber-700">
                The tutor may accept this request, decline it, or propose a different time.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Suggested date & time</label>
                <input
                  type="datetime-local"
                  value={suggestedStartAt}
                  onChange={(e) => setSuggestedStartAt(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-itutor-green focus:outline-none focus:ring-2 focus:ring-itutor-green"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Duration (minutes)</label>
                <input
                  type="number"
                  min={30}
                  max={300}
                  step={15}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value) || 60)}
                  className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-itutor-green focus:outline-none focus:ring-2 focus:ring-itutor-green"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">What topic do you want to learn? (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g. Quadratic equations, factoring, and exam-style questions"
                  className="w-full resize-none rounded-lg border-2 border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-itutor-green focus:outline-none focus:ring-2 focus:ring-itutor-green"
                />
              </div>

              <div className="rounded-xl border-2 border-itutor-green bg-green-50 p-3">
                <p className="text-sm font-semibold text-gray-700">
                  Estimated price: <span className="text-itutor-green">${estimatedPrice.toFixed(2)} TTD</span>
                </p>
                <p className="text-xs text-gray-600">${pricePerHour}/hour rate</p>
              </div>
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setStep('intro')}
                disabled={loading}
                className="flex-1 rounded-lg bg-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-300 disabled:opacity-60"
              >
                Back
              </button>
              <button
                type="button"
                onClick={submitSuggestion}
                disabled={loading}
                className="flex-1 rounded-lg bg-gradient-to-r from-itutor-green to-emerald-600 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
              >
                {loading ? 'Sending...' : 'Send Suggestion'}
              </button>
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-amber-700">
              Suggested outside of availability
            </p>
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                <svg className="h-7 w-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900">Suggestion Sent</h2>
              <p className="mt-2 text-sm text-gray-600">
                Your custom time request was sent to {tutorName}. You can track updates in My Bookings.
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-left">
              <p className="text-xs font-semibold text-amber-800">
                Note: This request was marked as outside listed availability.
              </p>
            </div>

            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg bg-gradient-to-r from-itutor-green to-emerald-600 px-5 py-2.5 text-sm font-semibold text-black"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

