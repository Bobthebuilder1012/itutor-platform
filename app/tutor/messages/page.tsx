'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { getConversations } from '@/lib/services/notificationService';
import { getDisplayName } from '@/lib/utils/displayName';
import type { ConversationWithParticipant } from '@/lib/types/notifications';
import { getRelativeTime } from '@/lib/utils/calendar';
import ConversationView from '@/components/ConversationView';
import TutorShell from '@/components/tutor/TutorShell';
import { Search, MessageSquare, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0x7fffffff;
  return h % 360;
}

function ConvAvatar({ name, userId }: { name: string; userId: string }) {
  const hue = hashHue(userId || name);
  const initials = name.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <div
      className="size-11 rounded-full grid place-items-center text-white font-bold text-sm shrink-0"
      style={{ background: `linear-gradient(135deg, oklch(0.62 0.16 ${hue}), oklch(0.45 0.2 ${hue}))` }}
    >
      {initials}
    </div>
  );
}

export default function TutorMessagesPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationWithParticipant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile || profile.role !== 'tutor') { router.push('/login'); return; }
    loadConversations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, profileLoading, router]);

  async function loadConversations() {
    if (!profile) return;
    setLoading(true);
    try {
      const data = await getConversations(profile.id);
      setConversations(data);
      if (data.length > 0) setActiveId(data[0].id);
    } catch (err) {
      console.error('Error loading conversations:', err);
    } finally {
      setLoading(false);
    }
  }

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand" />
      </div>
    );
  }

  const filtered = conversations
    .filter(c => filter === 'unread' ? c.unread_count > 0 : true)
    .filter(c => {
      if (!searchQuery) return true;
      const name = getDisplayName(c.other_participant).toLowerCase();
      return name.includes(searchQuery.toLowerCase()) || (c.last_message_preview || '').toLowerCase().includes(searchQuery.toLowerCase());
    });

  const activeConv = conversations.find(c => c.id === activeId);
  const unreadCount = conversations.filter(c => c.unread_count > 0).length;

  return (
    <TutorShell>
      <div className="h-[calc(100vh-7rem)]">
        <div className="h-full rounded-2xl border border-border overflow-hidden grid md:grid-cols-[320px_1fr] bg-background shadow-card">

          {/* ── LEFT: Conversation list ── */}
          <div className={cn('flex flex-col border-r border-border bg-background', activeId && 'hidden md:flex')}>

            <div className="p-4 border-b border-border space-y-3">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-ink">Messages</h1>
                {unreadCount > 0 && (
                  <span className="text-xs font-bold text-white bg-brand rounded-full px-2.5 py-0.5">
                    {unreadCount} unread
                  </span>
                )}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search conversations…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-muted text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div className="flex gap-1.5">
                {(['all', 'unread'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-semibold transition',
                      filter === f ? 'bg-ink text-white' : 'bg-muted text-muted-foreground hover:text-ink'
                    )}
                  >
                    {f === 'all' ? `All (${conversations.length})` : `Unread (${unreadCount})`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="space-y-px p-3">
                  {[1, 2, 3, 4].map(i => <div key={i} className="h-[68px] rounded-xl bg-muted animate-pulse" />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 px-4">
                  <MessageSquare className="size-10 mx-auto mb-3 text-muted-foreground/25" />
                  <p className="text-sm font-semibold text-ink">
                    {filter === 'unread' ? 'No unread messages' : 'No messages yet'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {filter === 'unread' ? 'You\'re all caught up!' : 'Students who message you will appear here'}
                  </p>
                </div>
              ) : (
                filtered.map(conv => {
                  const other = conv.other_participant;
                  const name = getDisplayName(other);
                  const isActive = conv.id === activeId;
                  const hasUnread = conv.unread_count > 0;
                  return (
                    <button
                      key={conv.id}
                      onClick={() => {
                        setActiveId(conv.id);
                        if (window.innerWidth < 768) router.push(`/tutor/messages/${conv.id}`);
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-3.5 text-left border-b border-border/50 hover:bg-muted/50 transition-colors',
                        isActive && 'bg-brand-soft border-l-[3px] border-l-brand'
                      )}
                    >
                      <ConvAvatar name={name} userId={other?.id || name} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-1">
                          <span className={cn('text-sm truncate', hasUnread ? 'font-bold text-ink' : 'font-semibold text-ink')}>
                            {name}
                          </span>
                          {conv.last_message_at && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {getRelativeTime(conv.last_message_at)}
                            </span>
                          )}
                        </div>
                        {conv.last_message_preview ? (
                          <p className={cn('text-xs truncate mt-0.5', hasUnread ? 'text-ink font-medium' : 'text-muted-foreground')}>
                            {conv.last_message_preview}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground/50 mt-0.5 italic">No messages yet</p>
                        )}
                        {other?.role && (
                          <span className="text-[10px] text-muted-foreground/60 capitalize">{other.role}</span>
                        )}
                      </div>
                      {hasUnread && (
                        <span className="size-5 rounded-full bg-brand text-white text-[10px] font-bold grid place-items-center shrink-0">
                          {conv.unread_count > 9 ? '9+' : conv.unread_count}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ── RIGHT: Chat panel ── */}
          <div className={cn('flex flex-col', !activeId && 'hidden md:flex')}>
            {activeId && (
              <button
                onClick={() => setActiveId(null)}
                className="md:hidden flex items-center gap-2 px-4 py-3 text-sm font-semibold text-ink border-b border-border hover:bg-muted"
              >
                <ArrowLeft className="size-4" /> Back to messages
              </button>
            )}

            {activeConv && profile ? (
              <ConversationView
                conversationId={activeConv.id}
                currentUserId={profile.id}
                otherUserId={activeConv.other_participant?.id ?? ''}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="size-20 rounded-3xl bg-muted grid place-items-center">
                  <MessageSquare className="size-9 text-muted-foreground/30" />
                </div>
                <div>
                  <p className="text-base font-semibold text-ink">Your messages</p>
                  <p className="text-sm text-muted-foreground mt-1">Select a conversation from the left to start chatting</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </TutorShell>
  );
}
