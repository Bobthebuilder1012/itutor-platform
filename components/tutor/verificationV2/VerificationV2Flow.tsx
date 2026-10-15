'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VerificationV2StateDto } from '@/lib/verificationV2/constants';
import ConsentStep from './ConsentStep';
import IdentityStep from './IdentityStep';
import CredentialsStep from './CredentialsStep';
import ExtrasStep from './ExtrasStep';
import StatusView from './StatusView';
import { Card, ErrorBanner } from './ui';

const STEPS = ['Consent', 'Identity', 'Credentials', 'Extras'] as const;

export default function VerificationV2Flow() {
  const router = useRouter();
  const [state, setState] = useState<VerificationV2StateDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  // True once the teacher has chosen to work on the form from the status view.
  const [working, setWorking] = useState(false);
  const resumed = useRef(false);

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
      if (!res.ok) throw new Error();
      const next = (await res.json()) as VerificationV2StateDto;
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
    // Back from Stripe: drop the marker so a refresh does not look like a return.
    if (typeof window !== 'undefined' && window.location.search.includes('identity=return')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [load]);

  if (error && !state) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ErrorBanner message={error} />
      </div>
    );
  }
  if (!state) {
    return <div className="mx-auto max-w-2xl px-4 py-8 text-sm text-gray-500">Loading…</div>;
  }

  const showWizard = state.status === 'IN_PROGRESS' || (working && state.editable);
  // A step is reachable only up to the furthest one the saved data allows.
  const reach = state.step;
  const go = (n: number) => setStep(Math.min(Math.max(n, 1), reach, 4) as 1 | 2 | 3 | 4);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Teacher verification</h1>
      <p className="mb-6 text-sm text-gray-600">Your progress is saved. You can leave and come back.</p>

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
          <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Progress">
            {STEPS.map((label, i) => {
              const n = i + 1;
              const done = n < step || n < reach;
              const current = n === step;
              const reachable = n <= reach;
              return (
                <li key={label}>
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => go(n)}
                    className="block w-full text-left disabled:cursor-not-allowed"
                    aria-current={current ? 'step' : undefined}
                  >
                    <div
                      className={`h-1.5 rounded-full ${
                        current ? 'bg-[#199356]' : done ? 'bg-[#199356]/50' : 'bg-gray-200'
                      }`}
                    />
                    <p
                      className={`mt-1.5 text-xs font-semibold ${
                        current ? 'text-gray-900' : reachable ? 'text-gray-600' : 'text-gray-400'
                      }`}
                    >
                      {n}. {label}
                    </p>
                  </button>
                </li>
              );
            })}
          </ol>

          {state.status === 'REJECTED' && state.decisionReason && (
            <Card className="mb-4 border-red-200 bg-red-50 text-sm text-red-900">
              <p className="font-semibold">Previous decision</p>
              <p className="mt-1">{state.decisionReason}</p>
            </Card>
          )}

          {step === 1 && <ConsentStep state={state} onChange={load} onNext={() => setStep(2)} />}
          {step === 2 && (
            <IdentityStep state={state} onChange={load} onBack={() => setStep(1)} onNext={() => setStep(3)} />
          )}
          {step === 3 && (
            <CredentialsStep state={state} onChange={load} onBack={() => setStep(2)} onNext={() => setStep(4)} />
          )}
          {step === 4 && <ExtrasStep state={state} onChange={load} onBack={() => setStep(3)} />}
        </>
      )}
    </div>
  );
}
