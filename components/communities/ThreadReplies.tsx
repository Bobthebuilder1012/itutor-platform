'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/utils/displayName';
import { formatMessageTime } from '@/lib/utils/communityTimestamp';
import type { CommunityMessageV2WithAuthor } from '@/lib/types/communities';
import MessageComposer from './MessageComposer';

interface ThreadRepliesProps {
  parentId: string;
  communityId: string;
  canReply: boolean;
  onReplyPosted?: () => void;
}

function displayName(author: CommunityMessageV2WithAuthor['author']) {
  if (!author) return 'Unknown';
  return getDisplayName(author as { full_name?: string; username?: string; display_name?: string });
}

export default function ThreadReplies({ parentId, communityId, canReply, onReplyPosted }: ThreadRepliesProps) {
  const [replies, setReplies] = useState<CommunityMessageV2WithAuthor[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    supabase
      .from('community_messages_v2')
      .select('*, author:profiles(id, full_name, username, avatar_url)')
      .eq('parent_message_id', parentId)
      .order('created_at', { ascending: true })
      .then(({ data }) => setReplies((data as CommunityMessageV2WithAuthor[]) ?? []));
  };

  useEffect(() => {
    setLoading(true);
    load();
    setLoading(false);
  }, [parentId]);

  return (
    <div className="ml-6 mt-2 pl-4 border-l-2 border-gray-200">
      {loading ? (
        <p className="text-sm text-gray-500">Loading replies…</p>
      ) : (
        <>
          {replies.map((r) => (
            <div key={r.id} className="flex gap-2 py-2">
              <div className="flex-shrink-0 h-8 w-8 rounded-full overflow-hidden bg-gray-100">
                {r.author?.avatar_url ? (
                  <Image src={r.author.avatar_url} alt="" width={32} height={32} className="h-8 w-8 object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs font-medium text-gray-500">
                    {displayName(r.author).charAt(0)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-gray-700">{displayName(r.author)}</span>
                <span className="text-xs text-gray-400 ml-2">{formatMessageTime(r.created_at)}</span>
                {r.content ? <p className="text-sm text-gray-900 mt-0.5">{r.content}</p> : null}
                {r.attachment_url && (
                  <div className="mt-1">
                    {r.attachment_type === 'image' && (
                      <a href={r.attachment_url} target="_blank" rel="noopener noreferrer">
                        <img src={r.attachment_url} alt={r.attachment_name || 'Image'} className="max-w-full max-h-32 rounded object-cover" />
                      </a>
                    )}
                    {r.attachment_type === 'voice' && <audio controls src={r.attachment_url} className="max-w-full h-8" />}
                    {r.attachment_type === 'file' && (
                      <a href={r.attachment_url} target="_blank" rel="noopener noreferrer" className="text-xs text-itutor-green hover:underline break-all">📎 {r.attachment_name || 'Attachment'}</a>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {canReply && (
            <MessageComposer
              communityId={communityId}
              parentMessageId={parentId}
              placeholder="Write a reply…"
              onPosted={() => {
                load();
                onReplyPosted?.();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
