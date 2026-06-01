'use client';

import { useEffect, useState } from 'react';
import { ReceiptText, RefreshCw, ArrowDownLeft, ShieldCheck, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import ParentShell from '@/components/parent/ParentShell';

type TxnRow = {
  id: string; student_name: string; amount_ttd: number; status: string;
  created_at: string; enrollment_id: string | null; class_name: string;
  type: 'payment' | 'refund';
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-TT', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ParentTransactionsPage() {
  return <ParentShell><TransactionsContent /></ParentShell>;
}

function TransactionsContent() {
  const { profile } = useProfile();
  const [txns, setTxns] = useState<TxnRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const { data: links } = await supabase
        .from('parent_child_links')
        .select('child_id, child:profiles!parent_child_links_child_id_fkey(id, full_name, display_name)')
        .eq('parent_id', profile.id);

      if (!links?.length) { setLoading(false); return; }

      const childMap = new Map(links.map((l: any) => {
        const c = Array.isArray(l.child) ? l.child[0] : l.child;
        return [c.id, c?.display_name || c?.full_name || 'Child'];
      }));
      const childIds = [...childMap.keys()];

      // Fetch subscription payments for all children's enrollments
      const { data: enrollments } = await supabase
        .from('group_enrollments')
        .select('id, student_id, group:groups!group_enrollments_group_id_fkey(name)')
        .in('student_id', childIds);

      const enrollmentIds = (enrollments ?? []).map((e: any) => e.id);
      const enrollMap = new Map((enrollments ?? []).map((e: any) => [
        e.id,
        { student_id: e.student_id, class_name: (Array.isArray(e.group) ? e.group[0] : e.group)?.name ?? 'Class' },
      ]));

      if (!enrollmentIds.length) { setLoading(false); return; }

      const { data: payments } = await supabase
        .from('subscription_payments')
        .select('id, enrollment_id, amount_ttd, status, created_at')
        .in('enrollment_id', enrollmentIds)
        .order('created_at', { ascending: false })
        .limit(100);

      const rows: TxnRow[] = (payments ?? []).map((p: any) => {
        const info = enrollMap.get(p.enrollment_id);
        return {
          id: p.id,
          student_name: info ? (childMap.get(info.student_id) ?? 'Child') : 'Child',
          amount_ttd: Number(p.amount_ttd ?? 0),
          status: p.status ?? 'PENDING',
          created_at: p.created_at,
          enrollment_id: p.enrollment_id,
          class_name: info?.class_name ?? 'Class',
          type: 'payment' as const,
        };
      });

      setTxns(rows);
      setLoading(false);
    })();
  }, [profile?.id]);

  const totalPaid = txns.filter(t => t.status === 'PAID' && t.type === 'payment').reduce((n, t) => n + t.amount_ttd, 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Billing</div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink mt-1">Transaction history</h1>
        <p className="text-sm text-muted-foreground mt-1">All payments made for your children's classes.</p>
      </div>

      {txns.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-brand/20 bg-brand-soft p-4">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Total paid</div>
            <div className="text-2xl font-bold text-brand-deep mt-1">{fmtTTD(totalPaid)}</div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Transactions</div>
            <div className="text-2xl font-bold text-ink mt-1">{txns.length}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1,2,3,4].map(i=><div key={i} className="h-16 rounded-2xl bg-muted animate-pulse"/>)}</div>
      ) : txns.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-10 text-center">
          <div className="mx-auto size-12 rounded-2xl bg-brand-soft text-brand-deep grid place-items-center mb-4"><ReceiptText className="size-5"/></div>
          <h2 className="font-bold text-ink">No transactions yet</h2>
          <p className="text-sm text-muted-foreground mt-1">Payment history will appear here once your children are enrolled in paid classes.</p>
        </div>
      ) : (
        <ul className="rounded-2xl border border-border bg-background divide-y divide-border overflow-hidden">
          {txns.map(t => {
            const statusMap: Record<string, { cls: string; label: string }> = {
              PAID:    { cls: 'bg-emerald-100 text-emerald-700', label: 'Paid' },
              PENDING: { cls: 'bg-amber-100 text-amber-800',    label: 'Pending' },
              FAILED:  { cls: 'bg-rose-100 text-rose-700',      label: 'Failed' },
              REFUNDED:{ cls: 'bg-muted text-muted-foreground',  label: 'Refunded' },
            };
            const sm = statusMap[t.status] ?? statusMap.PENDING;
            const Icon = t.status === 'REFUNDED' ? ArrowDownLeft : t.status === 'PAID' ? ShieldCheck : RefreshCw;
            const iconBg = t.status === 'REFUNDED' ? 'bg-muted' : t.status === 'PAID' ? 'bg-brand-soft' : 'bg-amber-50';
            const iconColor = t.status === 'REFUNDED' ? 'text-muted-foreground' : t.status === 'PAID' ? 'text-brand-deep' : 'text-amber-700';

            return (
              <li key={t.id} className="p-4 flex items-start gap-3">
                <div className={cn('size-10 rounded-xl grid place-items-center shrink-0', iconBg)}>
                  <Icon className={cn('size-4', iconColor)}/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-ink truncate">{t.class_name}</div>
                    <div className={cn('font-bold text-sm shrink-0', t.status === 'REFUNDED' ? 'text-rose-700' : 'text-ink')}>
                      {t.status === 'REFUNDED' ? '-' : ''}{fmtTTD(t.amount_ttd)}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">{t.student_name} · {fmtDate(t.created_at)}</div>
                  <span className={cn('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full mt-1 inline-block', sm.cls)}>{sm.label}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
