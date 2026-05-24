'use client';

import { useEffect, useState } from 'react';
import { StarInput } from './StarInput';
import { cn } from '@/lib/utils';

type Props = {
  sessionId: string;
  tutorName: string;
  tutorAvatarUrl?: string | null;
  subject?: string | null;
  scheduledStartAt: string;
  scheduledEndAt: string;
  redirectTo: string;
};

function TutorAvatar({
  name,
  avatarUrl,
  size = 80,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  const initials = name
    .replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white bg-brand"
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  );
}

function formatTimeNoSeconds(d: Date) {
  if (d.getMinutes() === 0) {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: true }).format(d);
  }
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

export default function OneOnOneRatingLockout({
  sessionId,
  tutorName,
  tutorAvatarUrl,
  subject,
  scheduledStartAt,
  scheduledEndAt,
  redirectTo,
}: Props) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formattedTime, setFormattedTime] = useState('');

  useEffect(() => {
    const start = new Date(scheduledStartAt);
    const end = new Date(scheduledEndAt);
    const datePart = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(start);
    setFormattedTime(
      `${datePart} · ${formatTimeNoSeconds(start)} – ${formatTimeNoSeconds(end)}`,
    );
  }, [scheduledStartAt, scheduledEndAt]);

  // Hard lockout — no escape
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    const onPopState = () => window.history.pushState(null, '', window.location.href);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  async function onSubmit() {
    if (stars < 1 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/feedback/student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          stars,
          comment: comment.trim() || null,
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
    <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/80 backdrop-blur-md p-4">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-pop p-6 sm:p-8 text-center">
        <div className="flex justify-center">
          <TutorAvatar name={tutorName} avatarUrl={tutorAvatarUrl} size={80} />
        </div>

        <div className="mt-4">
          <div className="text-base font-bold text-ink">{tutorName}</div>
          <div className="text-xs text-muted-foreground mt-0.5" suppressHydrationWarning>
            {subject ? `${subject} · ` : ''}
            {formattedTime || 'Loading…'}
          </div>
        </div>

        <h2 className="mt-6 text-2xl font-bold text-ink">How was your session?</h2>

        <div className="mt-5 flex justify-center">
          <StarInput value={stars} onChange={setStars} size={48} />
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Tell us more (optional)"
          rows={3}
          maxLength={500}
          className="mt-5 w-full p-3 rounded-xl border border-border bg-white text-sm resize-none focus:outline-none focus:border-brand"
        />

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 text-left">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={onSubmit}
          disabled={stars < 1 || submitting}
          className={cn(
            'mt-5 w-full py-3 rounded-2xl font-bold text-white transition-all',
            stars >= 1 && !submitting
              ? 'bg-brand hover:bg-brand-deep'
              : 'bg-gray-200 cursor-not-allowed text-gray-400',
          )}
        >
          {submitting ? 'Submitting…' : 'Submit Rating'}
        </button>
      </div>
    </div>
  );
}
