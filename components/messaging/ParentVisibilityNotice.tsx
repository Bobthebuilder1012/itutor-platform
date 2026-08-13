'use client';

// §9.4 — a build requirement, not a copy detail.
//
// "The child sees a persistent, non-dismissible line in their messaging surface
// stating a linked parent can read it. The parent sees that the child knows.
//
// Covert monitoring of a minor's conversations is indefensible regardless of
// intent, and the product's safeguarding position depends on the monitoring
// being open. This is not a copy detail to be trimmed."
//
// Three properties follow from that, and none of them are style choices:
//
//   PERSISTENT      it renders every time, not once per session
//   NON-DISMISSIBLE there is no close button, and adding one would remove the
//                   only thing making the access defensible
//   HONEST ABOUT SCOPE it names the date the access starts, because messages
//                   from before the link stay private (§10.8) and a student who
//                   assumes otherwise will self-censor about the wrong period
//
// Renders nothing when no parent is linked — a self-paying student with no
// parent is told nothing, because there is nothing to tell. That is also why the
// component asks the server rather than being handed a prop: a linked parent must
// never be able to become invisible because a caller forgot to pass a flag.

import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';

type Visibility = {
  linked: boolean;
  parentName: string | null;
  since: string | null;
};

export default function ParentVisibilityNotice({
  /** Set on the parent's own view, which states that the child knows. */
  audience = 'student',
}: {
  audience?: 'student' | 'parent';
}) {
  const [state, setState] = useState<Visibility | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/messages/parent-visibility', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as Visibility;
        if (!cancelled) setState(json);
      } catch {
        // Fail silent rather than fail loud: an error here must not block
        // messaging. It does mean the notice can be missing on a network fault,
        // which is why the disclosure is ALSO carried in the parent-invite email
        // the student accepted (mig 194) rather than resting on this alone.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state?.linked) return null;

  const who = state.parentName ?? 'Your parent';

  return (
    <div
      className="flex items-start gap-2.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3.5 py-3"
      // Announced to screen readers as a standing statement about the page,
      // not as a transient alert.
      role="note"
    >
      <Eye className="mt-0.5 size-4 shrink-0 text-sky-500" />
      <div className="min-w-0">
        {audience === 'student' ? (
          <>
            <p className="text-sm font-semibold text-ink">
              {who} can read this conversation.
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Messages
              {state.since ? ` from ${state.since} onward` : ''} are visible to your linked parent.
              Anything sent before that stays private.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-ink">
              Your child can see that you have access to this conversation.
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              You are reading it, not taking part in it. Messages
              {state.since ? ` from ${state.since} onward` : ''} — anything before you were linked
              stays private.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
