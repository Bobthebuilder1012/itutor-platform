'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ChevronDownIcon, FaceSmileIcon } from '@heroicons/react/24/outline';
import { supabase } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/utils/displayName';
import { formatMessageTime } from '@/lib/utils/communityTimestamp';
import type { CommunityMessageV2WithAuthor } from '@/lib/types/communities';
import MessageComposer from './MessageComposer';
import ThreadReplies from './ThreadReplies';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😭', '🙏'];

interface MessageFeedProps {
  communityId: string;
  canPost: boolean;
  isAdmin: boolean;
  currentUserId: string | null;
  refreshTrigger?: number;
  searchQuery?: string;
}

function displayName(author: CommunityMessageV2WithAuthor['author']) {
  if (!author) return 'Unknown';
  return getDisplayName(author as { full_name?: string; username?: string; display_name?: string });
}

export default function MessageFeed({
  communityId,
  canPost,
  isAdmin,
  currentUserId,
  refreshTrigger = 0,
  searchQuery = '',
}: MessageFeedProps) {
  const [messages, setMessages] = useState<CommunityMessageV2WithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [reactionPickerOpenId, setReactionPickerOpenId] = useState<string | null>(null);
  const [reactionsByMessageId, setReactionsByMessageId] = useState<Record<string, { user_id: string; emoji: string }[]>>({});

  const load = () => {
    supabase
      .from('community_messages_v2')
      .select('*, author:profiles(id, full_name, username, avatar_url)')
      .eq('community_id', communityId)
      .is('parent_message_id', null)
      .order('created_at', { ascending: true })
      .limit(50)
      .then(({ data }) => {
        const list = (data as CommunityMessageV2WithAuthor[]) ?? [];
        setMessages(list);
        if (list.length > 0) {
          supabase
            .from('community_message_reactions_v2')
            .select('message_id, user_id, emoji')
            .in('message_id', list.map((m) => m.id))
            .then(({ data: reactions }) => {
              const byMsg: Record<string, { user_id: string; emoji: string }[]> = {};
              (reactions ?? []).forEach((r) => {
                if (!byMsg[r.message_id]) byMsg[r.message_id] = [];
                byMsg[r.message_id].push({ user_id: r.user_id, emoji: r.emoji });
              });
              setReactionsByMessageId(byMsg);
            });
        } else {
          setReactionsByMessageId({});
        }
      });
  };

  const loadFavorites = () => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('community_favorites_v2')
        .select('message_id')
        .eq('user_id', user.id)
        .then(({ data }) => setFavoriteIds(new Set((data ?? []).map((r) => r.message_id))));
    });
  };

  useEffect(() => {
    setLoading(true);
    load();
    loadFavorites();
    setLoading(false);
  }, [communityId, refreshTrigger]);

  const filtered = searchQuery.trim()
    ? messages.filter((m) => m.content.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : messages;

  const handleDelete = async (msg: CommunityMessageV2WithAuthor) => {
    if (currentUserId !== msg.user_id) return;
    await supabase.from('community_messages_v2').delete().eq('id', msg.id).eq('user_id', currentUserId);
    load();
  };

  const handlePinToggle = async (msg: CommunityMessageV2WithAuthor) => {
    if (!isAdmin) return;
    await supabase
      .from('community_messages_v2')
      .update({ is_pinned: !msg.is_pinned })
      .eq('id', msg.id);
    load();
  };

  const handleFavorite = async (msg: CommunityMessageV2WithAuthor) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const isFav = favoriteIds.has(msg.id);
    if (isFav) {
      await supabase.from('community_favorites_v2').delete().eq('user_id', user.id).eq('message_id', msg.id);
      setFavoriteIds((s) => { const n = new Set(s); n.delete(msg.id); return n; });
    } else {
      await supabase.from('community_favorites_v2').insert({ user_id: user.id, message_id: msg.id });
      setFavoriteIds((s) => new Set(s).add(msg.id));
    }
  };

  const handleCopyLink = (msg: CommunityMessageV2WithAuthor) => {
    const url = typeof window !== 'undefined' ? `${window.location.origin}/communities/${communityId}?msg=${msg.id}` : '';
    navigator.clipboard?.writeText(url);
  };

  const handleReaction = async (msg: CommunityMessageV2WithAuthor, emoji: string) => {
    if (!currentUserId) return;
    const existing = reactionsByMessageId[msg.id]?.find((r) => r.user_id === currentUserId);
    if (existing?.emoji === emoji) {
      await supabase
        .from('community_message_reactions_v2')
        .delete()
        .eq('message_id', msg.id)
        .eq('user_id', currentUserId);
    } else {
      await supabase
        .from('community_message_reactions_v2')
        .upsert({ message_id: msg.id, user_id: currentUserId, emoji }, { onConflict: 'message_id,user_id' });
    }
    setReactionPickerOpenId(null);
    load();
  };

  if (loading) return <p className="text-gray-500 p-4">Loading feed…</p>;
  if (filtered.length === 0)
    return (
      <div className="p-4 text-gray-500">
        {searchQuery ? 'No messages match your search.' : 'No messages yet. Be the first to post.'}
      </div>
    );

  return (
    <div className="space-y-4">
      {filtered.map((msg, index) => {
        const isLastMessage = index === filtered.length - 1;
        return (
        <div key={msg.id} className="group flex gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex-shrink-0 h-10 w-10 rounded-full overflow-hidden bg-gray-100">
            {msg.author?.avatar_url ? (
              <Image src={msg.author.avatar_url} alt="" width={40} height={40} className="h-10 w-10 object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-sm font-medium text-gray-500">
                {displayName(msg.author).charAt(0)}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0 relative">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="text-sm font-medium text-gray-900">{displayName(msg.author)}</span>
                <span className="text-xs text-gray-400">{formatMessageTime(msg.created_at)}</span>
                {msg.is_pinned && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Pinned</span>
                )}
              </div>
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setMenuOpenId(menuOpenId === msg.id ? null : msg.id)}
                  className={`p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-opacity ${menuOpenId === msg.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  aria-label="Message actions"
                >
                  <ChevronDownIcon className="w-5 h-5" />
                </button>
                {menuOpenId === msg.id && (
                  <>
                    <div className="fixed inset-0 z-10" aria-hidden onClick={() => setMenuOpenId(null)} />
                    <div
                      className={`absolute right-0 z-20 min-w-[140px] rounded-xl border border-gray-200 bg-white shadow-lg py-1 ${isLastMessage ? 'bottom-full mb-1' : 'top-full mt-1'}`}
                    >
                      {currentUserId === msg.user_id && (
                        <button
                          type="button"
                          onClick={() => { handleDelete(msg); setMenuOpenId(null); }}
                          className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => { handlePinToggle(msg); setMenuOpenId(null); }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          {msg.is_pinned ? 'Unpin' : 'Pin'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { handleFavorite(msg); setMenuOpenId(null); }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        {favoriteIds.has(msg.id) ? 'Unfavorite' : 'Favorite'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { handleCopyLink(msg); setMenuOpenId(null); }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Copy link
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2 mt-0.5">
              <div className="relative flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setReactionPickerOpenId(reactionPickerOpenId === msg.id ? null : msg.id)}
                  className={`p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-opacity ${reactionPickerOpenId === msg.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  aria-label="React to message"
                >
                  <FaceSmileIcon className="w-5 h-5" />
                </button>
                {reactionPickerOpenId === msg.id && (
                  <>
                    <div className="fixed inset-0 z-10" aria-hidden onClick={() => setReactionPickerOpenId(null)} />
                    <div className={`absolute left-0 z-20 flex gap-1 p-2 rounded-xl border border-gray-200 bg-white shadow-lg ${isLastMessage ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                      {QUICK_REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleReaction(msg, emoji)}
                          className="p-1.5 text-lg hover:bg-gray-100 rounded"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {msg.content ? <p className="text-gray-900 break-words">{msg.content}</p> : null}
                {msg.attachment_url && (
                  <div className="mt-2">
                    {msg.attachment_type === 'image' && (
                      <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="block">
                        <img src={msg.attachment_url} alt={msg.attachment_name || 'Image'} className="max-w-full max-h-48 rounded-lg object-cover" />
                      </a>
                    )}
                    {msg.attachment_type === 'voice' && (
                      <audio controls src={msg.attachment_url} className="max-w-full h-9" />
                    )}
                    {msg.attachment_type === 'file' && (
                      <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="text-sm text-itutor-green hover:underline break-all">
                        📎 {msg.attachment_name || 'Attachment'}
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
            {(reactionsByMessageId[msg.id]?.length ?? 0) > 0 && (
              <div className="flex justify-end mt-0.5 -mb-1">
                <div className="inline-flex items-center gap-0.5 rounded-full bg-white border border-gray-200 shadow-sm px-2 py-0.5 text-lg">
                  {reactionsByMessageId[msg.id].map((r, i) => (
                    <span key={`${r.user_id}-${r.emoji}-${i}`} title="Reaction">
                      {r.emoji}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === msg.id ? null : msg.id)}
                className="text-sm text-itutor-green hover:underline"
              >
                {expandedId === msg.id ? 'Hide replies' : 'Replies'}
              </button>
            </div>
            {expandedId === msg.id && (
              <ThreadReplies
                parentId={msg.id}
                communityId={communityId}
                canReply={canPost}
                onReplyPosted={load}
              />
            )}
          </div>
        </div>
        );
      })}
    </div>
  );
}
