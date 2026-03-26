'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';

interface NewMessageComposerProps {
  communityId: string;
  parentMessageId?: string | null;
  onPosted?: () => void;
  placeholder?: string;
}

export default function NewMessageComposer({
  communityId,
  parentMessageId = null,
  onPosted,
  placeholder = 'Write a message...',
}: NewMessageComposerProps) {
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = content.trim();
    if (!text || posting) return;
    setPosting(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not signed in');
      setPosting(false);
      return;
    }
    const { error: insertError } = await supabase.from('school_community_messages').insert({
      community_id: communityId,
      user_id: user.id,
      parent_message_id: parentMessageId,
      content: text,
    });
    setPosting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setContent('');
    onPosted?.();
  };

  return (
    <form onSubmit={handleSubmit} className="mb-4">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
        disabled={posting}
      />
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
      <button
        type="submit"
        disabled={posting || !content.trim()}
        className="mt-2 px-4 py-2 bg-itutor-green text-white rounded-lg hover:opacity-90 disabled:opacity-50 text-sm font-medium"
      >
        {parentMessageId ? 'Reply' : 'Post'}
      </button>
    </form>
  );
}
