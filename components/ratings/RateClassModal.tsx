'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { StarInput } from './StarInput';

type Props = {
  className: string;
  billingPeriod?: string;
  tutorName: string;
  onClose: () => void;
  onSubmit: (rating: number, comment: string) => void;
};

function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  const initials = name
    .replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      className="rounded-full inline-flex items-center justify-center font-bold bg-brand/20 text-brand-deep"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

export function RateClassModal({ className, billingPeriod, tutorName, onClose, onSubmit }: Props) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const submit = () => {
    if (rating < 1) return;
    onSubmit(rating, comment);
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-background shadow-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            {billingPeriod && <div className="text-xs uppercase font-bold tracking-wider text-brand-deep">{billingPeriod}</div>}
            <h2 className="text-lg font-bold text-ink mt-0.5">{className}</h2>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-muted" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Avatar name={tutorName} size={48} />
          <div>
            <div className="text-sm font-semibold text-ink">{tutorName}</div>
            <div className="text-xs text-muted-foreground">Tutor</div>
          </div>
        </div>

        <h3 className="mt-5 text-base font-semibold text-ink">
          How was {className}{billingPeriod ? ` this ${billingPeriod}` : ''}?
        </h3>
        <div className="mt-3 flex justify-center">
          <StarInput value={rating} onChange={setRating} size={44} />
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Tell us more (optional)"
          rows={3}
          maxLength={500}
          className="mt-4 w-full p-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-brand"
        />

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={rating < 1}
            className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand/90 disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
