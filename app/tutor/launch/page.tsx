'use client';

/**
 * §4 — the Teacher Migration Dashboard.
 *
 * "The product should make the teacher responsible for activation while giving
 * them visibility and tools to complete it." Visibility is the four tiles and
 * the list; the tools are the four actions.
 *
 * ITS OWN ROUTE, not a tab on Clients or My Classes. Clients is "everyone you
 * teach" and every row there assumes a profile — avatar, form level, attendance,
 * a Message button. An invited address has none of those, and putting it in that
 * table breaks the page's whole premise. My Classes is about classes; this is
 * about people, and a teacher who has not built a class yet still needs
 * somewhere to stand.
 *
 * THE CALLOUT IS THE PAGE'S THESIS, so it is always visible and never
 * dismissible: sending an invitation is not success. It is rendered as a quiet
 * definition rather than a coloured warning, because it is explaining how the
 * count works, not telling anyone off.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Rocket, Users, Send, AlertCircle, Info, Mail, Loader2, RefreshCw, X, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import TutorShell from '@/components/tutor/TutorShell';
import ProgressMeter from '@/components/ui/ProgressMeter';
import InviteModal from '@/components/tutor/launch/InviteModal';
import ShareLinkCard from '@/components/tutor/launch/ShareLinkCard';
import {
  STATUS_CFG, ATTENTION_LABEL, ATTENTION_FIX, FILTERS, type FilterKey,
} from '@/components/tutor/launch/statusMeta';
import { isInvitedState } from '@/lib/classInvites/counting';
import { notifyLaunchGoalUpdated } from '@/lib/hooks/useTeacherLaunchGoal';
import type { InviteeView, LaunchGoal } from '@/lib/classInvites/types';

type Payload = {
  goal: LaunchGoal;
  rows: InviteeView[];
  classes: Array<{ groupId: string; name: string; joined: number; invited: number }>;
  unavailable: boolean;
  canInvite: boolean;
  parentAccountsEnabled: boolean;
};

export default function TutorLaunchPage() {
  return (
    <TutorShell>
      {/* useSearchParams needs a boundary, same as My Classes and My Business. */}
      <Suspense fallback={null}>
        <LaunchContent />
      </Suspense>
    </TutorShell>
  );
}

