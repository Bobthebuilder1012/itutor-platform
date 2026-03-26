'use client';

import { useState } from 'react';

interface AnnouncementComposerProps {
  groupId: string;
  onSent?: () => void;
}

export default function AnnouncementComposer({ groupId, onSent }: AnnouncementComposerProps) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/groups/${groupId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (!res.ok) throw new Error('Failed to post');
      setBody('');
      setSent(true);
      setTimeout(() => setSent(false), 3000);
      onSent?.();
    } catch {
      setError('Could not post. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Post a message or announcement to the group…"
        rows={3}
        disabled={submitting}
        className="w-full resize-none border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
      />
      <div className="flex items-center justify-between">
        {error && <p className="text-xs text-red-500">{error}</p>}
        {sent && <p className="text-xs text-emerald-600">Message posted!</p>}
        {!error && !sent && <span />}
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {submitting ? 'Posting…' : 'Post'}
        </button>
      </div>
    </form>
  );
}
