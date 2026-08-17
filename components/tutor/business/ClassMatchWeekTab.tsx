'use client';

/**
 * Class Match Week, inside My Business.
 *
 * This is the teacher's whole campaign surface. It used to be a standalone page
 * at /tutor/class-match-week that nothing linked to; it lives here now because
 * My Business is where a teacher already goes to manage classes, pricing and
 * promotions, and a limited-time offer belongs beside them rather than in a
 * route only a direct link reaches. That old route redirects here.
 *
 * THE SEQUENCE THIS RENDERS, in the order a teacher meets it:
 *
 *   1. An intro, once — what the campaign is, with a way to read more. Dismissed
 *      permanently on "Let's start", because an explainer that reappears every
 *      visit reads as a page that has not noticed you.
 *   2. A requirements checklist, when something is missing. Every row names what
 *      to do and links to where it is done. The common blocker is having no
 *      published monthly class, so that row is the loudest.
 *   3. Opt in.
 *   4. Create sessions, and see the ones already created.
 *
 * WHY THE CHECKLIST IS COMPUTED CLIENT-SIDE rather than read from the opt-in
 * endpoint: that endpoint answers with failures only after a teacher taps Join,
 * which is too late to tell someone with no class what to do first. The clauses
 * are cheap and already loaded — useTutorCompletion queries the video
 * connection, and the published monthly classes are fetched here anyway for the
 * session form. The server gate remains authoritative; this is signposting.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Sparkles,
  CalendarDays,
  Wrench,
  Check,
  ArrowRight,
  Video,
  BookOpen,
  PartyPopper,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import TeacherSessionList, {
  type TeacherSession,
} from '@/components/classMatchWeek/teacher/TeacherSessionList';
import type { ClassMatchCampaign, ClassMatchSession } from '@/lib/classMatchWeek/types';
import type { ClassDefect } from '@/lib/classMatchWeek/eligibility';
import type { Profile } from '@/lib/types/database';

type BlockedClass = {
  groupId: string;
  defects: ClassDefect[];
  messages: string[];
  groupName?: string;
};

type TutorGroup = { id: string; name: string; price_monthly: number | null };

/**
 * Two one-time flags, per teacher, in localStorage.
 *
 * `INTRO_KEY` remembers that the explainer has been read.
 *
 * `WAS_BLOCKED_KEY` is how the "you meet all the requirements" prompt fires. A
 * teacher sent away to publish a class has to come back to find out whether it
 * worked, and the way back is not necessarily the link we gave them — they may
 * finish in My Classes and navigate here themselves. So rather than threading a
 * return param through the class-creation flow, we record that they were blocked
 * and congratulate them the next time they arrive un-blocked. That works from
 * every direction, including a fresh tab.
 */
const INTRO_KEY = 'cmw-teacher-intro-seen';
const WAS_BLOCKED_KEY = 'cmw-teacher-was-blocked';

/** Campaign dates are Trinidad wall-clock — never read groups.timezone. */
function formatAstDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-TT', {
    timeZone: 'America/Port_of_Spain',
    day: 'numeric',
    month: 'short',
  });
}

