'use client';

// Clients — the tutor's roll, and the one place feedback happens.
//
// It replaces My Students and Feedback, which were two lists of the same people
// answering different halves of one question: My Students said who they were and
// could not act; Feedback could act and said nothing about who they were. A
// tutor deciding whether to write feedback needs the attendance, the parent and
// the request in the same row as the button.
//
// WHAT A ROW SAYS, IN ORDER
//   the student        name, form, attendance with its denominator, joined
//   the parent         a slim bar: who they are, and a way to message them
//   the feedback       one button, in one of three states
//
// THE THREE FEEDBACK STATES ARE THE POINT
//   asked for      someone is waiting — the button is filled and the chip says
//                  who asked and when
//   already given  this calendar month is spent; the row says the date and when
//                  the next one opens, and there is nothing to press
//   neither        an outline button and a line saying nobody asked, because
//                  §8.1 forbids anything that reads like a deadline
//
// The monthly lock yields to an open request. A parent who asks in the same
// month the tutor already wrote must not find the tutor unable to answer them —
// being asked is a stronger signal than a quota.
//
// Attendance remains a report. Nothing in a row is editable, here or anywhere.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BookOpen,
  Check,
  Link2,
  Loader2,
  MessageSquare,
  MessageSquareQuote,
  Plus,
} from 'lucide-react';
import TutorShell from '@/components/tutor/TutorShell';
import FeedbackComposer from '@/components/tutor/FeedbackComposer';
import { useProfile } from '@/lib/hooks/useProfile';
import { getOrCreateConversation } from '@/lib/services/notificationService';
import { cn } from '@/lib/utils';

type Attendance = {
  label: string;
  rate: number | null;
  counted: number;
  attended: number;
  late: number;
  absent: number;
  cancelled: number;
  excluded: number;
};

type Client = {
  id: string;
  name: string;
  avatar: string | null;
  formLevel: string | null;
  classes: Array<{ id: string; name: string }>;
  joinedAt: string | null;
  parent: { id: string; name: string; avatar: string | null } | null;
  attendance: Attendance | null;
  openRequest: { id: string; requestedAt: string; by: string } | null;
  feedbackThisMonth: { id: string; at: string } | null;
};

type Filter = 'all' | 'requests' | 'given';

/** "1 Oct" — when this month's quota rolls over. */
function nextQuotaDate(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 12)).toLocaleDateString(
    'en-TT',
    { day: 'numeric', month: 'short', timeZone: 'America/Port_of_Spain' }
  );
}

function thisMonthName(): string {
  return new Date().toLocaleDateString('en-TT', {
    month: 'long',
    timeZone: 'America/Port_of_Spain',
  });
}

export default function TutorClientsPage() {
  return (
    <TutorShell>
      <ClientsContent />
    </TutorShell>
  );
}

function ClientsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { profile } = useProfile();
  const classId = params?.get('classId') ?? null;

  const [clients, setClients] = useState<Client[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [composingFor, setComposingFor] = useState<Client | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [messaging, setMessaging] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/clients', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok) {
        setClients(json.students ?? []);
        setClasses(json.classes ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Scoping to one class is what the breadcrumb means: the same page, narrowed.
  const scoped = useMemo(
    () => (classId ? clients.filter((c) => c.classes.some((k) => k.id === classId)) : clients),
    [clients, classId]
  );

  const counts = useMemo(
    () => ({
      all: scoped.length,
      requests: scoped.filter((c) => c.openRequest).length,
      given: scoped.filter((c) => c.feedbackThisMonth).length,
    }),
    [scoped]
  );

  const shown = useMemo(() => {
    if (filter === 'requests') return scoped.filter((c) => c.openRequest);
    if (filter === 'given') return scoped.filter((c) => c.feedbackThisMonth);
    return scoped;
  }, [scoped, filter]);

  const className = classId ? classes.find((c) => c.id === classId)?.name ?? null : null;

  /** Open the conversation with a student or their parent, creating it if new. */
  const message = async (otherId: string) => {
    if (!profile?.id || messaging) return;
    setMessaging(otherId);
    try {
      const conversationId = await getOrCreateConversation(profile.id, otherId);
      router.push(`/tutor/messages/${conversationId}`);
    } catch {
      setToast('Could not open that conversation.');
      window.setTimeout(() => setToast(null), 6000);
    } finally {
      setMessaging(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        {className && (
          <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <BookOpen className="size-3.5" />
            {className}
          </div>
        )}
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">Clients</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {className ? 'Everyone in this class.' : 'Everyone you teach, group classes and 1:1 together.'}{' '}
          Where a parent account is linked, they sit with the student — you can message either one.
          Feedback is one per student per month; {thisMonthName()}’s quota resets {nextQuotaDate()}.
        </p>
      </header>

      {toast && (
        <div className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-ink">
          {toast}
        </div>
      )}

      {/* Filters. Counts, not just labels — "Requests open · 0" is an answer, and
          a tutor should not have to click a tab to learn nobody is waiting. */}
      <div className="flex flex-wrap gap-2">
        <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={counts.all} />
        <FilterPill
          active={filter === 'requests'}
          onClick={() => setFilter('requests')}
          label="Requests open"
          count={counts.requests}
        />
        <FilterPill
          active={filter === 'given'}
          onClick={() => setFilter('given')}
          label="Feedback given"
          count={counts.given}
        />
      </div>

      {scoped.length === 0 && (
        <div className="rounded-2xl border border-border p-6">
          <p className="text-sm text-ink">No students yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Once someone joins a class or books a session, they appear here.
          </p>
        </div>
      )}

      {scoped.length > 0 && shown.length === 0 && (
        <div className="rounded-2xl border border-border p-6">
          <p className="text-sm text-ink">
            {filter === 'requests'
              ? 'Nobody has asked for feedback.'
              : 'No feedback written this month.'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {filter === 'requests'
              ? 'You can still write feedback unprompted — most feedback is.'
              : 'Feedback is optional. Nothing chases you for it.'}
          </p>
        </div>
      )}

      {shown.map((c) => {
        const first = c.name.split(' ')[0];
        // An open request outranks the monthly lock — see the note at the top.
        const canWrite = !c.feedbackThisMonth || Boolean(c.openRequest);

        return (
          <article key={c.id} className="overflow-hidden rounded-2xl border border-border">
            <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <Avatar url={c.avatar} name={c.name} size={44} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-ink">{c.name}</span>
                      {c.formLevel && (
                        <span className="text-xs text-muted-foreground">{c.formLevel}</span>
                      )}
                      {!c.parent && (
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          No parent linked
                        </span>
                      )}
                    </div>

                    {/* Attendance is a report. Nothing here is clickable. */}
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {c.attendance ? (
                        <>
                          Attendance{' '}
                          <strong className="tabular-nums text-ink">{c.attendance.label}</strong>
                          {c.attendance.excluded > 0 && (
                            <> · {c.attendance.excluded} not counted (class didn’t run)</>
                          )}
                        </>
                      ) : (
                        'No sessions recorded yet'
                      )}
                      {c.joinedAt && <span className="ml-3">Joined {c.joinedAt}</span>}
                    </p>

                    {!classId && c.classes.length > 0 && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {c.classes.map((k) => k.name).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => message(c.id)}
                  disabled={messaging === c.id}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-sm font-semibold text-ink transition hover:bg-muted disabled:opacity-60"
                >
                  {messaging === c.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <MessageSquare className="size-4" />
                  )}
                  Message <span className="font-bold">{first}</span>
                </button>
              </div>

              {/* The parent, when there is one: who they are and a way to reach
                  them, on one slim bar rather than a second card. */}
              {c.parent && (
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <Link2 className="size-3" />
                    Parent
                  </span>
                  <Avatar url={c.parent.avatar} name={c.parent.name} size={24} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                    {c.parent.name}
                  </span>
                  <button
                    onClick={() => message(c.parent!.id)}
                    disabled={messaging === c.parent.id}
                    aria-label={`Message ${c.parent.name}`}
                    className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-background text-muted-foreground transition hover:text-ink disabled:opacity-60"
                  >
                    {messaging === c.parent.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <MessageSquare className="size-3.5" />
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Feedback, in one of its three states. */}
            <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3.5">
              {c.feedbackThisMonth && !c.openRequest ? (
                <>
                  <span className="inline-flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-3.5 py-2 text-sm font-semibold text-brand-deep">
                    <Check className="size-4" />
                    Feedback sent {c.feedbackThisMonth.at}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    One per month — next available {nextQuotaDate()}.
                  </span>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setComposingFor(c)}
                    disabled={!canWrite}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition disabled:opacity-60',
                      c.openRequest
                        ? 'bg-brand text-white hover:bg-brand-deep'
                        : 'border border-border text-ink hover:bg-muted'
                    )}
                  >
                    {c.openRequest ? (
                      <MessageSquareQuote className="size-4" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Give feedback
                  </button>

                  {c.openRequest ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-[11px] font-bold text-purple-600">
                      <MessageSquareQuote className="size-3" />
                      Requested {c.openRequest.requestedAt}{' '}
                      <span className="font-medium">
                        by {c.openRequest.by === 'parent' ? 'parent' : 'student'}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Nobody asked — optional, one per month.
                    </span>
                  )}

                  {/* Answering a request the same month as an earlier note: the
                      quota gave way, and the row says so rather than looking
                      like the state above went missing. */}
                  {c.feedbackThisMonth && c.openRequest && (
                    <span className="text-xs text-muted-foreground">
                      Already wrote {c.feedbackThisMonth.at} — you can answer this request anyway.
                    </span>
                  )}
                </>
              )}
            </div>
          </article>
        );
      })}

      {shown.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Requests sort first. Attendance is recorded automatically and cannot be changed by anyone.
        </p>
      )}

      {composingFor && (
        <FeedbackComposer
          student={{
            id: composingFor.id,
            name: composingFor.name,
            parentName: composingFor.parent?.name ?? null,
            attendance: composingFor.attendance,
            openRequest: composingFor.openRequest,
          }}
          onClose={() => setComposingFor(null)}
          onSent={(message) => {
            setComposingFor(null);
            setToast(message);
            window.setTimeout(() => setToast(null), 6000);
            void load();
          }}
        />
      )}
    </div>
  );
}

// The kit draws a person as green initials, and their photo when there is one.
// components/UserAvatar falls back to a grey glyph, which reads as a missing
// image rather than as somebody.
function Avatar({ url, name, size }: { url: string | null; name: string; size: number }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-brand-deep"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {initials}
    </span>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-4 py-1.5 text-sm font-semibold transition',
        active
          ? 'border-brand-deep bg-brand-deep text-white'
          : 'border-border text-muted-foreground hover:bg-muted'
      )}
    >
      {label} · {count}
    </button>
  );
}
