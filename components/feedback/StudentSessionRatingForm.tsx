'use client';

import { useEffect, useState } from 'react';

type Props = {
  sessionId: string;
  tutorName: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  redirectTo: string;
};

export default function StudentSessionRatingForm({
  sessionId,
  tutorName,
  scheduledStartAt,
  scheduledEndAt,
  redirectTo,
}: Props) {
  const [stars, setStars] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formattedTime, setFormattedTime] = useState<string>('');

  useEffect(() => {
    // Avoid server/client hydration mismatch by formatting only in the browser.
    const start = new Date(scheduledStartAt);
    const end = new Date(scheduledEndAt);
    setFormattedTime(`${start.toLocaleString()} – ${end.toLocaleTimeString()}`);
  }, [scheduledStartAt, scheduledEndAt]);

  useEffect(() => {
    // Prevent back navigation from escaping; middleware enforces server-side.
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
    if (!stars || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/feedback/student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          stars,
          comment: comment.trim() ? comment.trim() : null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || 'Failed to submit rating.');
        setSubmitting(false);
        return;
      }

      window.location.href = redirectTo;
    } catch {
      setError('Failed to submit rating.');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-gray-200 p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Rate your session</h1>
        <p className="mt-2 text-gray-600">
          Please leave a rating to continue using iTutor.
        </p>

        <div className="mt-6 rounded-xl bg-gray-50 border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Tutor</p>
          <p className="text-lg font-semibold text-gray-900">{tutorName}</p>

          <p className="mt-3 text-sm text-gray-500">Session time</p>
          <p className="text-gray-800" suppressHydrationWarning>
            {formattedTime || 'Loading…'}
          </p>
        </div>

        <div className="mt-6">
          <p className="text-sm font-semibold text-gray-900">Star rating (required)</p>
          <div className="mt-2 flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStars(s)}
                className={`text-3xl leading-none transition-colors ${
                  (stars ?? 0) >= s ? 'text-yellow-400' : 'text-gray-300 hover:text-gray-400'
                }`}
                aria-label={`${s} star${s === 1 ? '' : 's'}`}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-semibold text-gray-900">
            Written feedback (optional)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
            placeholder="Share anything that would help your tutor improve (optional)"
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
          disabled={!stars || submitting}
          className={`mt-6 w-full rounded-xl px-4 py-3 font-semibold text-white transition-all ${
            !stars || submitting
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-itutor-green hover:bg-itutor-green/90'
          }`}
        >
          {submitting ? 'Submitting…' : 'Submit rating'}
        </button>
      </div>
    </div>
  );
}

