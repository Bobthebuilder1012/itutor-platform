'use client';

import { useEffect, useState } from 'react';
import { Receipt, ShieldCheck, RefreshCcw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import ParentShell from '@/components/parent/ParentShell';

type NotifRow = { id: string; title: string; message: string; type: string; created_at: string; is_read: boolean };

export default function BillingPage() {
  return <ParentShell><BillingContent /></ParentShell>;
}

function BillingContent() {
  const { profile } = useProfile();
  const [items, setItems] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    supabase.from('notifications')
      .select('id, title, message, type, created_at, is_read')
      .eq('user_id', profile.id)
      .in('type', ['join_request_approved', 'join_request_declined', 'group_member_suspended', 'ENROLLMENT_CONFIRMED', 'subscription_cancellation_scheduled'])
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { setItems(data ?? []); setLoading(false); });
  }, [profile?.id]);

  function kindMeta(type: string) {
    if (type.includes('approved') || type === 'ENROLLMENT_CONFIRMED') return { icon: ShieldCheck, bg: 'bg-sky-100', color: 'text-sky-700', label: 'Enrolled' };
    if (type.includes('declined') || type.includes('removed') || type.includes('banned')) return { icon: AlertCircle, bg: 'bg-rose-100', color: 'text-rose-700', label: 'Removed' };
    if (type.includes('suspend')) return { icon: AlertCircle, bg: 'bg-amber-100', color: 'text-amber-700', label: 'Suspended' };
    if (type.includes('cancel')) return { icon: RefreshCcw, bg: 'bg-muted', color: 'text-muted-foreground', label: 'Cancelled' };
    return { icon: Receipt, bg: 'bg-brand-soft', color: 'text-brand-deep', label: 'Activity' };
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Billing</div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink mt-1">Enrolment & payment history</h1>
        <p className="text-sm text-muted-foreground mt-1">A log of class enrolments, suspensions, and cancellations for your children.</p>
      </header>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-16 rounded-2xl bg-muted animate-pulse"/>)}</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-10 text-center">
          <div className="mx-auto size-12 rounded-2xl bg-brand-soft text-brand-deep grid place-items-center mb-4"><Receipt className="size-5"/></div>
          <h2 className="font-bold text-ink">No activity yet</h2>
          <p className="text-sm text-muted-foreground mt-1">Enrolment activity will appear here once your children join classes.</p>
        </div>
      ) : (
        <ul className="rounded-2xl border border-border bg-background divide-y divide-border overflow-hidden">
          {items.map((item) => {
            const meta = kindMeta(item.type);
            const Icon = meta.icon;
            return (
              <li key={item.id} className={cn('p-4 flex items-start gap-3', !item.is_read && 'bg-brand-soft/20')}>
                <div className={cn('size-10 rounded-xl grid place-items-center shrink-0', meta.bg)}>
                  <Icon className={cn('size-4', meta.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-ink text-sm truncate">{item.title}</div>
                    <div className="text-[11px] text-muted-foreground shrink-0">{new Date(item.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.message}</p>
                  <span className={cn('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full mt-1.5 inline-block', meta.bg, meta.color)}>{meta.label}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
