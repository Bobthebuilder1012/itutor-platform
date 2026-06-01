'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, CheckCircle, AlertCircle, Clock, RefreshCw, CalendarCheck2, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import ParentShell from '@/components/parent/ParentShell';

type Sub = {
  id: string; student_id: string; student_name: string; group_id: string;
  status: string; payment_status: string; plan_price_ttd: number | null;
  current_period_end: string | null; next_payment_due_at: string | null;
  cancel_at_period_end: boolean; enrolled_at: string;
  group: { name: string; subject: string | null; cover_image: string | null } | null;
};

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-TT', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ParentSubscriptionsPage() {
  return <ParentShell><SubscriptionsContent /></ParentShell>;
}

function SubscriptionsContent() {
  const { profile } = useProfile();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      // Get linked children
      const { data: links } = await supabase
        .from('parent_child_links')
        .select('child_id, child:profiles!parent_child_links_child_id_fkey(id, full_name, display_name)')
        .eq('parent_id', profile.id);

      if (!links?.length) { setLoading(false); return; }

      const childIds = links.map((l: any) => l.child_id);
      const childMap = new Map(links.map((l: any) => {
        const c = Array.isArray(l.child) ? l.child[0] : l.child;
        return [c.id, c?.display_name || c?.full_name || 'Child'];
      }));

      // Get subscriptions for all children
      const { data: enrollments } = await supabase
        .from('group_enrollments')
        .select(`
          id, student_id, group_id, status, payment_status, plan_price_ttd,
          current_period_end, next_payment_due_at, cancel_at_period_end, enrolled_at,
          group:groups!group_enrollments_group_id_fkey(name, subject, cover_image)
        `)
        .in('student_id', childIds)
        .eq('enrollment_type', 'SUBSCRIPTION')
        .in('status', ['ACTIVE', 'GRACE', 'SUSPENDED', 'PENDING_PAYMENT'])
        .order('enrolled_at', { ascending: false });

      setSubs((enrollments ?? []).map((e: any) => ({
        ...e,
        student_name: childMap.get(e.student_id) ?? 'Child',
        group: Array.isArray(e.group) ? e.group[0] : e.group,
      })));
      setLoading(false);
    })();
  }, [profile?.id]);

  const active = subs.filter(s => s.status === 'ACTIVE');
  const other = subs.filter(s => s.status !== 'ACTIVE');

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Billing</div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink mt-1">Subscriptions</h1>
        <p className="text-sm text-muted-foreground mt-1">Active class subscriptions for all your children.</p>
      </div>

      {/* Stats */}
      {subs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Active" value={String(active.length)} tone="brand" />
          <StatCard label="Total spend/mo" value={active.reduce((n, s) => n + (s.plan_price_ttd ?? 0), 0) > 0 ? fmtTTD(active.reduce((n, s) => n + (s.plan_price_ttd ?? 0), 0)) : '—'} tone="brand" />
          <StatCard label="Children" value={String(new Set(subs.map(s => s.student_id)).size)} tone="muted" />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-32 rounded-2xl bg-muted animate-pulse"/>)}</div>
      ) : subs.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-10 text-center">
          <div className="mx-auto size-12 rounded-2xl bg-brand-soft text-brand-deep grid place-items-center mb-4"><GraduationCap className="size-5"/></div>
          <h2 className="font-bold text-ink">No active subscriptions</h2>
          <p className="text-sm text-muted-foreground mt-1">Enroll a child in a class to see subscriptions here.</p>
          <Link href="/parent/classes" className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep">Find classes</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {[...active, ...other].map(sub => <SubCard key={sub.id} sub={sub} />)}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: 'brand' | 'muted' }) {
  return (
    <div className={cn('rounded-2xl border p-4', tone === 'brand' ? 'bg-brand-soft border-brand/20' : 'bg-background border-border')}>
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{label}</div>
      <div className={cn('text-2xl font-bold mt-1', tone === 'brand' ? 'text-brand-deep' : 'text-ink')}>{value}</div>
    </div>
  );
}

function SubCard({ sub }: { sub: Sub }) {
  const statusMap: Record<string, { label: string; icon: any; cls: string }> = {
    ACTIVE:          { label: 'Active',          icon: CheckCircle, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    GRACE:           { label: 'Grace period',    icon: Clock,       cls: 'text-amber-700 bg-amber-50 border-amber-200' },
    SUSPENDED:       { label: 'Suspended',       icon: AlertCircle, cls: 'text-rose-700 bg-rose-50 border-rose-200' },
    PENDING_PAYMENT: { label: 'Payment pending', icon: CreditCard,  cls: 'text-sky-700 bg-sky-50 border-sky-200' },
  };
  const sm = statusMap[sub.status] ?? statusMap.ACTIVE;
  const Icon = sm.icon;

  return (
    <div className={cn('rounded-2xl border p-5 space-y-3', sm.cls)}>
      <div className="flex items-start gap-3">
        <div className="size-12 rounded-2xl bg-white/80 grid place-items-center text-2xl shadow-sm shrink-0">📚</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-ink truncate">{sub.group?.name ?? 'Class'}</h3>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/80 shrink-0">
              <Icon className="size-3"/> {sm.label}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{sub.group?.subject} · for {sub.student_name}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <InfoItem icon={<CreditCard className="size-3.5"/>} label="Plan" value={sub.plan_price_ttd ? `${fmtTTD(sub.plan_price_ttd)}/mo` : 'Free'} />
        <InfoItem icon={<CalendarCheck2 className="size-3.5"/>} label="Period ends" value={fmtDate(sub.current_period_end)} />
        <InfoItem icon={<RefreshCw className="size-3.5"/>} label="Next payment" value={sub.cancel_at_period_end ? 'Cancelling' : fmtDate(sub.next_payment_due_at)} />
      </div>
      {sub.cancel_at_period_end && (
        <div className="text-xs text-amber-700 font-medium">Cancelling at end of current period · {fmtDate(sub.current_period_end)}</div>
      )}
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{icon} {label}</div>
      <div className="text-sm font-medium text-ink mt-0.5">{value}</div>
    </div>
  );
}
