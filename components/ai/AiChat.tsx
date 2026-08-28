'use client';

/**
 * The conversation surface — a transcript and a composer that stays put.
 *
 * This is what E1(b) was missing: inside a flow a tutor could only tap chips,
 * so there was no way to ask a question, refine a result in words, or say
 * "make it harder". The composer here accepts free text and is always present.
 *
 * Replies stream. Measured first token is ~4.9s — well short of the 21-30s a
 * queued generation takes, but not instant, because the model thinks before it
 * writes and that cannot be turned off. Hence the typing indicator: it has to
 * carry roughly five seconds of silence, so it renders the moment the turn is
 * created rather than once text arrives.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, Sparkles, User } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AiChatProps {
  conversationId: string;
  title?: string;
  initialMessages: ChatMessage[];
  /** Rendered above the transcript, e.g. the artifact this chat is about. */
  header?: React.ReactNode;
  /**
   * A question typed in the hub composer, sent once on mount.
   *
   * The tutor already typed it; making them retype it on arrival would be the
   * same discourtesy the seeded summary card exists to avoid.
   */
  autoSend?: string;
}

export default function AiChat({
  conversationId,
  title,
  initialMessages,
  header,
  autoSend,
}: AiChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Follow the stream, but only while it is running — yanking the viewport
  // back down while someone is scrolling up to re-read is worse than not
  // following at all.
  useEffect(() => {
    if (!streaming) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streaming]);

  /**
   * @param override - send this instead of the draft. Used by autoSend, which
   *   must not depend on draft state having landed first.
   */
  const send = useCallback(async (override?: string) => {
    const text = (override ?? draft).trim();
    if (!text || streaming) return;

    setDraft('');
    setError(null);
    setStreaming(true);

    // Both turns go in optimistically: the question so it never appears to be
    // lost, and an empty assistant turn for the stream to fill.
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '' },
    ]);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, message: text }),
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({}));

        // A ceiling reached is not the same as something broken, and the two
        // should not read alike. 429 carries a wait; say it.
        if (res.status === 429) {
          const wait = Number(json.retryAfterSeconds ?? 0);
          const when =
            wait > 90
              ? `about ${Math.ceil(wait / 60)} minutes`
              : wait > 0
                ? `about ${wait} seconds`
                : 'a moment';
          throw new Error(`${json.error ?? 'Too many messages.'} Try again in ${when}.`);
        }

        throw new Error(json.error ?? 'Could not get a reply.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') {
            next[next.length - 1] = { ...last, content: last.content + chunk };
          }
          return next;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get a reply.');
      // Drop the empty assistant turn so a failure does not leave a blank
      // bubble that looks like the model said nothing.
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant' && !last.content) next.pop();
        return next;
      });
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }, [draft, streaming, conversationId]);

  // Fire the carried-over question exactly once, and only into a conversation
  // that has none — re-sending on every mount would duplicate the turn each
  // time the tutor navigated back to it.
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (autoSentRef.current) return;
    if (!autoSend?.trim()) return;
    if (initialMessages.length > 0) return;

    autoSentRef.current = true;
    send(autoSend);
  }, [autoSend, initialMessages.length, send]);

  return (
    <div className="w-full max-w-[680px] mx-auto flex flex-col min-h-[calc(100vh-12rem)]">
      <div className="flex items-center gap-2">
        <Link
          href="/tutor/ai"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="size-4" /> iTutor AI
        </Link>
      </div>

      {title && (
        <h1 className="mt-3 font-display text-[20px] font-bold tracking-tight">{title}</h1>
      )}

      {header && <div className="mt-4">{header}</div>}

      <div className="flex-1 mt-5 space-y-4">
        {messages.length === 0 && (
          <div className="rounded-2xl border-2 border-surface-border bg-background px-[18px] py-4">
            <div className="text-[13.5px] font-semibold">Ask me anything about your teaching.</div>
            <div className="mt-1 text-[13px] text-ink-muted leading-relaxed">
              I can look at the plans, sheets and quizzes you&apos;ve made here. Try
              &ldquo;what did I set on Trigonometry?&rdquo; or &ldquo;make that quiz
              harder&rdquo;.
            </div>
          </div>
        )}

        {messages
          .filter((m) => m.role !== 'system')
          .map((message, i) => {
            const mine = message.role === 'user';
            return (
              <div key={message.id ?? i} className={cn('flex gap-3', mine && 'justify-end')}>
                {!mine && (
                  <div className="size-7 shrink-0 rounded-lg bg-brand-light text-brand-dark grid place-items-center">
                    <Sparkles className="size-3.5" />
                  </div>
                )}

                <div
                  className={cn(
                    'max-w-[80%] px-4 py-2.5 rounded-2xl text-[13.5px] leading-relaxed whitespace-pre-wrap',
                    mine
                      ? 'bg-ink text-white rounded-br-md'
                      : 'bg-background border-2 border-surface-border rounded-bl-md'
                  )}
                >
                  {message.content || (
                    // The assistant turn exists but nothing has arrived yet.
                    <span className="inline-flex gap-1 py-1" aria-label="Thinking">
                      {[0, 150, 300].map((delay) => (
                        <span
                          key={delay}
                          className="size-1.5 rounded-full bg-ink-muted animate-pulse"
                          style={{ animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </span>
                  )}
                </div>

                {mine && (
                  <div className="size-7 shrink-0 rounded-lg bg-muted text-ink-muted grid place-items-center">
                    <User className="size-3.5" />
                  </div>
                )}
              </div>
            );
          })}

        <div ref={endRef} />
      </div>

      {error && (
        <div className="mt-3 px-4 py-3 rounded-xl bg-danger-bg text-danger-fg text-[13px] font-medium">
          {error}
        </div>
      )}

      <div className="sticky bottom-0 mt-6 pt-6 pb-3 bg-gradient-to-b from-transparent via-surface-soft/70 to-surface-soft">
        <div className="flex items-end gap-2 px-4 py-2.5 bg-background border-2 border-surface-border rounded-2xl focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-light transition-all duration-200">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              // Grow with the content; a one-line box for a paragraph of
              // context is its own small obstacle.
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter breaks the line.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask a question, or say what to change…"
            className="flex-1 bg-transparent outline-none text-[14px] resize-none py-1 max-h-40"
          />
          <button
            onClick={() => send()}
            disabled={!draft.trim() || streaming}
            aria-label="Send"
            className="size-8 shrink-0 grid place-items-center rounded-lg bg-brand text-white disabled:opacity-35 disabled:cursor-not-allowed hover:bg-brand-dark transition-all duration-200 active:scale-95 disabled:active:scale-100"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
        <div className="mt-2 text-center text-[11.5px] text-ink-muted">
          Answers can be wrong. Check anything you hand to a student.
        </div>
      </div>
    </div>
  );
}
