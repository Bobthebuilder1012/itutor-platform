'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { getConversations } from '@/lib/services/notificationService';
import { getDisplayName } from '@/lib/utils/displayName';
import type { ConversationWithParticipant } from '@/lib/types/notifications';
import { getRelativeTime } from '@/lib/utils/calendar';
import { Search, Send, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function StudentMessagesPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();

  const [conversations, setConversations] = useState<ConversationWithParticipant[]>([]);
  const [filtered, setFiltered] = useState<ConversationWithParticipant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile || profile.role !== 'student') { router.push('/login'); return; }
    loadConversations();
  }, [profile, profileLoading, router]);

  useEffect(() => {
    const q = searchQuery.toLowerCase();
    setFiltered(
      q
        ? conversations.filter((c) => {
            const name = getDisplayName(c.other_participant).toLowerCase();
            return name.includes(q) || (c.last_message_preview || '').toLowerCase().includes(q);
          })
        : conversations
    );
  }, [conversations, searchQuery]);

  async function loadConversations() {
    if (!profile) return;
    setLoading(true);
    try {
      const data = await getConversations(profile.id);
      setConversations(data);
      setFiltered(data);
      if (data.length > 0) setActiveId(data[0].id);
    } catch (err) {
      console.error('Error loading conversations:', err);
    } finally {
      setLoading(false);
    }
  }

  if (profileLoading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
      </div>
    );
  }

  const activeConv = conversations.find((c) => c.id === activeId);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid md:grid-cols-[300px_1fr] gap-4 h-[calc(100vh-9rem)]">
        {/* Conversation list */}
        <div className="rounded-2xl bg-background border border-border flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages…"
                className="w-full pl-9 pr-3 py-2 rounded-full bg-muted text-sm focus:outline-none focus:bg-background focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-1 p-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="size-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No conversations yet</p>
              </div>
            ) : (
              filtered.map((conv) => {
                const other = conv.other_participant;
                const name = getDisplayName(other);
                const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
                const hasUnread = conv.unread_count > 0;
                const isActive = conv.id === activeId;
                return (
                  <button
                    key={conv.id}
                    onClick={() => {
                      setActiveId(conv.id);
                      if (window.innerWidth < 768) router.push(`/student/messages/${conv.id}`);
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-3 hover:bg-muted/60 text-left border-b border-border',
                      isActive && 'bg-muted'
                    )}
                  >
                    <div className="size-10 rounded-full bg-gradient-to-br from-coral to-peach grid place-items-center text-white font-semibold flex-shrink-0 text-sm">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className={cn('font-semibold text-sm text-ink truncate', hasUnread && 'font-bold')}>{name}</div>
                        {conv.last_message_at && (
                          <div className="text-[10px] text-muted-foreground shrink-0">{getRelativeTime(conv.last_message_at)}</div>
                        )}
                      </div>
                      {conv.last_message_preview && (
                        <div className="text-xs text-muted-foreground truncate">{conv.last_message_preview}</div>
                      )}
                    </div>
                    {hasUnread && (
                      <span className="size-5 rounded-full bg-coral text-white text-[10px] font-bold grid place-items-center shrink-0">
                        {conv.unread_count > 9 ? '9+' : conv.unread_count}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Chat panel (desktop only) */}
        <div className="hidden md:flex rounded-2xl bg-background border border-border flex-col overflow-hidden">
          {activeConv ? (
            <>
              <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                <div className="size-9 rounded-full bg-gradient-to-br from-coral to-peach grid place-items-center text-white font-semibold text-sm">
                  {getDisplayName(activeConv.other_participant).split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-ink text-sm">{getDisplayName(activeConv.other_participant)}</div>
                  <div className="text-xs text-muted-foreground">Tutor · Online</div>
                </div>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <MessageSquare className="size-10 opacity-20" />
                <p className="text-sm">Open the full conversation</p>
                <Link
                  href={`/student/messages/${activeConv.id}`}
                  className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep transition"
                >
                  Open chat
                </Link>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); router.push(`/student/messages/${activeConv.id}`); }} className="p-3 border-t border-border flex items-center gap-2">
                <input
                  placeholder="Type a message…"
                  onClick={() => router.push(`/student/messages/${activeConv.id}`)}
                  readOnly
                  className="flex-1 px-4 py-2.5 rounded-full bg-muted text-sm focus:outline-none cursor-pointer"
                />
                <button type="submit" className="size-10 rounded-full bg-brand text-white grid place-items-center hover:bg-brand-deep">
                  <Send className="size-4" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessageSquare className="size-12 opacity-20" />
              <p className="text-sm">Select a conversation to start chatting</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
