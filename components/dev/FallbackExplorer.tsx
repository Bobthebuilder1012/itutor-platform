'use client';

// DEV ONLY. Shows what the identity routing does, with the SAME pure functions
// the server uses (lib/identity/routing.ts), so the fallback chain can be seen
// without a provider.

import { useState } from 'react';
import { identityRouting } from '@/config/identityRouting';
import { availableRoute, decideNextStep, routeFor } from '@/lib/identity/routing';
import type { OutcomeKind, ProviderName } from '@/lib/identity/types';

const PROVIDERS: ProviderName[] = ['stripe', 'didit', 'veriff'];
const OUTCOMES: OutcomeKind[] = ['pending', 'processing', 'verified', 'retryable_failure', 'not_supported', 'consent_declined', 'canceled'];

export default function FallbackExplorer({ provider }: { provider: ProviderName }) {
  const [country, setCountry] = useState('TT');
  const [outcome, setOutcome] = useState<OutcomeKind>('not_supported');
  const [attempts, setAttempts] = useState(1);
  const [configured, setConfigured] = useState<Record<ProviderName, boolean>>({ stripe: true, didit: true, veriff: true });

  const route = availableRoute(routeFor(country), (p) => configured[p]);
  const tried = route.slice(0, Math.max(0, route.indexOf(provider)) + 1);
  const step = decideNextStep({ route, status: outcome, current: provider, attempts, tried });

  const text =
    step.action === 'next' ? `Fall back automatically to ${step.provider}.`
    : step.action === 'retry_same' ? `Offer "Try again" on ${step.provider} (attempt ${attempts + 1} of ${identityRouting.maxTotalAttempts}).`
    : step.action === 'reuse' ? `Continue the open ${step.provider} session.`
    : step.action === 'start' ? `Start on ${step.provider}.`
    : step.action === 'done' ? 'Done: identity verified.'
    : step.reason === 'consent_declined' ? 'Nothing: the teacher declined. Show "contact support". No other provider is tried.'
    : step.reason === 'attempt_limit' ? `Nothing: all ${identityRouting.maxTotalAttempts} attempts are used. Show "contact support".`
    : 'Nothing left: every provider has been tried. Show "contact support".';

  return (
    <section id="fallback" className="mb-12 scroll-mt-20">
      <h2 className="text-xl font-bold">Fallback chain explorer</h2>
      <p className="mb-4 mt-1 text-sm text-gray-600">
        Pick the provider that just answered (top bar), what it said, and how many of the {identityRouting.maxTotalAttempts} total attempts
        are used. Default chain: {identityRouting.fallbackChain.join(' → ')}. Providers without credentials are skipped. There is no manual route.
      </p>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm">
        <div className="flex flex-wrap items-center gap-4">
          <label>
            Document country{' '}
            <select value={country} onChange={(e) => setCountry(e.target.value)} className="rounded border border-gray-300 px-2 py-1">
              {identityRouting.countries.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </label>
          <label>
            Outcome{' '}
            <select value={outcome} onChange={(e) => setOutcome(e.target.value as OutcomeKind)} className="rounded border border-gray-300 px-2 py-1" data-testid="outcome-select">
              {OUTCOMES.map((o) => <option key={o}>{o}</option>)}
            </select>
          </label>
          <label>
            Attempts used{' '}
            <input type="number" min={0} max={5} value={attempts} onChange={(e) => setAttempts(Number(e.target.value))} className="w-16 rounded border border-gray-300 px-2 py-1" data-testid="attempts-input" />
          </label>
          {PROVIDERS.map((p) => (
            <label key={p} className="flex items-center gap-1">
              <input type="checkbox" checked={configured[p]} onChange={(e) => setConfigured({ ...configured, [p]: e.target.checked })} /> {p} configured
            </label>
          ))}
        </div>
        <p className="mt-4"><span className="text-gray-500">Route for {country}:</span> <b>{route.length ? route.join(' → ') : '(none)'}</b></p>
        <p className="mt-1" data-testid="fallback-result"><span className="text-gray-500">Result:</span> <b>{text}</b></p>
      </div>
    </section>
  );
}
