'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { StarInput } from './StarInput';
import { cn } from '@/lib/utils';

export type RatingPrompt = {
  id: string;
  student_id: string;
  class_id: string;
  billing_period: string;
  expires_at: string;
  snoozed_until: string | null;
  dismissed_count: number;
  status: string;
  groups?: { id: string; name: string; tutor_id?: string } | null;
};

type ClassRatingModalProps = {
  prompt: RatingPrompt;
  tutorName?: string;
  tutorAvatarUrl?: string | null;
  onClose: () => void;
  onSuccess: () => void;
};

function TutorAvatar({
  name,
  avatarUrl,
  size = 48,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  const initials = (name || 'T')
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
      className="rounded-full flex items-center justify-center font-bold text-white bg-brand-deep"
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  );
}

export function ClassRatingModal({
  prompt,
  tutorName = 'Your Tutor',
  tutorAvatarUrl,
  onClose,
  onSuccess,
}: ClassRatingModalProps) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const className = prompt.groups?.name ?? 'this class';

  // Escape key closes modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleSubmit() {
    if (stars < 1 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/ratings/class', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: prompt.class_id,
          billingPeriod: prompt.billing_period,
          stars,
          comment: comment.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Failed to submit rating.');
        setSubmitting(false);
        return;
      }
      onSuccess();
    } catch {
      setError('Failed to submit rating.');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-ink/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-3xl bg-white shadow-pop p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase font-bold tracking-wider text-brand-deep">
              {prompt.billing_period}
            </div>
            <h2 className="text-lg font-bold text-ink mt-0.5">{className}</h2>
          </div>
          <button
            onClick={onClose}
            className="size-8 grid place-items-center rounded-full hover:bg-muted transition"
            aria-label="Close"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>

        {/* Tutor row */}
        <div className="mt-4 flex items-center gap-3">
          <TutorAvatar name={tutorName} avatarUrl={tutorAvatarUrl} size={32} />
          <div>
            <div className="text-sm font-semibold text-ink">{tutorName}</div>
            <div className="text-xs text-muted-foreground">Tutor</div>
          </div>
        </div>

        <h3 className="mt-5 text-base font-semibold text-ink">
          How was {className} this {prompt.billing_period}?
        </h3>

        <div className="mt-3 flex justify-center">
          <StarInput value={stars} onChange={setStars} size={44} />
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Tell us more (optional)"
          rows={3}
          maxLength={500}
          className="mt-4 w-full p-3 rounded-xl border border-border bg-white text-sm resize-none focus:outline-none focus:border-brand"
        />

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:bg-muted transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={stars < 1 || submitting}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-semibold text-white transition',
              stars >= 1 && !submitting
                ? 'bg-brand hover:bg-brand-deep'
                : 'bg-gray-200 cursor-not-allowed text-gray-400',
            )}
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
