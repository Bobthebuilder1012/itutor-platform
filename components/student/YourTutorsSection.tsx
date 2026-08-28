'use client';

// "Your tutors" cards — handover §9.2.
//
// One card per tutor, group or 1:1, each with Request feedback and Message.
//
// THE DISABLED STATE IS THE FEATURE
// §9.2: the request is "disabled with a plain reason when the shared quota is
// used, naming who used it". A student who sees a greyed-out button and no
// explanation reads it as broken; one who reads "your parent requested feedback
// on 4 Sep — you share one request a month" understands the household shares it
// and stops trying. The sentence comes from the server so it is identical to the
// one the parent is shown (decision 13).
//
// Nothing here implies a timeframe once a request is sent. §8.1 bans "pending"
// and "expected", and there is no reminder behind it, so the confirmation says
// only that the tutor will answer when they can.

import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Loader2, MessageSquare } from 'lucide-react';

type Tutor = {
  id: string;
  name: string;
  avatar: string | null;
  verified: boolean;
  via: string | null;
  quota: {
    used: boolean;
    usedBy: 'parent' | 'student' | null;
    reason: string | null;
    nextOpens: string;
  };
};

export default function YourTutorsSection() {
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/student/my-tutors', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setTutors(json.tutors ?? []);
    } catch {
      // Additional section, not the page.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const request = async (tutorId: string) => {
    setBusyId(tutorId);
    try {
      const res = await fetch('/api/feedback/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // childId omitted: the endpoint defaults it to the caller, so the student
        // does not need to know their own id to ask for themselves.
        body: JSON.stringify({ tutorId }),
      });
      const json = await res.json();
      if (res.ok) {
        // No timeframe, deliberately (§8.1).
        setNote('Requested. Your tutor will answer when they can.');
      } else {
        // A 409 here is normally the shared quota: say who spent it, not "error".
        setNote(json.message ?? 'That could not be requested right now.');
      }
      await load();
    } finally {
      setBusyId(null);
      window.setTimeout(() => setNote(null), 6000);
    }
  };

  if (!loaded || tutors.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-ink">Your tutors</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          You can ask each tutor for feedback once a month. If a parent is linked to your account,
          you share that request with them.
        </p>
      </div>

      {note && (
        <div className="rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5 text-sm text-ink">
          {note}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {tutors.map((t) => (
          <article key={t.id} className="rounded-2xl border border-border p-4">
            <div className="flex items-start gap-3">
              {t.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.avatar}
                  alt=""
                  className="size-10 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-sm font-bold text-brand">
                  {t.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-bold text-ink">{t.name}</span>
                  {/* Decision 31: the only trust attribute the product holds. */}
                  {t.verified && <BadgeCheck className="size-4 shrink-0 text-brand" />}
                </div>
                {t.via && <p className="text-xs text-muted-foreground">Through {t.via}</p>}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => request(t.id)}
                disabled={t.quota.used || busyId === t.id}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyId === t.id && <Loader2 className="size-3.5 animate-spin" />}
                {t.quota.used ? 'Used this month' : 'Request feedback'}
              </button>
              <a
                href="/student/messages"
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-semibold text-ink transition hover:bg-muted"
              >
                <MessageSquare className="size-3.5" />
                Message tutor
              </a>
            </div>

            {/* Never a bare disabled button. */}
            {t.quota.used && t.quota.reason && (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {t.quota.reason}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
