'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Sparkles, CalendarDays, Wrench, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useProfile } from '@/lib/hooks/useProfile';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import TutorShell from '@/components/tutor/TutorShell';
import SessionCreateModal, {
  type SessionableClass,
} from '@/components/classMatchWeek/teacher/SessionCreateModal';
import TeacherSessionList, {
  type TeacherSession,
} from '@/components/classMatchWeek/teacher/TeacherSessionList';
import type { ClassMatchCampaign, ClassMatchSession } from '@/lib/classMatchWeek/types';
import type { EligibilityFailure, ClassDefect } from '@/lib/classMatchWeek/eligibility';

type BlockedClass = {
  groupId: string;
  defects: ClassDefect[];
  messages: string[];
  groupName?: string;
};

type TutorGroup = { id: string; name: string; price_monthly: number | null };

export default function ClassMatchWeekPage() {
  return (
    <TutorShell>
      <ClassMatchWeekContent />
    </TutorShell>
  );
}

/** Campaign dates are Trinidad wall-clock — never read groups.timezone. */
function formatAstDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-TT', {
    timeZone: 'America/Port_of_Spain',
    day: 'numeric',
    month: 'short',
  });
}

function ClassMatchWeekContent() {
  const { profile } = useProfile();

  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<ClassMatchCampaign | null>(null);
  const [optedIn, setOptedIn] = useState(false);
  const [sessions, setSessions] = useState<TeacherSession[]>([]);
  const [blocked, setBlocked] = useState<BlockedClass[]>([]);
  const [groups, setGroups] = useState<TutorGroup[]>([]);

  const [optingIn, setOptingIn] = useState(false);
  const [optInFailures, setOptInFailures] = useState<EligibilityFailure[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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

  const groupsById = useMemo(
    () => new Map(groups.map((g) => [g.id, g])),
    [groups]
  );

  // Sessionable = the tutor's eligible classes minus everything the API blocked.
  const sessionableClasses: SessionableClass[] = useMemo(() => {
    const blockedIds = new Set(blocked.map((b) => b.groupId));
    return groups
      .filter((g) => !blockedIds.has(g.id))
      .map((g) => ({
        id: g.id,
        name: g.name,
        priceLabel: `${fmtTTD(g.price_monthly)}/mo`,
      }));
  }, [groups, blocked]);

  const optIn = async () => {
    setOptingIn(true);
    setOptInFailures([]);
    try {
      const res = await fetch('/api/class-match/opt-in', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.optedIn) {
        setOptedIn(true);
        await load();
      } else {
        setOptInFailures(json.failures ?? []);
      }
    } catch {
      setOptInFailures([]);
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
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
      </div>
    );
  }

  // No live campaign — a quiet empty state and nothing else.
  if (!campaign) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <Sparkles className="size-10 mx-auto text-muted-foreground/40" />
        <h1 className="mt-3 text-xl font-bold text-ink">Class Match Week isn&apos;t running yet</h1>
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
        <h1 className="mt-2 text-2xl lg:text-3xl font-bold text-ink">{campaign.name}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="size-4" />
          {formatAstDate(campaign.starts_at)} – {formatAstDate(campaign.ends_at)}
        </p>
      </header>

      {/* A publish-time warning from the API (e.g. the Meet link caveat) */}
      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-800">{notice}</p>
          <button
            onClick={() => setNotice(null)}
            className="shrink-0 text-amber-500 hover:text-amber-700"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {!optedIn ? (
        /* Opt-in card — the whole deal in two sentences */
        <section className="rounded-3xl border border-border bg-card p-6 sm:p-8">
          <h2 className="text-lg font-bold text-ink">Offer a free taster session</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground leading-relaxed">
            Run a free 30-minute taster from a class you already teach. Families who attend unlock
            a 10–20% discount on that class if they enrol.
          </p>
          <button
            onClick={optIn}
            disabled={optingIn}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
          >
            {optingIn ? 'Joining…' : 'Join Class Match Week'}
          </button>

          {optInFailures.length > 0 && (
            <div className="mt-4 space-y-1.5 rounded-xl border border-coral/30 bg-coral/5 p-3">
              {optInFailures.map((f) => (
                <p key={f} className="text-sm text-ink">
                  <OptInFailureLine failure={f} />
                </p>
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Create */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h2 className="text-lg font-bold text-ink">Your taster sessions</h2>
            <div className="flex flex-col items-start sm:items-end gap-1">
              <button
                onClick={() => setModalOpen(true)}
                disabled={sessionableClasses.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
              >
                <Plus className="size-3.5" /> Create a session
              </button>
              {sessionableClasses.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {blocked.length > 0
                    ? 'Fix a blocked class below to create a session.'
                    : 'Publish a monthly-priced class first.'}
                </p>
              )}
            </div>
          </div>

          {/* Session list */}
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
                <h2 className="text-lg font-bold text-ink">Classes that need a fix</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  These classes can&apos;t host a taster session yet. Fix the issues and they&apos;ll
                  appear as choices when you create one.
                </p>
              </div>
              {blocked.map((b) => (
                <div
                  key={b.groupId}
                  className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
                >
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

      <SessionCreateModal
        open={modalOpen}
        classes={sessionableClasses}
        onClose={() => setModalOpen(false)}
        onCreated={(session, groupName, warning) => {
          setSessions((prev) => [{ ...session, groupName, reservedCount: 0 }, ...prev]);
          setModalOpen(false);
          // The API returns warning slugs, not display copy — map the known one.
          setNotice(
            warning === 'over_60_minutes'
              ? 'Google may end this call after 60 minutes on free accounts.'
              : warning ?? null
          );
        }}
      />
    </div>
  );
}

/** 422 opt-in failures rendered as plain sentences with somewhere to go. */
function OptInFailureLine({ failure }: { failure: EligibilityFailure }) {
  switch (failure) {
    case 'suspended':
      return (
        <>There&apos;s an issue with your account, so you can&apos;t join right now — please contact support.</>
      );
    case 'no_meet_connection':
      return (
        <>
          Connect Google Meet in{' '}
          <Link href="/tutor/video-setup" className="font-semibold text-brand-deep hover:underline">
            Settings
          </Link>{' '}
          first — taster sessions run on Meet.
        </>
      );
    case 'no_published_monthly_class':
      return (
        <>
          Publish a monthly-priced class first — head to{' '}
          <Link href="/tutor/classes" className="font-semibold text-brand-deep hover:underline">
            My Classes
          </Link>
          .
        </>
      );
    default:
      return <>Something is blocking you from joining — please contact support.</>;
  }
}