function LaunchContent() {
  const router = useRouter();
  const params = useSearchParams();

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // The URL seeds the control; the control owns it from then on and writes
  // back, so the view stays linkable. Same idiom as the clients page.
  const [filter, setFilter] = useState<FilterKey>(() => {
    const raw = params.get('filter');
    return FILTERS.some((f) => f.key === raw) ? (raw as FilterKey) : 'all';
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/activation', { cache: 'no-store' });
      const body = await res.json();
      if (body?.success) setData(body.data as Payload);
    } catch {
      /* leave the last good view on screen rather than blanking it */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setFilterAndUrl = (key: FilterKey) => {
    setFilter(key);
    const qs = new URLSearchParams(Array.from(params.entries()));
    if (key === 'all') qs.delete('filter');
    else qs.set('filter', key);
    const s = qs.toString();
    router.replace(s ? `/tutor/launch?${s}` : '/tutor/launch', { scroll: false });
  };

  const rows = data?.rows ?? [];
  const goal = data?.goal;

  const counts = useMemo(
    () => ({
      all: rows.length,
      joined: rows.filter((r) => r.state === 'joined').length,
      invited: rows.filter((r) => isInvitedState(r.state)).length,
      attention: rows.filter((r) => r.state === 'needs_attention').length,
    }),
    [rows]
  );

  const visible = useMemo(() => {
    if (filter === 'joined') return rows.filter((r) => r.state === 'joined');
    if (filter === 'invited') return rows.filter((r) => isInvitedState(r.state));
    if (filter === 'attention') return rows.filter((r) => r.state === 'needs_attention');
    return rows;
  }, [rows, filter]);

  const act = async (url: string, method: string, id: string, okMsg: string) => {
    setBusyId(id);
    try {
      const res = await fetch(url, { method });
      const body = await res.json().catch(() => ({}));
      // A 429 here is a limit with a sentence attached. Showing "Failed" would
      // make a working rule look like a bug.
      setToast(res.ok && body?.success ? okMsg : body?.error ?? 'That did not work.');
      if (res.ok) {
        await load();
        notifyLaunchGoalUpdated();
      }
    } catch {
      setToast('That did not work. Check your connection.');
    } finally {
      setBusyId(null);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const resendAll = async () => {
    setBusyId('bulk');
    try {
      const res = await fetch('/api/tutor/invites/resend-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (body?.success) {
        const { resent, skipped } = body.data as {
          resent: number;
          skipped: Array<{ reason: string }>;
        };
        // Naming the skips is what stops a teacher concluding the button is
        // broken when the number is smaller than the list they can see.
        setToast(
          skipped.length
            ? `Reminded ${resent}. ${skipped.length} skipped — ${skipped[0].reason.toLowerCase()}.`
            : resent
              ? `Reminded ${resent}.`
              : 'Nothing is waiting for a reminder.'
        );
        await load();
        notifyLaunchGoalUpdated();
      } else {
        setToast(body?.error ?? 'That did not work.');
      }
    } catch {
      setToast('That did not work.');
    } finally {
      setBusyId(null);
      setTimeout(() => setToast(null), 5000);
    }
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (data?.unavailable) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
        Class invitations are not set up in this environment yet (migration 257 has
        not run here).
      </div>
    );
  }

  const windowClosed = Boolean(goal?.activated && !goal.inWindow && !goal.complete);
  const classList = (data?.classes ?? []).map((c) => ({ groupId: c.groupId, name: c.name }));

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-bold text-ink">Launch your class</h1>
        {windowClosed ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Your first 14 days are up — {goal?.joined ?? 0} joined. The tools stay here.
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            {goal?.activated
              ? `Your first 14 days. ${goal.joined} of ${goal.target} students joined.`
              : 'Get your first 5 students onto iTutor.'}
            {goal?.daysLeft != null && (
              <span className="ml-2 inline-flex items-center rounded-full bg-brand-soft text-brand-deep px-2.5 py-0.5 text-xs font-semibold tabular-nums">
                {goal.daysLeft} day{goal.daysLeft === 1 ? '' : 's'} left
              </span>
            )}
          </p>
        )}
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          label="Progress"
          value={`${goal?.joined ?? 0} / ${goal?.target ?? 5}`}
          icon={Rocket}
          active={filter === 'all'}
          onClick={() => setFilterAndUrl('all')}
        >
          <ProgressMeter
            value={goal?.joined ?? 0}
            total={goal?.target ?? 5}
            size="xs"
            srLabel={`${goal?.joined ?? 0} of ${goal?.target ?? 5} students joined`}
          />
        </Tile>
        <Tile label="Joined" value={counts.joined} icon={Users} active={filter === 'joined'} onClick={() => setFilterAndUrl('joined')} />
        <Tile label="Invited" value={counts.invited} icon={Send} active={filter === 'invited'} onClick={() => setFilterAndUrl('invited')} />
        <Tile label="Needs attention" value={counts.attention} icon={AlertCircle} active={filter === 'attention'} onClick={() => setFilterAndUrl('attention')} tone={counts.attention > 0 ? 'rose' : 'default'} />
      </div>

      <div className="rounded-xl bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground flex items-start gap-2">
        <Info className="size-4 mt-0.5 shrink-0" />
        <span>Sending an invitation is not success. A joined student is success.</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setInviteOpen(true)}
          disabled={!data?.canInvite}
          className="rounded-lg bg-ink text-white px-4 py-2 text-sm font-semibold hover:bg-ink/90 disabled:opacity-50"
        >
          Invite more
        </button>
        <button
          onClick={resendAll}
          disabled={!data?.canInvite || busyId === 'bulk' || counts.invited === 0}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink hover:bg-muted disabled:opacity-50 inline-flex items-center gap-2"
        >
          {busyId === 'bulk' && <Loader2 className="size-4 animate-spin" />}
          Resend pending
        </button>
        {!data?.canInvite && (
          <span className="text-xs text-muted-foreground">
            Invitations are switched off right now. Anything already sent still works.
          </span>
        )}
      </div>

      <ShareLinkCard classes={classList} disabled={!data?.canInvite} />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilterAndUrl(f.key)}
            aria-pressed={filter === f.key}
            className={cn(
              'rounded-full border px-4 py-1.5 text-sm font-semibold transition',
              filter === f.key
                ? 'border-brand-deep bg-brand-deep text-white'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            {f.label} · {counts[f.key]}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState filter={filter} total={rows.length} invited={counts.invited} joined={counts.joined} onInvite={() => setInviteOpen(true)} />
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => (
            <Row key={row.id} row={row} busy={busyId === row.id} onResend={() => act(`/api/tutor/invites/${row.id}/resend`, 'POST', row.id, 'Reminder sent.')} onWithdraw={() => act(`/api/tutor/invites/${row.id}`, 'DELETE', row.id, 'Invitation withdrawn.')} />
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Only students who joined through your invitation or your class link count toward your 5.
      </p>

      <InviteModal
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          void load();
        }}
        classes={classList}
        allowParent={Boolean(data?.parentAccountsEnabled)}
      />

      {toast && (
        <div
          role="status"
          className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-30 rounded-lg bg-ink text-white px-4 py-2.5 text-sm shadow-lg max-w-[92vw]"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function Tile({
  label, value, icon: Icon, active, onClick, children, tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
  children?: React.ReactNode;
  tone?: 'default' | 'rose';
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'text-left rounded-xl border bg-card p-4 transition hover:border-brand/50',
        active ? 'border-brand' : 'border-border'
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className={cn('size-3.5', tone === 'rose' && 'text-rose-500')} />
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-ink tabular-nums">{value}</div>
      {children && <div className="mt-2">{children}</div>}
    </button>
  );
}

function Row({
  row, busy, onResend, onWithdraw,
}: {
  row: InviteeView;
  busy: boolean;
  onResend: () => void;
  onWithdraw: () => void;
}) {
  const cfg = STATUS_CFG[row.state];
  const canResend = row.canResendAt === null && row.state !== 'joined';

  return (
    <li className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
      <div className="min-w-0 flex-1 flex items-center gap-3">
        <div className="size-9 rounded-full bg-muted grid place-items-center shrink-0 text-muted-foreground">
          <Mail className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink truncate">
            {row.name ?? row.email}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {row.name ? row.email : null}
            {row.kind === 'parent' && (row.name ? ' · Parent' : 'Parent')}
            {row.joinedStudentName && ` · ${row.joinedStudentName} joined`}
          </div>
        </div>
      </div>

      <div className="shrink-0 md:w-56">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
            cfg.cls
          )}
        >
          {row.state === 'needs_attention' && row.attentionReason
            ? ATTENTION_LABEL[row.attentionReason]
            : cfg.label}
          {cfg.counts && <Check className="size-3" />}
        </span>
        <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
          {row.state === 'needs_attention' && row.attentionReason
            ? ATTENTION_FIX[row.attentionReason]
            : cfg.help}
        </p>
      </div>

      <div className="shrink-0 md:w-28 text-xs text-muted-foreground">
        {row.className ?? 'No class yet'}
      </div>

      <div className="shrink-0 flex items-center gap-1">
        {row.state === 'awaiting_your_approval' && row.groupId && (
          <Link
            href={`/tutor/classes/${row.groupId}?tab=roster`}
            className="rounded-lg bg-ink text-white px-3 py-1.5 text-xs font-semibold hover:bg-ink/90"
          >
            Approve
          </Link>
        )}
        {row.state !== 'joined' && row.state !== 'revoked' && (
          <>
            <button
              onClick={onResend}
              disabled={busy || !canResend}
              title={canResend ? 'Send a reminder' : 'Reminded recently — try again later'}
              className="size-8 grid place-items-center rounded-lg border border-border hover:bg-muted disabled:opacity-40"
              aria-label="Resend"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            </button>
            <button
              onClick={onWithdraw}
              disabled={busy}
              className="size-8 grid place-items-center rounded-lg border border-border hover:bg-muted disabled:opacity-40"
              aria-label="Withdraw invitation"
              title="Withdraw"
            >
              <X className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * Three distinct empty states, following the clients page: an empty list, a
 * filter that matches nothing, and the specific moment a teacher has invited
 * people and nobody has joined — which is exactly when the callout needs
 * saying again rather than once at the top.
 */
function EmptyState({
  filter, total, invited, joined, onInvite,
}: {
  filter: FilterKey;
  total: number;
  invited: number;
  joined: number;
  onInvite: () => void;
}) {
  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <Rocket className="size-6 mx-auto text-muted-foreground" />
        <h2 className="mt-3 text-sm font-semibold text-ink">Bring your students across</h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
          Most teachers start by inviting the parents of students they already teach.
          They don&apos;t need an iTutor account yet — we&apos;ll set them up.
        </p>
        <button
          onClick={onInvite}
          className="mt-4 rounded-lg bg-ink text-white px-4 py-2 text-sm font-semibold hover:bg-ink/90"
        >
          Invite your first students
        </button>
      </div>
    );
  }

  if (filter === 'joined' && joined === 0 && invited > 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm text-ink font-semibold">Nobody has joined yet.</p>
        <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
          {invited} invitation{invited === 1 ? ' is' : 's are'} out. Sending one is not
          success — a joined student is. Give it a day, then send a reminder.
        </p>
      </div>
    );
  }

  if (filter === 'attention') {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nothing needs attention — every invitation is on track.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      Nobody matches that filter.
    </div>
  );
}
