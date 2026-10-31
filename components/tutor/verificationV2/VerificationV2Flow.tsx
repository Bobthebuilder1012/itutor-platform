'use client';

// The teacher's verification page. It copies the "Complete your profile" checklist
// (app/tutor/get-listed/page.tsx): back link, title, progress card, then one card per step
// with a COMPLETE / INCOMPLETE pill. The open step shows its form; the others are a header
// the teacher can open once the saved data allows it.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SETUP_CODE, SETUP_MESSAGE, type VerificationV2StateDto } from '@/lib/verificationV2/constants';
import { pollIntervalMs, stateSignature } from '@/lib/verificationV2/poll';
import ConsentStep from './ConsentStep';
import IdentityStep from './IdentityStep';
import CredentialsStep from './CredentialsStep';
import ExtrasStep from './ExtrasStep';
import StatusView from './StatusView';
import { Card, ErrorBanner, Notice, ProgressCard, STEP_META, type StepState } from './ui';

/** The three steps that must be done. Extras are optional and are not counted. */
const REQUIRED = 3;

function stepState(n: 1 | 2 | 3 | 4, s: VerificationV2StateDto): StepState {
  if (n === 1) return s.consentAt ? 'complete' : 'incomplete';
  if (n === 2) return s.identity.status === 'verified' ? 'complete' : 'incomplete';
  if (n === 3) return s.credentials.length > 0 ? 'complete' : 'incomplete';
  return s.extras.length > 0 ? 'complete' : 'optional';
}

export default function VerificationV2Flow() {
  const router = useRouter();
  const [state, setState] = useState<VerificationV2StateDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupMissing, setSetupMissing] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  // True once the teacher has chosen to work on the form from the status view.
  const [working, setWorking] = useState(false);
  const resumed = useRef(false);
  const latest = useRef<VerificationV2StateDto | null>(null);
  latest.current = state;

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tutor/verification-v2/state', { cache: 'no-store' });
      if (res.status === 401 || res.status === 403) {
        router.push('/login');
        return;
      }
      if (res.status === 404) {
        setError('This page is not available.');
        return;
      }
      if (res.status === 503) {
        const body = await res.json().catch(() => ({}));
        if (body?.code === SETUP_CODE) {
          setSetupMissing(true);
          return;
        }
      }
      if (!res.ok) throw new Error();
      const next = (await res.json()) as VerificationV2StateDto;
      setSetupMissing(false);
      setState(next);
      setError(null);
      // Resume where the teacher left off, once. After that they navigate themselves.
      if (!resumed.current) {
        resumed.current = true;
        setStep(next.step);
        if (next.status === 'IN_PROGRESS') setWorking(true);
      }
    } catch {
      setError('Could not load your verification. Please refresh.');
    }
  }, [router]);

  useEffect(() => {
    void load();
    // Back from the provider: drop the marker so a refresh does not look like a return.
    if (typeof window !== 'undefined' && window.location.search.includes('identity=return')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [load]);

  // Live status: while a change can still arrive from outside (in review, in progress),
  // ask again every few seconds, only while the tab is visible, and apply the answer
  // only if something the teacher cares about changed. It stops by itself once the
  // status is final (verified, rejected, revoked, verify-again): no manual refresh.
  const status = state?.status ?? null;
  useEffect(() => {
    const every = pollIntervalMs(status);
    if (!every) return;
    let stopped = false;
    const poll = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/tutor/verification-v2/state', { cache: 'no-store' });
        if (!res.ok || stopped) return; // a failed poll is silent: the next one tries again
        const next = (await res.json()) as VerificationV2StateDto;
        const cur = latest.current;
        if (!cur || stateSignature(next) !== stateSignature(cur)) setState(next);
      } catch {
        /* offline: try again on the next tick */
      }
    };
    const timer = setInterval(() => void poll(), every);
    const onVisible = () => void poll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [status]);

  const header = (
    <header>
      <Link href="/tutor/dashboard" className="text-xs text-muted-foreground hover:text-ink">
        ← Back to dashboard
      </Link>
      <h1 className="mt-2 text-2xl lg:text-3xl font-bold text-ink">Get verified</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Verify your identity and qualifications so students and parents can trust your profile. Your progress is saved.
      </p>
    </header>
  );

  if (setupMissing) {
    return (
      <div className="max-w-4xl space-y-6">
        {header}
        <Notice role="status">
          <p className="font-semibold">{SETUP_MESSAGE}</p>
          <p className="mt-1">Nothing is wrong with your account. Please check back soon.</p>
        </Notice>
      </div>
    );
  }
  if (error && !state) {
    return (
      <div className="max-w-4xl space-y-6">
        {header}
        <ErrorBanner message={error} />
      </div>
    );
  }
  if (!state) {
    return (
      <div className="max-w-4xl space-y-6">
        {header}
        <div className="min-h-[200px] flex items-center justify-center" role="status" aria-label="Loading">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
        </div>
      </div>
    );
  }

  const showWizard = state.status === 'IN_PROGRESS' || (working && state.editable);
  // A step is reachable only up to the furthest one the saved data allows.
  const reach = state.step;
  const go = (n: number) => setStep(Math.min(Math.max(n, 1), reach, 4) as 1 | 2 | 3 | 4);
  const completed = ([1, 2, 3] as const).filter((n) => stepState(n, state) === 'complete').length;

  return (
    <div className="max-w-4xl space-y-6">
      {header}

      {error && <ErrorBanner message={error} />}

      {!showWizard ? (
        <StatusView
          state={state}
          onBegin={() => {
            setStep(state.step);
            setWorking(true);
          }}
        />
      ) : (
        <>
          <ProgressCard
            completed={completed}
            total={REQUIRED}
            hint={completed === REQUIRED ? 'Ready to send for review' : `${REQUIRED - completed} more to go`}
          />

          {state.status === 'REJECTED' && state.decisionReason && (
            <Notice>
              <p className="font-semibold">Previous decision</p>
              <p className="mt-1">{state.decisionReason}</p>
            </Notice>
          )}

          {([1, 2, 3, 4] as const).map((n) => {
            if (n === step) {
              if (n === 1) return <ConsentStep key={n} state={state} onChange={load} onNext={() => setStep(2)} />;
              if (n === 2) {
                return <IdentityStep key={n} state={state} onChange={load} onBack={() => setStep(1)} onNext={() => setStep(3)} />;
              }
              if (n === 3) {
                return <CredentialsStep key={n} state={state} onChange={load} onBack={() => setStep(2)} onNext={() => setStep(4)} />;
              }
              return <ExtrasStep key={n} state={state} onChange={load} onBack={() => setStep(3)} />;
            }
            return (
              <Card
                key={n}
                title={STEP_META[n].title}
                subtitle={STEP_META[n].subtitle}
                state={stepState(n, state)}
                collapsed
                onOpen={n <= reach ? () => go(n) : undefined}
              />
            );
          })}
        </>
      )}
    </div>
  );
}
