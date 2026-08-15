'use client';

// "Ask a tutor for feedback" — the parent half of §8.1's request model.
//
// THE QUOTA IS PER CHILD AND TUTOR, AND THE UI MUST SAY WHICH
// One request per student + tutor + calendar month, and it is SHARED with the
// child: if the child asked Mr Ali this month, the parent cannot ask Mr Ali again
// for that child. But a second child may still ask the same Mr Ali, even in the
// same class, because the quota is keyed on the pair — not on the tutor, and not
// on the parent.
//
// That distinction is invisible unless the screen shows it, so this panel is
// built around picking the STUDENT first: every tutor below is then annotated
// with that one child's state. A parent who sees "Used this month" while another
// child's button is live can read the rule straight off the page.
//
// NO TIMEFRAME, ANYWHERE. §8.1 bans "pending", "expected" and progress language,
// so a sent request says it was sent and when the next one opens — never when an
// answer is due. The platform does not guarantee one, and implying otherwise
// recreates the chasing pressure decision 12 removed.

import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, MessageSquareQuote, Users } from 'lucide-react';

type Child = { id: string; name: string };
type Teacher = { tutorId: string; tutorName: string; tutorAvatar: string | null };

type Quota = {
  used: boolean;
  usedBy: 'parent' | 'student' | null;
  usedByName: string | null;
  usedOn: string | null;
  nextOpens: string | null;
};

export default function RequestFeedbackPanel() {
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState<string>('');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [quotas, setQuotas] = useState<Record<string, Quota>>({});
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/parent/children/summary', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        const list: Child[] = (json.children ?? []).map((c: { id: string; name: string }) => ({
          id: c.id,
          name: c.name,
        }));
        setChildren(list);
        if (list.length > 0) setChildId(list[0].id);
      } catch {
        /* panel simply stays empty */
      }
    })();
  }, []);

  const loadTeachers = useCallback(async (id: string) => {
    setLoadingTeachers(true);
    setTeachers([]);
    setQuotas({});
    try {
      // Same source as the child's Messages tab: every teacher CONNECTED to the
      // child, not only those already messaged. A tutor you have never written to
      // is exactly the one you might want a report from.
      const res = await fetch(`/api/parent/children/${id}/messages`, { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      const list: Teacher[] = (json.threads ?? [])
        .filter((t: { tutorId?: string }) => Boolean(t.tutorId))
        .map((t: { tutorId: string; tutorName: string; tutorAvatar: string | null }) => ({
          tutorId: t.tutorId,
          tutorName: t.tutorName,
          tutorAvatar: t.tutorAvatar,
        }));
      setTeachers(list);

      // Quota is fetched per pair — it is the only thing that knows whether the
      // CHILD already spent the month's request.
      const entries = await Promise.all(
        list.map(async (t) => {
          try {
            const q = await fetch(
              `/api/feedback/requests?childId=${encodeURIComponent(id)}&tutorId=${encodeURIComponent(t.tutorId)}`,
              { cache: 'no-store' }
            );
            if (!q.ok) return [t.tutorId, null] as const;
            return [t.tutorId, (await q.json()) as Quota] as const;
          } catch {
            return [t.tutorId, null] as const;
          }
        })
      );
      const map: Record<string, Quota> = {};
      for (const [id2, q] of entries) if (q) map[id2] = q;
      setQuotas(map);
    } finally {
      setLoadingTeachers(false);
    }
  }, []);

  useEffect(() => {
    if (childId) void loadTeachers(childId);
  }, [childId, loadTeachers]);

  const request = async (tutorId: string) => {
    setSending(tutorId);
    setError(null);
    setNote(null);
    try {
      const res = await fetch('/api/feedback/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId, tutorId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'That request did not go through.');
        return;
      }
      setNote(json.message ?? 'Requested.');
      // Re-read rather than assume: the button's disabled state is the quota,
      // and guessing it locally is how a UI ends up out of step with the rule
      // the server actually enforces.
      await loadTeachers(childId);
    } catch {
      setError('That request did not go through.');
    } finally {
      setSending(null);
    }
  };

  if (children.length === 0) return null;

  const childFirst = children.find((c) => c.id === childId)?.name.split(' ')[0] ?? 'your child';

  return (
    <section className="rounded-2xl border border-border bg-background p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-deep">
          <MessageSquareQuote className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-ink">Ask a tutor for feedback</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            One request a month per student and tutor, shared with your child — if they have already
            asked this month, that request is the one that counts. Each child has their own, so
            asking for one does not use up another&rsquo;s.
          </p>
        </div>
      </div>

      {/* Student first: the quota is keyed on the pair, so the tutor list below
          means nothing until we know which child it is being read for. */}
      <div className="mt-4">
        <label htmlFor="feedback-child" className="block text-xs font-semibold text-muted-foreground">
          Feedback for student
        </label>
        <div className="mt-1 flex items-center gap-2">
          <Users className="size-4 shrink-0 text-muted-foreground" />
          <select
            id="feedback-child"
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-ink"
          >
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {note && (
        <p className="mt-3 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-xs text-ink">{note}</p>
      )}
      {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}

      <div className="mt-4">
        {loadingTeachers ? (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : teachers.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {childFirst} has no tutors yet. Once they join a class or book a session, their tutors
            appear here.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {teachers.map((t) => {
              const q = quotas[t.tutorId];
              const used = q?.used === true;
              return (
                <div key={t.tutorId} className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="flex items-center gap-2.5">
                    {t.tutorAvatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.tutorAvatar} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-deep">
                        {t.tutorName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-ink">{t.tutorName}</div>
                      {used && (
                        <div className="truncate text-[11px] text-muted-foreground">
                          {/* Who spent it matters: "you already asked" and "your
                              child already asked" are different facts. */}
                          {q?.usedBy === 'student'
                            ? `${childFirst} asked this month`
                            : 'You asked this month'}
                          {q?.usedOn ? ` · ${q.usedOn}` : ''}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => request(t.tutorId)}
                    disabled={used || sending === t.tutorId}
                    className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                  >
                    {sending === t.tutorId ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : used ? (
                      <Check className="size-3.5" />
                    ) : null}
                    {used ? 'Requested this month' : 'Request feedback'}
                  </button>

                  {used && q?.nextOpens && (
                    // The next opening, not a due date. §8.1.
                    <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                      Opens again in {q.nextOpens}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
