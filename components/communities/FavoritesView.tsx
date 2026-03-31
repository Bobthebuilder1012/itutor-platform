'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/utils/displayName';
import { formatMessageTime } from '@/lib/utils/communityTimestamp';
import type { CommunityMessageV2WithAuthor } from '@/lib/types/communities';
import UserAvatar from '@/components/UserAvatar';

interface FavoritesViewProps {
  communityId: string;
  className?: string;
}

export default function FavoritesView({ communityId, className = '' }: FavoritesViewProps) {
  const [messages, setMessages] = useState<(CommunityMessageV2WithAuthor & { favorite_id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setMessages([]);
        setLoading(false);
        return;
      }
      supabase
        .from('community_favorites_v2')
        .select('id, message_id')
        .eq('user_id', user.id)
        .then(({ data: favs }) => {
          if (!favs?.length) {
            setMessages([]);
            setLoading(false);
            return;
          }
          const msgIds = favs.map((f) => f.message_id);
          supabase
            .from('community_messages_v2')
            .select('*, author:profiles(id, full_name, username, avatar_url)')
            .eq('community_id', communityId)
            .in('id', msgIds)
            .order('created_at', { ascending: false })
            .then(({ data: msgs }) => {
              const byId = new Map((favs ?? []).map((f) => [f.message_id, f.id]));
              setMessages(
                ((msgs as CommunityMessageV2WithAuthor[]) ?? []).map((m) => ({
                  ...m,
                  favorite_id: byId.get(m.id) ?? '',
                }))
              );
              setLoading(false);
            });
        });
    });
  }, [communityId]);

  if (loading) return <p className="text-gray-500 p-4">Loading favorites…</p>;
  if (messages.length === 0)
    return (
      <div className={`rounded-2xl border border-gray-200 bg-white p-4 text-gray-500 ${className}`}>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Favorites</h3>
        <p className="text-sm">No favorited messages in this community.</p>
      </div>
    );

  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-3 ${className}`}>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Favorites</h3>
      <ul className="space-y-2">
        {messages.map((msg) => (
          <li key={msg.id} className="flex gap-2 text-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0">
            <UserAvatar
              avatarUrl={msg.author?.avatar_url}
              name={getDisplayName(msg.author as { full_name?: string; username?: string; display_name?: string })}
              size={32}
            />
            <div className="min-w-0 flex-1">
              <span className="font-medium text-gray-900">
                {getDisplayName(msg.author as { full_name?: string; username?: string; display_name?: string })}
              </span>
              <span className="text-gray-500 ml-2">{formatMessageTime(msg.created_at)}</span>
              <p className="text-gray-700 mt-0.5">{msg.content}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
