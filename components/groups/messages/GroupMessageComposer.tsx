'use client';

import { useState } from 'react';

interface GroupMessageComposerProps {
  groupId: string;
  parentMessageId?: string;
  placeholder?: string;
  onSent: () => void;
  onCancel?: () => void;
  compact?: boolean;
}

export default function GroupMessageComposer({
  groupId,
  parentMessageId,
  placeholder = 'Write a message…',
  onSent,
  onCancel,
  compact = false,
}: GroupMessageComposerProps) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/groups/${groupId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: body.trim(),
          parent_message_id: parentMessageId ?? undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to send message');
        return;
      }

      setBody('');
      onSent();
    } catch {
      setError('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={compact ? '' : 'border-t border-gray-100 pt-4'}>
      <div className="flex gap-2 items-end">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={placeholder}
          rows={compact ? 1 : 3}
          disabled={submitting}
          className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && compact) {
              e.preventDefault();
              handleSubmit(e as any);
            }
          }}
        />
        <div className="flex flex-col gap-1">
          <button
            type="submit"
            disabled={submitting || !body.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
          >
            {submitting ? 'Sending…' : 'Send'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 px-4 py-1.5 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </form>
  );
}