export default function ClassMatchWeekTab({ profile }: { profile: Profile | null }) {
  const completion = useTutorCompletion(profile);

  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<ClassMatchCampaign | null>(null);
  const [optedIn, setOptedIn] = useState(false);
  const [sessions, setSessions] = useState<TeacherSession[]>([]);
  const [blocked, setBlocked] = useState<BlockedClass[]>([]);
  const [groups, setGroups] = useState<TutorGroup[]>([]);

  const [optingIn, setOptingIn] = useState(false);
  const [optInError, setOptInError] = useState<string | null>(null);

  const [introSeen, setIntroSeen] = useState(true); // assume seen until localStorage says otherwise
  const [requirementsMet, setRequirementsMet] = useState(false);

  const load = useCallback(async () => {
    try {
      const [campRes, sessRes] = await Promise.all([
        fetch('/api/class-match/campaign'),
        fetch('/api/class-match/sessions'),
      ]);

      if (campRes.ok) {
        const json = await campRes.json();
        setCampaign(json.campaign ?? null);
      }
      if (sessRes.ok) {
        const json = await sessRes.json();
        setOptedIn(!!json.optedIn);
        setBlocked(json.blocked ?? []);
        setSessions(
          (json.sessions ?? []).map((s: ClassMatchSession & Partial<TeacherSession>) => ({
            ...s,
            groupName: s.groupName ?? '',
            reservedCount: s.reservedCount ?? 0,
          }))
        );
      }
    } catch (e) {
      console.error('[class-match-week] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    try {
      setIntroSeen(window.localStorage.getItem(INTRO_KEY) === '1');
    } catch {
      // Private mode or blocked storage: show the intro every time rather than
      // never. An explainer seen twice is a smaller failure than one never seen.
      setIntroSeen(false);
    }
  }, []);

  // The modal's class choices and the blocked section's names come from the
  // tutor's own catalogue — readable through RLS since the tutor is signed in.
  // Same filters as the eligibility gate: PUBLISHED + pricing_model MONTHLY
  // (never pricing_mode, which is NULL on some rows and whose union omits
  // MONTHLY), price from price_monthly (never the legacy `pricing` string).
  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('id, name, price_monthly')
        .eq('tutor_id', profile.id)
        .eq('status', 'PUBLISHED')
        .eq('pricing_model', 'MONTHLY')
        .is('archived_at', null);
      if (error) {
        console.error('[class-match-week] groups query failed:', error.message);
        return;
      }
      setGroups((data ?? []) as TutorGroup[]);
    })();
  }, [profile?.id]);

  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  // How many of the tutor's eligible classes can actually host a taster. Only a
  // count is needed here — the builder is its own page and loads the classes
  // itself, since it is reachable by direct link.
  const sessionableCount = useMemo(() => {
    const blockedIds = new Set(blocked.map((b) => b.groupId));
    return groups.filter((g) => !blockedIds.has(g.id)).length;
  }, [groups, blocked]);

  // ── the gate, mirrored for signposting ────────────────────────────────────
  const suspended = Boolean(profile?.is_suspended);
  const hasMeet = completion.videoProvider;
  const hasClass = groups.length > 0;
  const gateReady = !completion.loading && !loading;
  const eligible = gateReady && !suspended && hasMeet && hasClass;

  // Remember a blocked visit; congratulate on the first un-blocked one after.
  useEffect(() => {
    if (!gateReady) return;
    try {
      if (!eligible) {
        window.localStorage.setItem(WAS_BLOCKED_KEY, '1');
      } else if (window.localStorage.getItem(WAS_BLOCKED_KEY) === '1') {
        window.localStorage.removeItem(WAS_BLOCKED_KEY);
        // Only worth celebrating for someone who has not already started.
        if (!optedIn) setRequirementsMet(true);
      }
    } catch {
      // Storage unavailable — skip the prompt rather than break the tab.
    }
  }, [gateReady, eligible, optedIn]);

  const dismissIntro = () => {
    setIntroSeen(true);
    try {
      window.localStorage.setItem(INTRO_KEY, '1');
    } catch {
      /* nothing to persist to; the tab still works */
    }
  };

  const optIn = async () => {
    setOptingIn(true);
    setOptInError(null);
    try {
      const res = await fetch('/api/class-match/opt-in', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.optedIn) {
        setOptedIn(true);
        await load();
      } else {
        // The checklist above already names every clause, so the server's
        // failure list would repeat it. This only has to cover the race where
        // something changed between the page loading and the tap.
        setOptInError('Something changed — check the requirements above and try again.');
      }
    } catch {
      setOptInError('Could not join right now — please try again.');
    } finally {
      setOptingIn(false);
    }
  };

  const cancelSession = async (sessionId: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/class-match/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (res.ok) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? { ...s, status: 'cancelled', cancelled_at: new Date().toISOString() }
              : s
          )
        );
        return null;
      }
      const json = await res.json().catch(() => ({}));
      return json.error ?? 'Could not cancel this session — please try again.';
    } catch {
      return 'Could not cancel this session — please try again.';
    }
  };

  if (loading) {
    return (
      <div className="min-h-[300px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
      </div>
    );
  }

  // No live campaign — a quiet empty state and nothing else.
  if (!campaign) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <Sparkles className="size-10 mx-auto text-muted-foreground/40" />
        <h2 className="mt-3 text-xl font-bold text-ink">Class Match Week isn&apos;t running yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          When the next campaign opens, you&apos;ll be able to offer free taster sessions here.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Campaign header */}
      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-deep">
          <Sparkles className="size-3" /> Class Match Week
        </span>
        <h2 className="mt-2 text-2xl font-bold text-ink">{campaign.name}</h2>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="size-4" />
          {formatAstDate(campaign.starts_at)} – {formatAstDate(campaign.ends_at)}
        </p>
      </header>

      {/* 1 — the intro, once */}
      {!introSeen && !optedIn && (
        <section className="rounded-3xl border border-brand/30 bg-brand/5 p-6 sm:p-8">
          <h3 className="text-lg font-bold text-ink">Fill your class with a free half hour</h3>
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-ink">
            <p>
              For one week, families browsing iTutor can book a free 30-minute taster with you. They
              meet you, see how you teach, and decide.
            </p>
            <p>
              Everyone who turns up unlocks a discount on the class you ran the taster for — you set
              how much and how long it lasts. You keep every enrolment it produces.
            </p>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={dismissIntro}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep"
            >
              Let&rsquo;s start <ArrowRight className="size-4" />
            </button>
            <Link
              href="/class-match-week/for-teachers"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-deep hover:underline"
            >
              More about Class Match Week <ExternalLink className="size-3.5" />
            </Link>
          </div>
        </section>
      )}

      {/* 2 — requirements, when something is missing */}
      {introSeen && !eligible && !optedIn && (
        <section className="rounded-3xl border border-border bg-card p-6 sm:p-8">
          <h3 className="text-lg font-bold text-ink">Before you can join</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Class Match Week needs these three things. Sort them and this page opens up.
          </p>

          <ul className="mt-5 space-y-3">
            <RequirementRow
              met={!suspended}
              icon={Check}
              title="An account in good standing"
              help="There's an issue with your account — please contact support."
            />
            <RequirementRow
              met={hasMeet}
              icon={Video}
              title="Google Meet connected"
              help="Taster sessions run on Meet, and the link is created for you."
              actionHref="/tutor/video-setup"
              actionLabel="Connect Meet"
            />
            <RequirementRow
              met={hasClass}
              icon={BookOpen}
              title="A published class on monthly pricing"
              help="The taster is a sample of a real class, so you need one to run it for."
              actionHref="/tutor/classes/new"
              actionLabel="Create a class"
            />
          </ul>
        </section>
      )}

      {/* 3 — opt in */}
      {introSeen && eligible && !optedIn && (
        <section className="rounded-3xl border border-border bg-card p-6 sm:p-8">
          <h3 className="text-lg font-bold text-ink">Offer a free taster session</h3>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground leading-relaxed">
            Run a free 30-minute taster from a class you already teach. Families who attend unlock a
            discount on that class if they enrol.
          </p>
          {/*
           * Published and monthly is enough to JOIN — that is the server's gate —
           * but not enough to schedule anything: the class also needs a subject, a
           * recognised level and a live weekly schedule. On production 15 of 35
           * eligible classes have no schedule at all, so a teacher whose whole
           * catalogue is in that state would otherwise join and only then find
           * "Create a session" greyed out. Say it before they tap, not after.
           */}
          {sessionableCount === 0 && blocked.length > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">
                One thing to fix first
              </p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">
                You can join now, but none of your classes can host a taster yet — they each need a
                weekly schedule and a subject. You&rsquo;ll see exactly what&rsquo;s missing, and a
                link to fix it, as soon as you join.
              </p>
            </div>
          )}
          <button
            onClick={optIn}
            disabled={optingIn}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
          >
            {optingIn ? 'Joining…' : 'Join Class Match Week'}
          </button>
          {optInError && <p className="mt-3 text-sm text-coral">{optInError}</p>}
        </section>
      )}

      {/* 4 — create and manage */}
      {optedIn && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h3 className="text-lg font-bold text-ink">Your sessions</h3>
            <div className="flex flex-col items-start sm:items-end gap-1">
              {sessionableCount > 0 ? (
                <Link
                  href="/tutor/class-match-week/new"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep"
                >
                  <Plus className="size-3.5" /> Create a session
                </Link>
              ) : (
                <span className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white opacity-50">
                  <Plus className="size-3.5" /> Create a session
                </span>
              )}
              {sessionableCount === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {blocked.length > 0
                    ? 'Fix a blocked class below to create a session.'
                    : 'Publish a monthly-priced class first.'}
                </p>
              )}
            </div>
          </div>

          {sessions.length > 0 ? (
            <TeacherSessionList sessions={sessions} onCancel={cancelSession} />
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
              <CalendarDays className="size-10 mx-auto text-muted-foreground/40" />
              <p className="mt-3 text-sm font-semibold text-ink">No sessions yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create a free taster and families searching during the week can reserve a spot.
              </p>
            </div>
          )}

          {/* Blocked classes — every blocked teacher needs a way out */}
          {blocked.length > 0 && (
            <section className="space-y-3">
              <div>
                <h3 className="text-lg font-bold text-ink">Classes that need a fix</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  These classes can&apos;t host a taster session yet. Fix the issues and they&apos;ll
                  appear as choices when you create one.
                </p>
              </div>
              {blocked.map((b) => (
                <div key={b.groupId} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-amber-900">
                        {b.groupName ?? groupsById.get(b.groupId)?.name ?? 'One of your classes'}
                      </div>
                      <ul className="mt-1.5 space-y-1">
                        {b.messages.map((m) => (
                          <li key={m} className="text-xs text-amber-800">
                            {m}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Link
                      href={`/tutor/classes/${b.groupId}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      <Wrench className="size-3.5" /> Fix this class
                    </Link>
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {/* The requirements-met prompt, after a teacher comes back from fixing them */}
      {requirementsMet && (
        <Dialog onClose={() => setRequirementsMet(false)}>
          <PartyPopper className="size-10 text-brand" />
          <h3 className="mt-3 text-xl font-bold text-ink">You meet all the requirements</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Everything Class Match Week needs is in place. Join the campaign and create your first
            free taster session.
          </p>
          <button
            onClick={() => setRequirementsMet(false)}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep"
          >
            Let&rsquo;s start <ArrowRight className="size-4" />
          </button>
        </Dialog>
      )}

    </div>
  );
}

/** One clause of the gate, with somewhere to go when it fails. */
function RequirementRow({
  met,
  icon: Icon,
  title,
  help,
  actionHref,
  actionLabel,
}: {
  met: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  help: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={
          met
            ? 'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-brand/10 text-brand-deep'
            : 'mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground'
        }
      >
        {met ? <Check className="size-4" /> : <Icon className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className={met ? 'text-sm font-semibold text-ink' : 'text-sm font-bold text-ink'}>
          {title}
        </div>
        {!met && <p className="mt-0.5 text-xs text-muted-foreground">{help}</p>}
      </div>
      {!met && actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-deep"
        >
          {actionLabel} <ArrowRight className="size-3" />
        </Link>
      )}
    </li>
  );
}

/** Centred modal shell for the one-off prompt. Backdrop click closes. */
function Dialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-3xl border border-border bg-background p-6 text-center shadow-xl">
        <div className="flex flex-col items-center">{children}</div>
      </div>
    </div>
  );
}
