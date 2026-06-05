'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { fmtTTD } from '@/lib/utils/formatCurrency';

type State = 'loading' | 'success' | 'error';

type Receipt = {
  amountTtd: number;
  groupName: string;
  periodStart: string;
  periodEnd: string;
  paymentId: string;
  paidAt: string;
};

export default function SubscriptionConfirmedPage() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [state, setState] = useState<State>('loading');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (!sessionId) {
      setState('success');
      return;
    }

    async function finalize() {
      try {
        const res = await fetch(`/api/payments/lunipay/finalize?session_id=${sessionId}`);
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (
            data?.already_activated ||
            data?.status === 'already_active' ||
            data?.status === 'already_processed' ||
            data?.status === 'activated'
          ) {
            if (data?.receipt) setReceipt(data.receipt);
            setState('success');
            return;
          }
          setErrorMsg(data?.error ?? `Activation error (${res.status})`);
          setState('error');
          return;
        }

        if (data?.receipt) setReceipt(data.receipt);
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
        <h1 className="text-xl font-bold text-ink text-center">Something went wrong</h1>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Your payment was received but we could not confirm your enrolment. Please contact support — do not pay again.
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

  const fmt = (iso: string) => iso ? new Date(iso).toLocaleDateString('en-TT', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 px-4">
      <div className="flex items-center justify-center size-20 rounded-full bg-brand-soft">
        <CheckCircle className="size-10 text-brand" />
      </div>

      <div className="text-center">
        <h1 className="text-2xl font-bold text-ink mb-2">You're subscribed!</h1>
        <p className="text-muted-foreground text-sm">
          {receipt?.groupName
            ? <>Welcome to <span className="font-semibold text-ink">{receipt.groupName}</span>. You now have full access.</>
            : 'Your subscription is active. You now have full access.'}
        </p>
      </div>

      {receipt && (
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment receipt</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount paid</span>
              <span className="font-semibold text-ink">{fmtTTD(receipt.amountTtd)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium text-ink">{fmt(receipt.paidAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Access period</span>
              <span className="font-medium text-ink">{fmt(receipt.periodStart)} – {fmt(receipt.periodEnd)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reference</span>
              <span className="font-mono text-xs text-muted-foreground truncate ml-4 max-w-[140px]">{receipt.paymentId.slice(0, 8)}…</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
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
