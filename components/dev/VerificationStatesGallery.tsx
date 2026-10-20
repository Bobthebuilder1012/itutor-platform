'use client';

// DEV ONLY. Every teacher verification screen, every identity outcome, the admin
// queue and review states, every badge variant, the click panel and the provider
// fallback chain on one page with no backend. Reached at /dev/verification-states.
// Needs VERIFICATION_DEV_TOOLS=true and a non-production build. Makes no requests.

import { useCallback, useState } from 'react';
import type { ProviderName } from '@/lib/identity/types';
import AdminAndBadges from './AdminAndBadges';
import FallbackExplorer from './FallbackExplorer';
import TeacherStates from './TeacherStates';

const PROVIDERS: ProviderName[] = ['stripe', 'didit', 'veriff'];
const NAV = [
  ['teacher-status', 'Teacher status'],
  ['steps', 'Steps'],
  ['identity', 'Identity outcomes'],
  ['fallback', 'Fallback chain'],
  ['admin', 'Admin'],
  ['badges', 'Badges + panel'],
  ['messages', 'Messages'],
] as const;

export default function VerificationStatesGallery() {
  const [provider, setProvider] = useState<ProviderName>('stripe');
  const [lastAction, setLastAction] = useState('none yet');
  const onAction = useCallback((t: string) => setLastAction(t), []);

  return (
    <div className="min-h-screen bg-gray-50 pb-24 text-gray-900">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2">
          <h1 className="text-base font-bold">Verification states <span className="font-normal text-gray-500">(dev only, no requests)</span></h1>
          <label className="flex items-center gap-2 text-sm">
            Provider
            <select value={provider} onChange={(e) => setProvider(e.target.value as ProviderName)} className="rounded border border-gray-300 px-2 py-1" data-testid="provider-select">
              {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <nav className="flex flex-wrap gap-3 text-sm">
            {NAV.map(([id, label]) => <a key={id} href={`#${id}`} className="text-[#199356] hover:underline">{label}</a>)}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-8">
        <p className="mb-8 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="last-action">
          Last action: {lastAction}
        </p>
        <TeacherStates onAction={onAction} />
        <FallbackExplorer provider={provider} />
        <AdminAndBadges provider={provider} onAction={onAction} />
      </main>
    </div>
  );
}
