'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import type {
  SubjectCommunityWithSchool,
  SubjectCommunityMessageWithSender,
  SubjectCommunityPinnedSession,
} from '@/lib/types/subject-communities';

interface Member {
  id: string;
  full_name: string | null;
  username: string | null;
}

interface SubjectCommunityChatProps {
  community: SubjectCommunityWithSchool;
  communityId: string;
  communityTitle: string;
  initialMembers: Member[];
  initialMessages: SubjectCommunityMessageWithSender[];
  initialPinnedSessions?: SubjectCommunityPinnedSession[];
  currentUserId: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function senderName(msg: SubjectCommunityMessageWithSender): string {
  if (msg.message_type === 'system') return 'System';
  if (msg.sender) return msg.sender.full_name || msg.sender.username || 'Unknown';
  return 'A member';
}

function formatSessionDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SubjectCommunityChat({
  community,
  communityId,
  communityTitle,
  initialMembers,
  initialMessages,
  initialPinnedSessions = [],
  currentUserId,
}: SubjectCommunityChatProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [pinnedSessions] = useState(initialPinnedSessions);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const channel = supabase
      .channel(`subject-community:${communityId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'subject_community_messages',
          filter: `community_id=eq.${communityId}`,
        },
        (payload) => {
          const newMsg = payload.new as SubjectCommunityMessageWithSender;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [communityId]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    try {
      const res = await fetch(`/api/subject-communities/${communityId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageText: text }),
      });
      const data = await res.json();
      if (!data.ok) {
        setInput(text);
      }
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] min-h-[400px] -m-3 sm:-m-4 lg:-m-6 w-[calc(100%+1.5rem)] sm:w-[calc(100%+2rem)] lg:w-[calc(100%+3rem)]">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 py-3">
        <Link href="/communities" className="text-sm text-gray-500 hover:text-itutor-green">
          ← Communities
        </Link>
        <h1 className="text-lg font-semibold text-gray-900 truncate flex-1 text-center">
          {communityTitle}
        </h1>
        <button
          type="button"
          onClick={() => setMembersOpen((o) => !o)}
          className="lg:hidden rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Members
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Chat area - left / full on mobile */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
          >
            {messages.map((msg) => {
              if (msg.message_type === 'system') {
                return (
                  <div
                    key={msg.id}
                    className="flex justify-center"
                  >
                    <p className="text-sm text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full">
                      {msg.message_text}
                    </p>
                  </div>
                );
              }
              if (msg.message_type === 'pinned') {
                return (
                  <div key={msg.id} className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl border-2 border-amber-200 bg-amber-50 px-4 py-2">
                      <p className="text-xs font-medium text-amber-800">{senderName(msg)}</p>
                      <p className="text-sm text-gray-900">{msg.message_text}</p>
                      <p className="text-xs text-gray-500 mt-1">{formatTime(msg.created_at)}</p>
                    </div>
                  </div>
                );
              }
              const isOwn = msg.sender_id === currentUserId;
              return (
                <div
                  key={msg.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                      isOwn ? 'bg-itutor-green text-white' : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="text-xs font-medium opacity-90">{senderName(msg)}</p>
                    <p className="text-sm break-words">{msg.message_text}</p>
                    <p className="text-xs opacity-75 mt-1">{formatTime(msg.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input - fixed at bottom */}
          <div className="flex-shrink-0 px-4 py-3 bg-white border-t border-gray-200">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-itutor-green focus:outline-none focus:ring-1 focus:ring-itutor-green"
                disabled={sending}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="rounded-xl bg-itutor-green px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Send
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Stay productive. Keep discussions academic and respectful.
            </p>
          </div>
        </div>

        {/* Members panel - right side desktop, drawer on mobile */}
        <aside
          className={`${
            membersOpen ? 'block fixed inset-y-0 right-0 z-50 w-72 bg-white shadow-xl' : 'hidden'
          } lg:block lg:relative lg:w-[300px] lg:flex-shrink-0 lg:border-l lg:border-gray-200 lg:bg-gray-50/80 flex flex-col overflow-hidden`}
        >
          {membersOpen && (
            <button
              type="button"
              onClick={() => setMembersOpen(false)}
              className="lg:hidden absolute top-3 right-3 text-gray-500 hover:text-gray-700"
              aria-label="Close"
            >
              ✕
            </button>
          )}
          <div className="p-4 flex-shrink-0">
            <h3 className="text-sm font-semibold text-gray-700">Members</h3>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <ul className="space-y-1">
              {initialMembers.map((m) => (
                <li key={m.id} className="text-sm text-gray-700 truncate">
                  {m.full_name || m.username || 'Unknown'}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-shrink-0 p-4 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Pinned sessions</h3>
            {pinnedSessions.length === 0 ? (
              <p className="text-xs text-gray-500">No pinned sessions yet.</p>
            ) : (
              <ul className="space-y-3">
                {pinnedSessions.map((pin) => {
                  const s = pin.session;
                  const tutorName = s?.tutor?.full_name || s?.tutor?.username || 'Tutor';
                  const start = s?.scheduled_start_at ? new Date(s.scheduled_start_at) : null;
                  const joinUrl = s?.join_url;
                  return (
                    <li key={pin.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
                      <p className="font-medium text-gray-900">Community session</p>
                      <p className="text-xs text-gray-600 mt-0.5">{tutorName}</p>
                      {start && (
                        <p className="text-xs text-gray-500 mt-1">
                          {formatSessionDate(start.toISOString())} · {formatTime(start.toISOString())}
                        </p>
                      )}
                      {joinUrl ? (
                        <a
                          href={joinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-block rounded-lg bg-itutor-green px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                        >
                          Join
                        </a>
                      ) : (
                        <span className="mt-2 inline-block text-xs text-gray-400">Link not ready</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
