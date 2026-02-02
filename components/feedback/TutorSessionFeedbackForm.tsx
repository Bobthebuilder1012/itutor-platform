'use client';

import { useEffect, useState } from 'react';

type Props = {
  sessionId: string;
  studentName: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  redirectTo: string;
};

export default function TutorSessionFeedbackForm({
  sessionId,
  studentName,
  scheduledStartAt,
  scheduledEndAt,
  redirectTo,
}: Props) {
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formattedTime, setFormattedTime] = useState<string>('');

  const hasMeaningfulText = feedbackText.replace(/\s+/g, '').length > 0;

  useEffect(() => {
    // Avoid server/client hydration mismatch by formatting only in the browser.
    const start = new Date(scheduledStartAt);
    const end = new Date(scheduledEndAt);
    setFormattedTime(`${start.toLocaleString()} – ${end.toLocaleTimeString()}`);
  }, [scheduledStartAt, scheduledEndAt]);

  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    const onPopState = () => {
      window.history.pushState(null, '', window.location.href);
    };
    window.addEventListener('popstate', onPopState);

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  async function onSubmit() {
    if (submitting) return;
    if (!hasMeaningfulText) {
      setError('Feedback text is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/feedback/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          feedbackText: feedbackText.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || 'Failed to submit feedback.');
        setSubmitting(false);
        return;
      }

      window.location.href = redirectTo;
    } catch {
      setError('Failed to submit feedback.');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-gray-200 p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Session feedback</h1>
        <p className="mt-2 text-gray-600">
          Please leave feedback to continue using iTutor.
        </p>

        <div className="mt-6 rounded-xl bg-gray-50 border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Student</p>
          <p className="text-lg font-semibold text-gray-900">{studentName}</p>

          <p className="mt-3 text-sm text-gray-500">Session time</p>
          <p className="text-gray-800" suppressHydrationWarning>
            {formattedTime || 'Loading…'}
          </p>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-semibold text-gray-900">
            Written feedback (required)
          </label>
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            rows={5}
            className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
            placeholder="Write feedback for the student (required)"
          />
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className={`mt-6 w-full rounded-xl px-4 py-3 font-semibold text-white transition-all ${
            submitting
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-itutor-green hover:bg-itutor-green/90'
          }`}
        >
          {submitting ? 'Submitting…' : 'Submit feedback'}
        </button>
      </div>
    </div>
  );
}

