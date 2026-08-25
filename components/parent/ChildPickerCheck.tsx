'use client';

// Child picker with inline checks — handover §5.
//
// Browsing stays neutral: there is no "shopping as" mode and no child in the
// header. The child is chosen HERE, inside the booking flow, and only then do
// the two checks resolve. That ordering is the point — a parent comparing classes
// should not have to pick a child first, and a check run before a child is named
// would be a check against nobody.
//
// §5's rules, each visible in the markup below:
//   one linked child   the picker is skipped entirely
//   clear              a check mark and "No schedule conflicts"
//   conflict           the stated sentence, then alternatives
//   no alternatives    "No tutors found." — NOT an error state
//   level mismatch     a confirmation, never a block
//   one child          per checkout; two children means two transactions

import { useCallback, useEffect, useState } from 'react';
import { Check, Info, Loader2 } from 'lucide-react';

type Child = { id: string; name: string; formLevel: string | null };

type Alternative = {
  groupId: string;
  name: string;
  tutorName: string;
  priceMonthly: number | null;
  when: string | null;
};

type CheckResult = {
  childLevel: string | null;
  classFormLevel: string | null;
  levelMismatch: boolean;
  levelMessage: string | null;
  schedule:
    | { checked: false; reason: string }
    | { checked: true; clear: boolean; message: string; detail?: string };
  alternatives: Alternative[];
  alternativesMessage?: string | null;
  /** Set when the child is already in — or already waiting on — this class. */
  alreadyIn?: { status: 'enrolled' | 'pending'; message: string } | null;
};

