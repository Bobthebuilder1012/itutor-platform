'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';

interface RefundablePayment {
  id: string;
  payer_id: string;
  payer_name: string | null;
  payer_email: string | null;
  amount_ttd: number;
  currency: string;
  cancel_reason: string | null;
  paid_at: string | null;
  lunipay_payment_id: string | null;
  lunipay_checkout_session_id: string | null;
  booking_id: string | null;
}

export default function AdminRefundsPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [payments, setPayments] = useState<RefundablePayment[]>([]);
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
    setPayments(json.payments);
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
          {payments.length === 0 ? (
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
                  {payments.map((p) => (
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
      </div>
    </DashboardLayout>
  );
}
