'use client';

import { useState } from 'react';
import type { GroupMessage } from '@/lib/types/groups';
import UserAvatar from '@/components/UserAvatar';
import GroupMessageComposer from './GroupMessageComposer';

interface GroupMessageItemProps {
  message: GroupMessage;
  groupId: string;
  isTutor: boolean;
  currentUserId: string;
  onRefresh: () => void;
  isReply?: boolean;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function GroupMessageItem({
  message,
  groupId,
  isTutor,
  currentUserId,
  onRefresh,
  isReply = false,
}: GroupMessageItemProps) {
  const [showReply, setShowReply] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [lockLoading, setLockLoading] = useState(false);

  const isOwn = message.sender_id === currentUserId;
  const senderName = message.sender?.full_name ?? 'Member';

  const handlePin = async () => {
    setPinLoading(true);
    await fetch(`/api/groups/${groupId}/messages/${message.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_pinned: !message.is_pinned }),
    });
    setPinLoading(false);
    onRefresh();
  };

  const handleLock = async () => {
    setLockLoading(true);
    await fetch(`/api/groups/${groupId}/messages/${message.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_locked: !message.is_locked }),
    });
    setLockLoading(false);
    onRefresh();
  };

  const handleDelete = async () => {
    if (!confirm('Delete this message?')) return;
    await fetch(`/api/groups/${groupId}/messages/${message.id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <div className={`${isReply ? 'ml-10 mt-2' : 'mb-4'}`}>
      <div className={`flex gap-3 ${message.is_pinned ? 'bg-emerald-50 rounded-lg p-3 -mx-3' : ''}`}>
        {/* Avatar */}
        <div className="flex-shrink-0">
          <UserAvatar avatarUrl={message.sender?.avatar_url} name={senderName} size={32} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800">{senderName}</span>
            <span className="text-xs text-gray-400">{formatTime(message.created_at)}</span>
            {message.is_pinned && (
              <span className="text-xs text-emerald-600 font-medium">📌 Pinned</span>
            )}
            {message.is_locked && (
              <span className="text-xs text-gray-500">🔒 Locked</span>
            )}
          </div>

          {/* Body */}
          <p className="mt-0.5 text-sm text-gray-700 whitespace-pre-wrap break-words">{message.body}</p>

          {/* Actions */}
          <div className="mt-1.5 flex items-center gap-3">
            {!isReply && !message.is_locked && (
              <button
                onClick={() => setShowReply(!showReply)}
                className="text-xs text-gray-400 hover:text-emerald-600 transition-colors"
              >
                Reply
              </button>
            )}
            {isTutor && !isReply && (
              <>
                <button
                  onClick={handlePin}
                  disabled={pinLoading}
                  className="text-xs text-gray-400 hover:text-emerald-600 transition-colors disabled:opacity-40"
                >
                  {message.is_pinned ? 'Unpin' : 'Pin'}
                </button>
                <button
                  onClick={handleLock}
                  disabled={lockLoading}
                  className="text-xs text-gray-400 hover:text-amber-600 transition-colors disabled:opacity-40"
                >
                  {message.is_locked ? 'Unlock' : 'Lock'}
                </button>
              </>
            )}
            {(isOwn || isTutor) && (
              <button
                onClick={handleDelete}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                Delete
              </button>
            )}
          </div>

          {/* Reply composer */}
          {showReply && (
            <div className="mt-2">
              <GroupMessageComposer
                groupId={groupId}
                parentMessageId={message.id}
                placeholder="Write a reply…"
                compact
                onSent={() => {
                  setShowReply(false);
                  onRefresh();
                }}
                onCancel={() => setShowReply(false)}
              />
            </div>
          )}

          {/* Nested replies */}
          {!isReply && message.replies && message.replies.length > 0 && (
            <div className="mt-2 border-l-2 border-gray-100 pl-3">
              {message.replies.map((reply) => (
                <GroupMessageItem
                  key={reply.id}
                  message={reply}
                  groupId={groupId}
                  isTutor={isTutor}
                  currentUserId={currentUserId}
                  onRefresh={onRefresh}
                  isReply
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
