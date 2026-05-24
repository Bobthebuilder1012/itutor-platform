'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CommentTargetType } from '@/lib/types/comments';

const REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'inappropriate_language', label: 'Inappropriate language' },
  { value: 'misleading', label: 'Misleading information' },
  { value: 'other', label: 'Other' },
] as const;

type Props = {
  targetType: CommentTargetType;
  targetId: string;
  replyId?: string;
  onClose: () => void;
};

export function ReportCommentModal({ targetType, targetId, replyId, onClose }: Props) {
  const [reason, setReason] = useState<string>('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    const el = document.getElementById('report-modal-first');
    el?.focus();
  }, []);

  async function handleSubmit() {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      await fetch(`/api/comments/${targetType}/${targetId}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, body: body.trim() || undefined, replyId }),
      });
      setSubmitted(true);
      setTimeout(onClose, 1500);
    } catch {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/50 backdrop-blur-sm p-4" onClick={onClose}>
        <div className="w-full max-w-md rounded-3xl bg-white shadow-pop p-8 text-center" onClick={(e) => e.stopPropagation()}>
          <div className="size-12 rounded-full bg-brand-soft flex items-center justify-center mx-auto">
            <svg className="size-6 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-bold text-ink">Report received. Thank you.</h3>
          <p className="mt-2 text-sm text-muted-foreground">Our moderation team will review this shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/50 backdrop-blur-sm p-4" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-pop p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h2 id="report-modal-title" className="text-lg font-bold text-ink">Report this comment</h2>
          <button id="report-modal-first" onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-muted transition" aria-label="Close">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Help us keep iTutor a safe space. Reports are reviewed by our team.
        </p>

        <fieldset>
          <legend className="text-sm font-semibold text-ink mb-3">Reason</legend>
          <div className="space-y-2">
            {REASONS.map((r) => (
              <label
                key={r.value}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition',
                  reason === r.value ? 'border-brand bg-brand-soft' : 'border-border hover:border-gray-300',
                )}
              >
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="sr-only"
                />
                <div className={cn('size-4 rounded-full border-2 flex items-center justify-center', reason === r.value ? 'border-brand' : 'border-gray-400')}>
                  {reason === r.value && <div className="size-2 rounded-full bg-brand" />}
                </div>
                <span className="text-sm text-ink">{r.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4">
          <label className="block text-sm font-semibold text-ink mb-2">Tell us more (optional)</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Any additional context..."
            rows={3}
            maxLength={500}
            className="w-full p-3 rounded-xl border border-border bg-white text-sm resize-none focus:outline-none focus:border-brand"
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:bg-muted transition">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason || submitting}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-semibold text-white transition',
              reason && !submitting ? 'bg-brand hover:bg-brand-deep' : 'bg-gray-200 cursor-not-allowed text-gray-400',
            )}
          >
            {submitting ? 'Submitting…' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  );
}
