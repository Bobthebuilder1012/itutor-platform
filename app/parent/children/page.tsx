'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ChevronRight, AlertCircle, Check, GraduationCap } from 'lucide-react';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import ParentShell from '@/components/parent/ParentShell';

type ChildData = { id: string; name: string; initials: string; hue: number; activeClasses: number; pendingCount: number };

export default function ChildrenPage() {
  return <ParentShell><ChildrenContent /></ParentShell>;
}

function ChildrenContent() {
  const { profile } = useProfile();
  const [children, setChildren] = useState<ChildData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const { data: links } = await supabase
        .from('parent_child_links')
        .select('child_id, child:profiles!parent_child_links_child_id_fkey(id, full_name, display_name)')
        .eq('parent_id', profile.id);
      const mapped: ChildData[] = await Promise.all((links ?? []).map(async (l: any) => {
        const child = Array.isArray(l.child) ? l.child[0] : l.child;
        const name = child?.display_name || child?.full_name || 'Child';
        const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
        const hue = [145, 200, 30, 280, 350][name.charCodeAt(0) % 5];
        const { data: mems } = await supabase.from('group_members').select('status').eq('user_id', child.id);
        const active = (mems ?? []).filter((m: any) => ['approved', 'active'].includes(m.status)).length;
        const pending = (mems ?? []).filter((m: any) => m.status === 'pending').length;
        return { id: child.id, name, initials, hue, activeClasses: active, pendingCount: pending };
      }));
      setChildren(mapped);
      setLoading(false);
    })();
  }, [profile?.id]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Household</div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink mt-1">My children</h1>
          <p className="text-sm text-muted-foreground mt-1">Each child has their own student account. You control consents and payments.</p>
        </div>
        <Link href="/parent/dashboard" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep">
          <Plus className="size-4" /> Link a child
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2].map(i=><div key={i} className="h-36 rounded-2xl bg-muted animate-pulse"/>)}</div>
      ) : children.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-10 text-center">
          <div className="mx-auto size-12 rounded-2xl bg-brand-soft text-brand-deep grid place-items-center mb-4"><GraduationCap className="size-5"/></div>
          <h2 className="font-bold text-ink">No children linked yet</h2>
          <p className="text-sm text-muted-foreground mt-1">Go to your dashboard to link a child's student account.</p>
          <Link href="/parent/dashboard" className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep">Go to dashboard</Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {children.map((c) => (
            <Link key={c.id} href={`/parent/children/${c.id}`}
              className="group rounded-2xl bg-background border border-border p-5 hover:border-brand-deep/40 hover:shadow-card transition">
              <div className="flex items-start gap-3">
                <div className="size-12 rounded-full grid place-items-center font-bold text-ink shrink-0 text-lg"
                  style={{ background: `oklch(0.85 0.1 ${c.hue})` }}>{c.initials}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-ink truncate">{c.name}</h3>
                    <ChevronRight className="size-4 text-muted-foreground group-hover:translate-x-0.5 transition" />
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border flex items-center gap-3 text-xs">
                {c.activeClasses > 0
                  ? <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold"><Check className="size-3.5"/> {c.activeClasses} active class{c.activeClasses!==1?'es':''}</span>
                  : <span className="inline-flex items-center gap-1 text-muted-foreground"><GraduationCap className="size-3.5"/> No classes yet</span>}
                {c.pendingCount > 0 && <span className="inline-flex items-center gap-1 text-amber-700 font-semibold"><AlertCircle className="size-3.5"/> {c.pendingCount} pending</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
