'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';

type State = 'loading' | 'success' | 'error';

export default function SubscriptionConfirmedPage() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('session_id');

  const [state, setState] = useState<State>('loading');
  const [groupName, setGroupName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (!sessionId) {
      // No session_id — webhook may have already activated; just show success
      setState('success');
      return;
    }

    async function finalize() {
      try {
        const res = await fetch(`/api/payments/lunipay/finalize?session_id=${sessionId}`);
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          // If already activated (idempotent) still treat as success
          if (
            data?.already_activated ||
            data?.status === 'already_active' ||
            data?.status === 'already_processed' ||
            data?.status === 'activated'
          ) {
            setState('success');
            setGroupName(data?.group_name ?? '');
            return;
          }
          setErrorMsg(data?.error ?? `Activation error (${res.status})`);
          setState('error');
          return;
        }

        setGroupName(data?.group_name ?? '');
        setState('success');
      } catch (err: any) {
        setErrorMsg(err?.message ?? 'Network error');
        setState('error');
      }
    }

    finalize();
  }, [sessionId]);

  if (state === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="size-10 animate-spin text-brand" />
        <p className="text-sm text-muted-foreground">Activating your subscription…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
        <AlertCircle className="size-12 text-amber-500" />
        <h1 className="text-xl font-bold text-ink text-center">Payment received — activation pending</h1>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Your payment was successful. Access is being set up — this can take a moment. Do not pay again.
        </p>
        {errorMsg && (
          <p className="text-xs text-red-400 text-center max-w-xs">{errorMsg}</p>
        )}
        <div className="flex gap-3 mt-2">
          <Link
            href="/student/subscriptions"
            className="px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep transition"
          >
            My subscriptions
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 px-4">
      <div className="flex items-center justify-center size-20 rounded-full bg-brand-soft">
        <CheckCircle className="size-10 text-brand" />
      </div>

      <div className="text-center">
        <h1 className="text-2xl font-bold text-ink mb-2">You're subscribed!</h1>
        {groupName ? (
          <p className="text-muted-foreground text-sm">
            Welcome to <span className="font-semibold text-ink">{groupName}</span>. You now have full access.
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">Your subscription is active. You now have full access.</p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mt-2">
        <Link
          href="/student/subscriptions"
          className="px-5 py-2.5 rounded-xl border border-border text-sm font-semibold text-ink hover:bg-card transition text-center"
        >
          My subscriptions
        </Link>
        <Link
          href="/student/find-tutors"
          className="px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep transition text-center"
        >
          Explore more lessons
        </Link>
      </div>
    </div>
  );
}
