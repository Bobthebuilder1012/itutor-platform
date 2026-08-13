'use client';

// Per-child controls for Settings → Household — §7 and §10.5.
//
// Three settings, and the order matters: the approval gate, the spend limit, then
// self-pay. Self-pay is last because it is the one with consequences, and a parent
// scanning downwards should meet the reversible switches first.
//
// WHY THE SELF-PAY COPY IS THIS BLUNT
// §7 makes it a tripwire, not a gate: it takes effect immediately, with no
// confirmation step, because the threat model is a child on a parent's unlocked
// phone and a dialog stops that for zero seconds. What protects the parent is
// being TOLD, and a password change reverting it. So the control states all three
// facts before it is touched — immediate, emailed, undone by a password change —
// rather than explaining them afterwards in a toast nobody reads.
//
// The spend limit is shown with its month-to-date spend, and says plainly that
// reaching it forces approval even with self-pay on. Otherwise a parent whose
// child hits the ceiling sees approval requests appear and concludes the self-pay
// toggle is broken.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { fmtTTD } from '@/lib/utils/formatCurrency';

type Billing = {
  selfPayEnabled: boolean;
  requiresApproval: boolean;
  monthlySpendLimit: number | null;
  spend: { limit: number | null; spent: number; remaining: number | null; limitReached: boolean };
};

export default function ChildBillingControls({
  childId,
  childName,
}: {
  childId: string;
  childName: string;
}) {
  const [state, setState] = useState<Billing | null>(null);
  const [limitDraft, setLimitDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const first = childName.split(' ')[0];

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/parent/children/${childId}/billing`, { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as Billing;
      setState(json);
      setLimitDraft(json.monthlySpendLimit == null ? '' : String(json.monthlySpendLimit));
    } catch {
      /* section simply shows nothing */
    }
  }, [childId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state) return null;

  const patch = async (body: Record<string, unknown>, key: string, successNote?: string) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/parent/children/${childId}/billing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'That did not save.');
        return;
      }
      if (successNote) {
        setNote(successNote);
        window.setTimeout(() => setNote(null), 8000);
      }
      await load();
    } catch {
      setError('That did not save.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {note && (
        <p className="rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-xs text-ink">
          {note}
        </p>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}

      {/* 1. Approval gate */}
      <Row
        title="Booking approval required"
        detail={
          state.requiresApproval
            ? `${first}’s requests come to your approvals queue first — including free classes, where you are agreeing to the enrolment.`
            : `${first} can join classes without asking. You will still be notified.`
        }
      >
        <Toggle
          on={state.requiresApproval}
          busy={busy === 'approval'}
          onToggle={() => patch({ requiresApproval: !state.requiresApproval }, 'approval')}
          label={`Booking approval for ${first}`}
        />
      </Row>

      {/* 2. Spend limit */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">Monthly spend limit</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Once reached, every new request needs approval regardless of the self-pay setting below.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Spent this month: <strong className="text-ink">{fmtTTD(state.spend.spent)}</strong>
            {state.spend.limit != null && (
              <>
                {' '}of {fmtTTD(state.spend.limit)}
                {state.spend.limitReached ? (
                  <span className="ml-1 font-semibold text-amber-700">— limit reached</span>
                ) : (
                  <> · {fmtTTD(state.spend.remaining ?? 0)} left</>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={limitDraft}
            onChange={(e) => setLimitDraft(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="No limit"
            inputMode="decimal"
            className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink"
          />
          <span className="text-xs text-muted-foreground">TTD</span>
          <button
            onClick={() =>
              patch(
                { monthlySpendLimit: limitDraft.trim() === '' ? null : Number(limitDraft) },
                'limit'
              )
            }
            disabled={busy === 'limit'}
            className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-ink disabled:opacity-60"
          >
            {busy === 'limit' ? <Loader2 className="size-3.5 animate-spin" /> : 'Save'}
          </button>
        </div>
      </div>

      {/* 3. Self-pay — the one with consequences, so it is last and loudest. */}
      <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-3">
        <Row
          title={`Let ${first} pay for their own classes`}
          detail={
            state.selfPayEnabled
              ? `${first} pays with their own card and no longer needs your approval. This is in effect now.`
              : `${first} cannot pay for classes; every request comes to you.`
          }
        >
          <Toggle
            on={state.selfPayEnabled}
            busy={busy === 'selfpay'}
            onToggle={() =>
              patch(
                { selfPayEnabled: !state.selfPayEnabled },
                'selfpay',
                state.selfPayEnabled
                  ? undefined
                  : 'Self-pay is on now. We have emailed you about it — if that was not you, change your password and it switches back off.'
              )
            }
            label={`Self-pay for ${first}`}
          />
        </Row>
        {/* Stated BEFORE it is touched, not after. */}
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          Turning this on takes effect immediately. A security email goes to you either way, and
          completing a password change turns it back off for every child on your account.
        </p>
      </div>
    </div>
  );
}

function Row({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </div>
      {children}
    </div>
  );
}

function Toggle({
  on,
  busy,
  onToggle,
  label,
}: {
  on: boolean;
  busy: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={busy}
      aria-label={label}
      aria-pressed={on}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${
        on ? 'bg-brand' : 'bg-border'
      }`}
    >
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
          on ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}