export default function ChildPickerCheck({
  groupId,
  start,
  end,
  onReady,
  showHeading = true,
}: {
  groupId?: string | null;
  start?: string | null;
  end?: string | null;
  /** Called with the child to book for, or null while the parent cannot proceed. */
  onReady?: (childId: string | null) => void;
  /** False where the surrounding dialog already asks "Who is this for?". */
  showHeading?: boolean;
}) {
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [levelAccepted, setLevelAccepted] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/parent/children/summary', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          const list: Child[] = (json.children ?? []).map(
            (c: { id: string; name?: string; full_name?: string; form_level?: string | null }) => ({
              id: c.id,
              name: c.name ?? c.full_name ?? 'Child',
              formLevel: c.form_level ?? null,
            })
          );
          setChildren(list);
          // §5: skipped entirely when the parent has one linked child.
          if (list.length === 1) setChildId(list[0].id);
        }
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const runCheck = useCallback(
    async (id: string) => {
      setChecking(true);
      setResult(null);
      setLevelAccepted(false);
      try {
        const res = await fetch('/api/parent/booking/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ childId: id, groupId: groupId ?? null, start, end }),
        });
        if (res.ok) setResult(await res.json());
      } finally {
        setChecking(false);
      }
    },
    [groupId, start, end]
  );

  useEffect(() => {
    if (childId) void runCheck(childId);
  }, [childId, runCheck]);

  // A clash blocks; a level mismatch only needs acknowledging. That asymmetry is
  // §5's, not an accident: one is a fact about the child's diary, the other is a
  // judgement the parent is entitled to make.
  const alreadyIn = result?.alreadyIn ?? null;
  const clashes = result?.schedule.checked === true && result.schedule.clear === false;
  const needsLevelAck = Boolean(result?.levelMismatch) && !levelAccepted;
  const canProceed =
    Boolean(childId) && !checking && !alreadyIn && !clashes && !needsLevelAck;

  useEffect(() => {
    onReady?.(canProceed ? childId : null);
  }, [canProceed, childId, onReady]);

  if (!loaded) return null;

  if (children.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Link a child to your account before booking a class for them.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {children.length === 1 ? (
        <p className="text-xs text-muted-foreground">
          Booking for {children[0].name} — your only linked child.
        </p>
      ) : (
        <>
          {showHeading && <p className="text-sm font-semibold text-ink">Who is this for?</p>}
          <div className="flex flex-wrap gap-2">
            {children.map((c) => (
              <button
                key={c.id}
                onClick={() => setChildId(c.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
                  childId === c.id
                    ? 'border-brand bg-brand/10 text-ink'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {c.name}
                {c.formLevel && (
                  <span className="text-xs font-normal text-muted-foreground">{c.formLevel}</span>
                )}
              </button>
            ))}
          </div>
          {/* Decision 26, said before it becomes a surprise at the card form. */}
          <p className="text-xs text-muted-foreground">
            One child per checkout. Two children in the same class means two separate payments — do
            this one first, then repeat.
          </p>
        </>
      )}

      {checking && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Checking {children.find((c) => c.id === childId)?.name.split(' ')[0]}’s schedule…
        </div>
      )}

      {/* Already in the class: the one true reason, said alone. A level
          confirmation or a list of alternatives underneath it would be
          answering a question the parent has not reached. */}
      {result && !checking && alreadyIn && (
        <Row tone="neutral" icon={<Info className="size-4" />}>
          {alreadyIn.message}
        </Row>
      )}

      {result && !checking && !alreadyIn && (
        <div className="space-y-2">
          {result.schedule.checked === false ? (
            <Row tone="neutral" icon={<Info className="size-4" />}>
              This class has no scheduled sessions yet, so there is nothing to check against.
            </Row>
          ) : result.schedule.clear ? (
            <Row tone="ok" icon={<Check className="size-4" />}>
              No schedule conflicts
            </Row>
          ) : (
            <>
              <Row tone="neutral" icon={<Info className="size-4" />}>
                <strong>{result.schedule.message}</strong>
                {result.schedule.detail && (
                  <span className="mt-0.5 block text-muted-foreground">{result.schedule.detail}</span>
                )}
              </Row>

              {result.alternatives.length > 0 ? (
                <div className="rounded-xl border border-border p-3.5">
                  <p className="text-sm font-semibold text-ink">Instead try these classes</p>
                  <div className="mt-2 grid gap-2">
                    {result.alternatives.map((a) => (
                      <div key={a.groupId} className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-ink">
                            {a.name}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {a.tutorName}
                            {a.when ? ` · ${a.when}` : ''}
                          </span>
                        </span>
                        <a
                          href={`/student/explore/${a.groupId}`}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink"
                        >
                          View
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Not an error state, and styled as ordinary text so it does not
                   read as one. */
                <p className="text-sm text-muted-foreground">No tutors found.</p>
              )}
            </>
          )}

          {/* Amber on a light card: the ink has to be dark. The earlier
              amber-100 text was written for a dark surface and vanished into
              the modal's white background. */}
          {result.levelMismatch && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3">
              <p className="text-xs leading-relaxed text-amber-900">{result.levelMessage}</p>
              <button
                onClick={() => setLevelAccepted((v) => !v)}
                className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-amber-900"
              >
                <span
                  className={`grid size-4 place-items-center rounded border-2 border-amber-600 ${
                    levelAccepted ? 'bg-amber-600' : ''
                  }`}
                >
                  {levelAccepted && <Check className="size-2.5 text-white" strokeWidth={4} />}
                </span>
                Yes, this is the class I want
              </button>
            </div>
          )}
        </div>
      )}

      {!childId && children.length > 1 && (
        <p className="text-xs text-muted-foreground">Pick a child first.</p>
      )}
      {clashes && (
        <p className="text-xs text-muted-foreground">Resolve the clash to continue.</p>
      )}
      {alreadyIn && children.length > 1 && (
        <p className="text-xs text-muted-foreground">Pick another child to continue.</p>
      )}
      {canProceed && (
        /* §5: no approval step — the parent is the decision-maker. */
        <p className="text-xs text-muted-foreground">
          You are the decision-maker, so this needs no approval step.
        </p>
      )}
    </div>
  );
}

function Row({
  tone,
  icon,
  children,
}: {
  tone: 'ok' | 'neutral';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const cls =
    tone === 'ok'
      ? 'border-brand/30 bg-brand/10 text-ink'
      : 'border-border bg-muted/40 text-ink';
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${cls}`}>
      <span className={tone === 'ok' ? 'mt-0.5 text-brand' : 'mt-0.5 text-muted-foreground'}>{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
