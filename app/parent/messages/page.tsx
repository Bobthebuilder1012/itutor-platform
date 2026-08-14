'use client';

// The parent's OWN thread with each tutor — kit ParentPhase2 `Messages`.
//
// WHY THIS HAD TO EXIST
// Decision 19: tutor messaging targets the parent when a child is linked. So
// tutors could already message parents — into an inbox that did not exist. This
// closes that loop.
//
// DECISION 24: TWO THREADS STAY SEPARATE
// This is the parent↔tutor conversation. It is NOT the child's thread, which the
// parent reads read-only under each child (§9.4) and can never post into — a
// parent posting there could impersonate the child to the tutor. The two are
// deliberately different surfaces with different rights, and the copy says so
// rather than leaving a parent to discover it by looking for a reply box in the
// wrong place.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, MessageSquare, Send, ShieldCheck } from 'lucide-react';
import ParentShell from '@/components/parent/ParentShell';
import { useProfile } from '@/lib/hooks/useProfile';
import {
  getMessages,
  getOrCreateConversation,
  sendMessage,
} from '@/lib/services/notificationService';

type Tutor = {
  id: string;
  name: string;
  avatar: string | null;
  verified: boolean;
  teaches: string[];
  via: string;
};

type Msg = { id: string; content: string; sender_id: string; created_at: string };

export default function ParentMessagesPage() {
  return (
    <ParentShell>
      <MessagesContent />
    </ParentShell>
  );
}

function MessagesContent() {
  const { profile } = useProfile();
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [openTutor, setOpenTutor] = useState<Tutor | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/parent/tutors', { cache: 'no-store' });
        if (res.ok) setTutors((await res.json()).tutors ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openThread = useCallback(
    async (tutor: Tutor) => {
      if (!profile?.id) return;
      setOpenTutor(tutor);
      setThreadLoading(true);
      setMessages([]);
      try {
        // Created on first open rather than up front: a parent who never messages
        // a tutor should not accumulate empty conversations.
        const convId = await getOrCreateConversation(profile.id, tutor.id);
        setConversationId(convId);
        const rows = await getMessages(convId, profile.id);
        setMessages(rows as unknown as Msg[]);
      } catch {
        setMessages([]);
      } finally {
        setThreadLoading(false);
      }
    },
    [profile?.id]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !conversationId || !profile?.id) return;
    setSending(true);
    try {
      await sendMessage(conversationId, profile.id, text);
      const rows = await getMessages(conversationId, profile.id);
      setMessages(rows as unknown as Msg[]);
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">Messages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your own conversation with each tutor. This is separate from your child&rsquo;s thread,
          which you can read under each child but not reply to.
        </p>
      </header>

      {tutors.length === 0 ? (
        <div className="rounded-2xl border border-border bg-background p-6">
          <MessageSquare className="size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-ink">No tutors yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Once one of your children is taught by a tutor, you can message them here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          {/* Thread list */}
          <div className="space-y-2">
            {tutors.map((t) => (
              <button
                key={t.id}
                onClick={() => openThread(t)}
                className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${
                  openTutor?.id === t.id
                    ? 'border-brand/40 bg-brand/5'
                    : 'border-border bg-background hover:bg-muted/40'
                }`}
              >
                {t.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.avatar} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand-deep">
                    {t.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-ink">{t.name}</span>
                    {t.verified && <ShieldCheck className="size-3.5 shrink-0 text-brand" />}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t.teaches.length > 0 ? `Teaches ${t.teaches.join(', ')}` : t.via}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {/* Conversation */}
          <div className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-border bg-background">
            {!openTutor ? (
              <div className="grid flex-1 place-items-center p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Pick a tutor to start or continue a conversation.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-border p-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-ink">{openTutor.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {openTutor.teaches.length > 0
                        ? `Teaches ${openTutor.teaches.join(', ')}`
                        : openTutor.via}
                    </div>
                  </div>
                  <Link
                    href={`/parent/tutors/${openTutor.id}`}
                    className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:bg-muted"
                  >
                    Profile
                  </Link>
                </div>

                <div className="flex-1 space-y-2.5 overflow-y-auto bg-muted/20 p-3.5">
                  {threadLoading ? (
                    <div className="flex justify-center py-8 text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                      No messages yet. Anything you send here goes to {openTutor.name.split(' ')[0]}
                      {' '}only — your child does not see this thread.
                    </p>
                  ) : (
                    messages.map((m) => {
                      const mine = m.sender_id === profile?.id;
                      return (
                        <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className="max-w-[80%]">
                            <div
                              className={`rounded-2xl border px-3 py-2 text-sm leading-relaxed ${
                                mine
                                  ? 'border-brand/30 bg-brand/10 text-ink'
                                  : 'border-border bg-background text-ink'
                              }`}
                            >
                              {m.content}
                            </div>
                            <div
                              className={`mt-1 text-[10px] text-muted-foreground ${mine ? 'text-right' : ''}`}
                            >
                              {new Date(m.created_at).toLocaleString('en-TT', {
                                day: 'numeric',
                                month: 'short',
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true,
                                timeZone: 'America/Port_of_Spain',
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={bottomRef} />
                </div>

                <div className="flex items-end gap-2 border-t border-border p-3">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    placeholder={`Message ${openTutor.name.split(' ')[0]}…`}
                    className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-ink placeholder:text-muted-foreground focus:border-brand focus:outline-none"
                  />
                  <button
                    onClick={send}
                    disabled={sending || !draft.trim()}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
