'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';

interface RefundablePayment {
  id: string;
  payer_id: string;
  payer_name: string | null;
  payer_email: string | null;
  amount_ttd: number;
  refunded_amount_ttd: number;
  currency: string;
  status: string;
  cancel_reason: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  lunipay_payment_id: string | null;
  lunipay_checkout_session_id: string | null;
  booking_id: string | null;
  session_status: string | null;
}

interface ReversiblePayment {
  id: string;
  type: string;
  payment_status: string;
  amount_ttd: number;
  tutor_payout_ttd: number;
  paid_at: string | null;
  class_name: string | null;
  student_name: string | null;
  ledger_statuses: string[];
  held_ttd: number;
}

export default function AdminRefundsPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [awaiting, setAwaiting] = useState<RefundablePayment[]>([]);
  const [processed, setProcessed] = useState<RefundablePayment[]>([]);
  const [reversible, setReversible] = useState<ReversiblePayment[]>([]);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, email')
        .eq('id', user.id)
        .single();
      if (profile?.role !== 'admin') { router.push('/login'); return; }
      if (isEmailManagementOnlyAdmin(profile.email)) { router.replace('/admin/emails'); return; }
      setAuthLoading(false);
      await load();
    })();
  }, []);

  async function load() {
    const res = await fetch('/api/admin/payments/refundable');
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || 'Failed to load refundable payments');
      return;
    }
    setAwaiting(json.awaiting ?? json.payments ?? []);
    setProcessed(json.processed ?? []);

    // Group payments (subscriptions + secured spots) whose payout we still hold.
    try {
      const r2 = await fetch('/api/admin/payments/reversible');
      const j2 = await r2.json();
      if (r2.ok) setReversible(j2.payments ?? []);
    } catch { /* non-fatal — the 1:1 refund list still renders */ }
  }

  /**
   * Corrects our records without calling Stripe. For money that never really
   * moved or was returned out of band. The reason is mandatory because from
   * the outside this is indistinguishable from a refund, and only the reason
   * separates a correction from a quiet write-off.
   */
  async function reverse(paymentId: string) {
    const reason = window.prompt(
      'Why is this being reversed? This does NOT refund through Stripe — use it only when the money never moved or was already returned another way.\n\nReason (min 10 characters):'
    );
    if (reason === null) return;
    if (reason.trim().length < 10) { setError('A reason of at least 10 characters is required.'); return; }

    setError(''); setMessage(''); setWorking(paymentId);
    try {
      const res = await fetch(`/api/admin/payments/subscription/${paymentId}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Reversal failed');
      setMessage(`Reversed ${paymentId.slice(0, 8)} — ${json.ledger_rows_reversed} ledger row(s). No Stripe refund was issued.`);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setWorking(null);
    }
  }

  async function refund(paymentId: string) {
    if (!confirm('Confirm: this will issue a full refund through LuniPay. The student will be notified. This cannot be undone.')) return;
    setError(''); setMessage(''); setWorking(paymentId);
    try {
      const res = await fetch(`/api/admin/payments/${paymentId}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'requested_by_customer' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Refund failed');
      if (json.warning) setMessage(`${json.warning}: ${json.details}`);
      else setMessage(`Refund issued for ${paymentId.slice(0, 8)}.`);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setWorking(null);
    }
  }

  if (authLoading) {
    return (
      <DashboardLayout role="admin" userName="Admin">
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <AdminBreadcrumb items={[{ label: 'Finance' }, { label: 'Refunds' }]} />
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink">Refunds</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Successful payments that need to be refunded — typically slot-conflict cases where the student paid but the booking couldn't be created.
            </p>
          </div>
          <Link href="/admin/dashboard" className="text-sm text-brand hover:underline">← Back to dashboard</Link>
        </div>

        {error && <div className="rounded-xl border border-red-300 bg-red-50 text-red-800 p-3 text-sm">{error}</div>}
        {message && <div className="rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 p-3 text-sm">{message}</div>}

        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Awaiting refund</h2>
            <p className="text-xs text-muted-foreground">Orphan payments that need an admin click. Automatic refunds (cancellations, tutor no-shows) don't appear here — see "Recent refunds" below.</p>
          </div>
          {awaiting.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments awaiting refund.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                    <th className="py-2 pr-4">Payment</th>
                    <th className="py-2 pr-4">Payer</th>
                    <th className="py-2 pr-4">Reason</th>
                    <th className="py-2 pr-4">Paid</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                    <th className="py-2 pr-0 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {awaiting.map((p) => (
                    <tr key={p.id} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-xs">
                        <div>{p.id.slice(0, 8)}</div>
                        <div className="text-muted-foreground">{p.lunipay_payment_id?.slice(0, 12) ?? '—'}</div>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="font-medium text-ink">{p.payer_name ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{p.payer_email}</div>
                      </td>
                      <td className="py-2 pr-4">
                        {p.booking_id == null && (
                          <span className="inline-block rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium mr-1">Slot conflict</span>
                        )}
                        {p.cancel_reason && (
                          <span className="text-xs text-muted-foreground">{p.cancel_reason}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-xs">
                        {p.paid_at ? new Date(p.paid_at).toLocaleString() : '—'}
                      </td>
                      <td className="py-2 pr-4 text-right font-semibold">
                        ${p.amount_ttd.toFixed(2)} {p.currency}
                      </td>
                      <td className="py-2 pr-0 text-right">
                        <button
                          onClick={() => refund(p.id)}
                          disabled={working !== null}
                          className="px-3 py-1 rounded-lg bg-coral hover:bg-coral/90 text-white text-xs font-semibold disabled:opacity-40"
                        >
                          {working === p.id ? 'Refunding…' : 'Refund full amount'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Class payments whose payout we still hold. Separate from the 1:1
            refund list above because these do NOT call Stripe — they correct
            our own records only. */}
        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Class payments — mark as reversed</h2>
            <p className="text-xs text-muted-foreground">
              Subscription and secured-spot payments whose tutor payout is still held by us.
              Reversing here <strong>does not refund through Stripe</strong> — it corrects our
              records for money that never moved or was returned another way. A written reason
              is required and every use is audited. Already-released payouts cannot be reversed.
            </p>
          </div>

          {reversible.length === 0 ? (
            <p className="text-sm text-muted-foreground">No class payments are currently held.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4">Class</th>
                    <th className="py-2 pr-4">Student</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Paid</th>
                    <th className="py-2 pr-4">Held</th>
                    <th className="py-2 pr-4">Ledger</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {reversible.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="py-2 pr-4 font-medium text-ink">{p.class_name ?? '—'}</td>
                      <td className="py-2 pr-4">{p.student_name ?? '—'}</td>
                      <td className="py-2 pr-4">
                        {p.type === 'secure_spot' ? 'Secured spot' : 'Subscription'}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">TT${p.amount_ttd.toFixed(2)}</td>
                      <td className="py-2 pr-4 tabular-nums">TT${p.held_ttd.toFixed(2)}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {p.ledger_statuses.join(', ')}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => reverse(p.id)}
                          disabled={working === p.id}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
                        >
                          {working === p.id ? 'Reversing…' : 'Mark reversed'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Recent refunds</h2>
            <p className="text-xs text-muted-foreground">Last 50 payments where money has already been returned to the payer — automatic flows (cancellations, tutor no-shows, admin clicks) all surface here.</p>
          </div>
          {processed.length === 0 ? (
            <p className="text-sm text-muted-foreground">No refunds processed yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                    <th className="py-2 pr-4">Payment</th>
                    <th className="py-2 pr-4">Payer</th>
                    <th className="py-2 pr-4">Reason</th>
                    <th className="py-2 pr-4">Refunded</th>
                    <th className="py-2 pr-4 text-right">Refunded / Charged</th>
                    <th className="py-2 pr-0 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {processed.map((p) => (
                    <tr key={p.id} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-mono text-xs">
                        <div>{p.id.slice(0, 8)}</div>
                        <div className="text-muted-foreground">{p.lunipay_payment_id?.slice(0, 12) ?? '—'}</div>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="font-medium text-ink">{p.payer_name ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{p.payer_email}</div>
                      </td>
                      <td className="py-2 pr-4 text-xs">
                        {p.cancel_reason && (
                          <div className="text-ink">{p.cancel_reason.replace(/_/g, ' ')}</div>
                        )}
                        {p.session_status && (
                          <div className="text-muted-foreground">session: {p.session_status}</div>
                        )}
                        {p.session_status &&
                          ['NO_SHOW_TUTOR', 'NO_SHOW_STUDENT', 'MUTUAL_NON_COMPLETION'].includes(
                            p.session_status
                          ) && (
                            <Link
                              href="/admin/disputes"
                              className="text-xs text-blue-600 hover:underline"
                            >
                              View dispute -&gt;
                            </Link>
                          )}
                      </td>
                      <td className="py-2 pr-4 text-xs">
                        {p.refunded_at ? new Date(p.refunded_at).toLocaleString() : '—'}
                      </td>
                      <td className="py-2 pr-4 text-right text-xs">
                        <div className="font-semibold text-ink">${p.refunded_amount_ttd.toFixed(2)}</div>
                        <div className="text-muted-foreground">of ${p.amount_ttd.toFixed(2)}</div>
                      </td>
                      <td className="py-2 pr-0 text-right">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.status === 'refunded'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {p.status === 'refunded' ? 'Full refund' : 'Partial refund'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
