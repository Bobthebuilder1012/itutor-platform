'use client';

import { useCallback, useEffect, useState } from 'react';
import type { GroupMessage } from '@/lib/types/groups';
import GroupMessageItem from './GroupMessageItem';
import GroupMessageComposer from './GroupMessageComposer';

interface GroupMessageBoardProps {
  groupId: string;
  isTutor: boolean;
  currentUserId: string;
}

export default function GroupMessageBoard({
  groupId,
  isTutor,
  currentUserId,
}: GroupMessageBoardProps) {
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchMessages = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`/api/groups/${groupId}/messages`);
      if (!res.ok) throw new Error('Failed to load messages');
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch {
      setError('Could not load messages. Try refreshing.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Group Chat</h3>
        <button
          onClick={fetchMessages}
          className="text-xs text-gray-400 hover:text-emerald-600 transition-colors flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-1 mb-4">
        {messages.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            <div className="text-3xl mb-2">💬</div>
            No messages yet. Start the conversation.
          </div>
        ) : (
          messages.map((msg) => (
            <GroupMessageItem
              key={msg.id}
              message={msg}
              groupId={groupId}
              isTutor={isTutor}
              currentUserId={currentUserId}
              onRefresh={fetchMessages}
            />
          ))
        )}
      </div>

      {/* Composer */}
      <GroupMessageComposer
        groupId={groupId}
        onSent={fetchMessages}
      />
    </div>
  );
}
