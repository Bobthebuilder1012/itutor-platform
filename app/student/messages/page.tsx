'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { getConversations } from '@/lib/services/notificationService';
import { getDisplayName } from '@/lib/utils/displayName';
import type { ConversationWithParticipant } from '@/lib/types/notifications';
import { getRelativeTime } from '@/lib/utils/calendar';
import { getAvatarColor } from '@/lib/utils/avatarColors';
import UserAvatar from '@/components/UserAvatar';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function StudentMessagesPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  
  const [conversations, setConversations] = useState<ConversationWithParticipant[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<ConversationWithParticipant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'student') {
      router.push('/login');
      return;
    }

    loadConversations();
  }, [profile, profileLoading, router]);

  useEffect(() => {
    // Filter conversations based on search and filter
    let filtered = conversations;

    // Apply unread filter
    if (filter === 'unread') {
      filtered = filtered.filter(c => c.unread_count > 0);
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => {
        const otherUserName = getDisplayName(c.other_participant).toLowerCase();
        const lastMessage = c.last_message_preview?.toLowerCase() || '';
        return otherUserName.includes(query) || lastMessage.includes(query);
      });
    }

    setFilteredConversations(filtered);
  }, [conversations, searchQuery, filter]);

  async function loadConversations() {
    if (!profile) return;

    setLoading(true);
    try {
      const data = await getConversations(profile.id);
      setConversations(data);
      setFilteredConversations(data);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setLoading(false);
    }
  }

  const unreadCount = conversations.filter(c => c.unread_count > 0).length;

  if (profileLoading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink">Messages</h1>
          <p className="text-sm text-muted-foreground mt-1">Conversations with your iTutors</p>
        </div>
        {unreadCount > 0 && (
          <span className="px-3 py-1.5 rounded-full bg-coral-soft text-coral text-sm font-semibold">
            {unreadCount} unread
          </span>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full pl-9 pr-4 py-2.5 rounded-full bg-background border border-border focus:outline-none focus:ring-2 focus:ring-brand text-sm"
          />
        </div>
        <div className="inline-flex bg-background border border-border p-1 rounded-2xl gap-0.5">
          {(['all', 'unread'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-xl px-4 py-1.5 text-sm font-medium transition capitalize',
                filter === f ? 'bg-brand-soft text-forest shadow-sm' : 'text-muted-foreground hover:text-ink'
              )}
            >
              {f} {f === 'all' ? `(${conversations.length})` : `(${unreadCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* Conversations List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : filteredConversations.length === 0 ? (
        <div className="text-center py-16 rounded-3xl bg-background border border-border">
          <div className="size-14 mx-auto rounded-2xl bg-muted grid place-items-center mb-3">
            <Search className="size-6 text-muted-foreground" />
          </div>
          {searchQuery || filter === 'unread' ? (
            <>
              <p className="font-semibold text-ink">No conversations found</p>
              <p className="text-sm text-muted-foreground mt-1">Try adjusting your search or filter</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-ink">No messages yet</p>
              <p className="text-sm text-muted-foreground mt-1 mb-5">Book a session with an iTutor to start chatting!</p>
              <Link href="/student/find-tutors" className="px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep transition">
                Find iTutors
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-3xl bg-background border border-border overflow-hidden divide-y divide-border">
          {filteredConversations.map((conversation) => {
            const otherUser = conversation.other_participant;
            const hasUnread = conversation.unread_count > 0;
            const displayNameStr = getDisplayName(otherUser);
            const initials = displayNameStr.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

            return (
              <Link
                key={conversation.id}
                href={`/student/messages/${conversation.id}`}
                className={cn(
                  'flex items-center gap-4 px-4 py-4 hover:bg-muted/40 transition',
                  hasUnread && 'bg-brand-soft/30'
                )}
              >
                <div className="relative flex-shrink-0">
                  <UserAvatar avatarUrl={otherUser?.avatar_url} name={displayNameStr} size={44} />
                  {hasUnread && (
                    <div className="absolute -top-1 -right-1 size-5 rounded-full bg-coral flex items-center justify-center text-[10px] font-bold text-white">
                      {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={cn('text-sm font-semibold truncate', hasUnread ? 'text-ink' : 'text-ink/80')}>
                      {displayNameStr}
                    </h3>
                    {conversation.last_message_at && (
                      <span className="text-[11px] text-muted-foreground shrink-0">{getRelativeTime(conversation.last_message_at)}</span>
                    )}
                  </div>
                  {conversation.last_message_preview && (
                    <p className={cn('text-xs truncate mt-0.5', hasUnread ? 'text-ink/80 font-medium' : 'text-muted-foreground')}>
                      {conversation.last_message_preview}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}


