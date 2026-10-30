'use client';

// Shown on every page while an admin is inside someone else's account. Mounted
// in the root layout rather than DashboardLayout, because impersonation follows
// the admin everywhere — checkout, explore, messages, the tutor and admin areas
// — and those pages do not all share a layout. Renders nothing at all when the
// cookie is absent, which is every page load for every real user.
//
// A floating pill rather than a top bar on purpose: DashboardLayout's header is
// `sticky top-0 z-50`, and a fixed bar at the top would sit on top of it.

import { useEffect, useState } from 'react';
import {
  readImpersonationStateFromDocument,
  type ImpersonationState,
} from '@/lib/auth/impersonation';

export default function ImpersonationBanner() {
  const [state, setState] = useState<ImpersonationState | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    setState(readImpersonationStateFromDocument());
  }, []);

  if (!state) return null;

  const handleExit = async () => {
    setExiting(true);
    try {
      const res = await fetch('/api/admin/impersonate', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      // Hard navigation, not router.push: the session cookies just changed and
      // every cached client-side query belongs to the account being left.
      window.location.href = data?.redirectTo || '/login';
    } catch {
      window.location.href = '/login';
    }
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] px-4 w-full max-w-2xl pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-amber-300 bg-amber-50 px-4 py-2.5 shadow-lg">
        <span className="flex h-2.5 w-2.5 flex-shrink-0 rounded-full bg-amber-500 animate-pulse" />
        <p className="flex-1 text-sm text-amber-900 truncate">
          Signed in as <strong className="font-semibold">{state.targetName}</strong>
          <span className="hidden sm:inline"> ({state.targetEmail})</span> — actions here are
          recorded as this {state.targetRole} account.
        </p>
        <button
          onClick={handleExit}
          disabled={exiting}
          className="flex-shrink-0 rounded-full bg-amber-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
        >
          {exiting ? 'Leaving…' : 'Exit'}
        </button>
      </div>
    </div>
  );
}
