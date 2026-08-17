'use client';

/**
 * Create a Class Match Week session — a page, not a modal.
 *
 * The builder is three steps with a live preview of what families will see; that
 * does not belong in an overlay. A modal that size fights the viewport on a
 * laptop, and losing a half-filled offer to a stray backdrop click is a bad
 * trade for a teacher we are trying to recruit.
 *
 * Sits under /tutor/class-match-week deliberately, even though its parent route
 * only redirects to the My Business tab: the campaign owns this URL, and nesting
 * it under /tutor/business would inherit that section's EndDateGate, which
 * blocks until every class the tutor owns has an end date. That is the right gate
 * for class management and the wrong one for scheduling a free taster.
 *
 * Loads its own data rather than receiving it from the tab, because it is
 * reachable directly and must work on a cold navigation.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Video, BookOpen, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useProfile } from '@/lib/hooks/useProfile';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import TutorShell from '@/components/tutor/TutorShell';
import SessionCreateFlow, {
  type FlowClass,
} from '@/components/classMatchWeek/teacher/SessionCreateFlow';
import type { ClassMatchCampaign } from '@/lib/classMatchWeek/types';

const CAMPAIGN_TAB = '/tutor/business?tab=class-match-week';

type TutorGroup = { id: string; name: string; price_monthly: number | null; subject: string | null };

export default function NewClassMatchSessionPage() {
  return (
    <TutorShell>
      <NewSessionContent />
    </TutorShell>
  );
}

function NewSessionContent() {
  const { profile } = useProfile();

  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<ClassMatchCampaign | null>(null);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [groups, setGroups] = useState<TutorGroup[]>([]);

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
        setBlockedIds(((json.blocked ?? []) as Array<{ groupId: string }>).map((b) => b.groupId));
      }
    } catch (e) {
      console.error('[class-match-week/new] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Same filters as the eligibility gate: PUBLISHED + pricing_model MONTHLY
  // (never pricing_mode, whose union omits MONTHLY and which is NULL on some
  // rows), price from price_monthly (never the legacy `pricing` string).
  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('id, name, price_monthly, subject')
        .eq('tutor_id', profile.id)
        .eq('status', 'PUBLISHED')
        .eq('pricing_model', 'MONTHLY')
        .is('archived_at', null);
      if (error) {
        console.error('[class-match-week/new] groups query failed:', error.message);
        return;
      }
      setGroups((data ?? []) as TutorGroup[]);
    })();
  }, [profile?.id]);

  const toFlowClass = (g: TutorGroup): FlowClass => ({
    id: g.id,
    name: g.name,
    priceLabel: `${fmtTTD(g.price_monthly)}/mo`,
    subject: g.subject,
  });

  /** Can HOST a taster: published, monthly, and not blocked for well-formedness. */
  const sessionable = useMemo(() => {
    const blocked = new Set(blockedIds);
    return groups.filter((g) => !blocked.has(g.id)).map(toFlowClass);
  }, [groups, blockedIds]);

  /** Can CARRY the discount: every published monthly class, schedule or not. */
  const promotable = useMemo(() => groups.map(toFlowClass), [groups]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-brand" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Class Match Week isn't running yet"
        body="When the next campaign opens, you'll be able to create free taster sessions here."
        actionHref={CAMPAIGN_TAB}
        actionLabel="Back to Class Match Week"
      />
    );
  }

  // Reachable by direct link, so the no-class case has to be handled here too
  // rather than assuming the tab already filtered for it.
  if (sessionable.length === 0) {
    return (
      <EmptyState
        icon={groups.length > 0 ? Video : BookOpen}
        title={
          groups.length > 0
            ? 'None of your classes can host a taster yet'
            : 'Publish a monthly-priced class first'
        }
        body={
          groups.length > 0
            ? 'Your published classes need a weekly schedule and a subject before they can back a session. The campaign page lists exactly what each one is missing.'
            : 'A taster is a sample of a real class, so you need one published on monthly pricing to run it for.'
        }
        actionHref={groups.length > 0 ? CAMPAIGN_TAB : '/tutor/classes/new'}
        actionLabel={groups.length > 0 ? 'See what needs fixing' : 'Create a class'}
      />
    );
  }

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <Link
          href={CAMPAIGN_TAB}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" /> Class Match Week
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink lg:text-3xl">
          {campaign.name}
        </h1>
      </div>

      <SessionCreateFlow
        campaign={campaign}
        sessionable={sessionable}
        promotable={promotable}
        backHref={CAMPAIGN_TAB}
      />
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
  actionHref,
  actionLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <Icon className="mx-auto size-10 text-muted-foreground/40" />
      <h1 className="mt-3 text-xl font-bold text-ink">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{body}</p>
      <Link
        href={actionHref}
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep"
      >
        {actionLabel} <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
