'use client';

// The parent's read-only view of their child's tutor threads — §9.4.
//
// THREE THINGS THIS COMPONENT DELIBERATELY LACKS
// No composer, no reply button, no message input of any kind. §10.8 forbids a
// parent INSERT path "under any circumstance", and decision 24 keeps the two
// threads separate — a parent able to post here could impersonate the child to
// the tutor. The absence is the feature, so the footer says where the parent's
// own thread lives instead of leaving them looking for a text box.
//
// AND THE ONE THING IT MUST SAY
// "Your child can see that you have access to this conversation." §9.4 requires
// the disclosure to run both ways: the child is told, and the parent is told the
// child knows. A parent who believes this is covert behaves differently from one
// who knows it is open, and the product's safeguarding position depends on it
// being open.
//
// It also states the scope — messages from the link date forward — because
// anything older stays private and a parent who assumes otherwise will ask their
// child about a conversation they cannot actually see.

import { useCallback, useEffect, useState } from 'react';
import { Eye, Loader2, Lock } from 'lucide-react';

type Message = { id: string; fromChild: boolean; text: string; at: string };
type Thread = { id: string; tutorName: string; tutorAvatar: string | null; messages: Message[] };

export default function ChildMessageHistory({
  childId,
  childName,
}: {
  childId: string;
  childName: string;
}) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [since, setSince] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const first = childName.split(' ')[0];

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/parent/children/${childId}/messages`, { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setThreads(json.threads ?? []);
      setSince(json.since ?? null);
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sinceLabel = since
    ? new Date(since).toLocaleDateString('en-TT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'America/Port_of_Spain',
      })
    : null;

  if (loading) {
    return (
      <div className="flex justify-center py-10 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Both halves of §9.4's two-way disclosure, before any message is shown. */}
      <div className="flex items-start gap-2.5 rounded-xl border border-sky-300 bg-sky-50 px-3.5 py-3">
        <Eye className="mt-0.5 size-4 shrink-0 text-sky-700" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {first} can see that you have access to this conversation.
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            You are reading it, not taking part in it.
            {sinceLabel
              ? ` Messages from ${sinceLabel} onward — anything before you were linked stays private.`
              : ' Anything sent before you were linked stays private.'}
          </p>
        </div>
      </div>

      {threads.length === 0 ? (
        <div className="rounded-2xl border border-border bg-background p-6">
          <p className="text-sm text-ink">No messages with a tutor yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            When {first} messages one of their tutors, the conversation appears here.
          </p>
        </div>
      ) : (
        threads.map((t) => (
          <div key={t.id} className="overflow-hidden rounded-2xl border border-border bg-background">
            <div className="flex items-center gap-3 border-b border-border p-3.5">
              {t.tutorAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.tutorAvatar} alt="" className="size-9 rounded-full object-cover" />
              ) : (
                <div className="grid size-9 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand-deep">
                  {t.tutorName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-ink">
                  {first} &amp; {t.tutorName}
                </div>
              </div>
              <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Read only
              </span>
            </div>

            <div className="space-y-2.5 bg-muted/30 p-3.5">
              {t.messages.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nothing since you were linked.
                </p>
              ) : (
                t.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.fromChild ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className="max-w-[82%]">
                      <div
                        className={`rounded-2xl border px-3 py-2 text-sm leading-relaxed ${
                          m.fromChild
                            ? 'border-brand/30 bg-brand/10 text-ink'
                            : 'border-border bg-background text-ink'
                        }`}
                      >
                        {m.text}
                      </div>
                      <div
                        className={`mt-1 text-[10px] text-muted-foreground ${
                          m.fromChild ? 'text-right' : 'text-left'
                        }`}
                      >
                        {m.fromChild ? first : t.tutorName} · {m.at}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* No composer, and the reason stated rather than left as a gap. */}
            <div className="flex items-center gap-2 border-t border-border p-3">
              <Lock className="size-3.5 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                You cannot reply here. To speak to {t.tutorName}, use your own thread under Feedback.
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
