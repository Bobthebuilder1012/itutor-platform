'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  context: string;
  endpoint: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

export default function AppealModal({
  open,
  title,
  context,
  endpoint,
  onClose,
  onSubmitted,
}: Props) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Failed to file appeal');
        return;
      }
      onSubmitted?.();
      setText('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to file appeal');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-gray-200 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 bg-amber-600 text-white rounded-t-2xl flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">{title}</h3>
            <p className="text-sm opacity-90 mt-1">Tell an admin what happened.</p>
          </div>
          <button onClick={onClose} disabled={submitting} className="opacity-80 hover:opacity-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-700">
            {context}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your appeal (minimum 20 characters)
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Explain the circumstances. Include any context an admin would need to review."
              className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 text-sm"
            />
            <div className="text-xs text-gray-400 mt-1 text-right">{text.trim().length}/20</div>
          </div>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex gap-2 justify-end rounded-b-2xl">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || text.trim().length < 20}
            onClick={() => void submit()}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit appeal'}
          </button>
        </div>
      </div>
    </div>
  );
}
