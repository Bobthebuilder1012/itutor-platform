'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ChevronRight, AlertCircle, Check, GraduationCap, Receipt, Search } from 'lucide-react';
import { useProfile } from '@/lib/hooks/useProfile';
import ParentShell from '@/components/parent/ParentShell';
import AttentionCard from '@/components/parent/AttentionCard';

type ChildData = {
  id: string; name: string; initials: string; hue: number;
  activeClasses: number; pendingCount: number;
};

export default function ParentDashboardPage() {
  return <ParentShell><DashboardContent /></ParentShell>;
}

function DashboardContent() {
  const { profile } = useProfile();
  const [children, setChildren] = useState<ChildData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChildren = async () => {
    try {
      // Server-side (service client): child class counts aren't readable by the
      // parent from the browser due to RLS on group_members.
      const res = await fetch('/api/parent/children/summary', { cache: 'no-store' });
      const data = res.ok ? await res.json() : { children: [] };
      const mapped: ChildData[] = (data.children ?? []).map((c: any) => {
        const initials = c.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
        const hue = [145, 200, 30, 280, 350][c.name.charCodeAt(0) % 5];
        return { id: c.id, name: c.name, initials, hue, activeClasses: c.activeClasses, pendingCount: c.pendingCount };
      });
      setChildren(mapped);
    } catch { setChildren([]); } finally { setLoading(false); }
  };

  useEffect(() => { if (profile?.id) fetchChildren(); }, [profile?.id]);

  const firstName = (profile?.display_name || profile?.full_name || 'there').split(' ')[0];
  const totalActive = children.reduce((n, c) => n + c.activeClasses, 0);
  const totalPending = children.reduce((n, c) => n + c.pendingCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Parent dashboard</div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink mt-1">Welcome back, {firstName}</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your children&apos;s classes, feedback and billing.</p>
        </div>
        {/* Browsing starts here rather than from a permanent sidebar slot, per the
            kit: it is neutral and occasional, not somewhere a parent lives. This
            is also what keeps /parent/classes reachable now that Find Classes has
            left the nav. */}
        <Link
          href="/parent/classes"
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep sm:self-auto"
        >
          <Search className="size-4" /> Find a class
        </Link>
      </div>

      {/* §9.1's dominant element, above the tiles. A pending approval closes two
          hours before the class and sends no email when it lapses, so it cannot
          sit below a stats row. The child tiles below are kept — this combines
          with them rather than replacing them. */}
      <AttentionCard
        nextClassLine={
          children.length > 0
            ? `Nothing needs you. ${children.length === 1 ? children[0].name.split(' ')[0] + ' has' : 'Your children have'} ${totalActive} active ${totalActive === 1 ? 'class' : 'classes'}.`
            : null
        }
      />

      {children.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[['Children', children.length], ['Active classes', totalActive], ['Pending', totalPending]].map(([l, v]) => (
            <div key={l as string} className="rounded-2xl bg-background border border-border p-4">
              <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{l}</div>
              <div className="text-2xl font-bold text-ink mt-1">{v}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2].map(i=><div key={i} className="h-36 rounded-2xl bg-muted animate-pulse"/>)}</div>
      ) : children.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-border bg-card/50 p-10 text-center">
          <div className="mx-auto size-12 rounded-2xl bg-brand-soft text-brand-deep grid place-items-center mb-4">
            <GraduationCap className="size-5" />
          </div>
          <h2 className="font-bold text-ink">No children linked yet</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">Link your child's student account to manage their classes and payments.</p>
          <Link href="/parent/children" className="mt-5 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep">
            <Plus className="size-4" /> Invite a child
          </Link>
          <div className="mt-6 flex justify-center gap-4 text-xs">
            <Link href="/parent/billing" className="inline-flex items-center gap-1 text-muted-foreground hover:text-ink"><Receipt className="size-3.5" /> Billing</Link>
          </div>
        </div>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-ink">My children</h2>
            <Link href="/parent/children" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep">
              <Plus className="size-4" /> Invite a child
            </Link>
          </div>
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
                    ? <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold"><Check className="size-3.5" /> {c.activeClasses} active class{c.activeClasses !== 1 ? 'es' : ''}</span>
                    : <span className="inline-flex items-center gap-1 text-muted-foreground"><GraduationCap className="size-3.5" /> No classes yet</span>}
                  {c.pendingCount > 0 && <span className="inline-flex items-center gap-1 text-amber-700 font-semibold"><AlertCircle className="size-3.5" /> {c.pendingCount} pending</span>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}

// AddChildModal (parent-creates-credentials) removed — linking is now invite +
// student consent, handled on /parent/children. See app/api/parent/invite-child.
