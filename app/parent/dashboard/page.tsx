'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ChevronRight, AlertCircle, Check, GraduationCap, Receipt, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import ParentShell from '@/components/parent/ParentShell';

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
  const [addOpen, setAddOpen] = useState(false);

  const fetchChildren = async (parentId: string) => {
    try {
      const { data: links } = await supabase
        .from('parent_child_links')
        .select('child_id, child:profiles!parent_child_links_child_id_fkey(id, full_name, display_name)')
        .eq('parent_id', parentId);

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
    } catch { setChildren([]); } finally { setLoading(false); }
  };

  useEffect(() => { if (profile?.id) fetchChildren(profile.id); }, [profile?.id]);

  const firstName = (profile?.display_name || profile?.full_name || 'there').split(' ')[0];
  const totalActive = children.reduce((n, c) => n + c.activeClasses, 0);
  const totalPending = children.reduce((n, c) => n + c.pendingCount, 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Parent dashboard</div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink mt-1">Welcome back, {firstName}</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your children's classes, feedback and billing.</p>
      </div>

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
          <button onClick={() => setAddOpen(true)} className="mt-5 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep">
            <Plus className="size-4" /> Link a child
          </button>
          <div className="mt-6 flex justify-center gap-4 text-xs">
            <Link href="/parent/billing" className="inline-flex items-center gap-1 text-muted-foreground hover:text-ink"><Receipt className="size-3.5" /> Billing</Link>
          </div>
        </div>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-ink">My children</h2>
            <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep">
              <Plus className="size-4" /> Add a child
            </button>
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

      {addOpen && <AddChildModal onClose={() => setAddOpen(false)} onAdded={() => { setAddOpen(false); if (profile?.id) fetchChildren(profile.id); }} />}
    </div>
  );
}

function AddChildModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [step, setStep] = useState<'form' | 'done'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [yearLevel, setYearLevel] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [createdName, setCreatedName] = useState('');

  const handleCreate = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) return;
    if (password.trim().length < 6) { setErr('Password must be at least 6 characters.'); return; }
    setSaving(true); setErr('');
    try {
      const res = await fetch('/api/parent/create-child', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childName: name.trim(), childEmail: email.trim(), childPassword: password.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setCreatedName(data.childName ?? name.trim());
      setStep('done');
    } catch (e: any) { setErr(e?.message ?? 'Something went wrong'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-background w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 bg-background px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="font-bold text-ink">{step === 'form' ? 'Add a child' : 'Account created!'}</div>
          <button onClick={onClose} className="size-8 rounded-full hover:bg-muted grid place-items-center"><X className="size-4" /></button>
        </header>
        {step === 'form' ? (
          <div className="p-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              Create a student account for your child. You set the login details — they can sign in right away.
            </p>
            <div>
              <label className="text-xs font-semibold text-ink block mb-1.5">Child's full name <span className="text-rose-500">*</span></label>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Aliyah Mohammed"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand"/>
            </div>
            <div>
              <label className="text-xs font-semibold text-ink block mb-1.5">Email for child's account <span className="text-rose-500">*</span></label>
              <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="e.g. aliyah@email.com"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand"/>
            </div>
            <div>
              <label className="text-xs font-semibold text-ink block mb-1.5">Password <span className="text-rose-500">*</span></label>
              <div className="relative">
                <input value={password} onChange={e=>setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'} placeholder="Min. 6 characters"
                  className="w-full px-3 py-2.5 pr-16 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand"/>
                <button type="button" onClick={()=>setShowPassword(s=>!s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground hover:text-ink">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Share these credentials with your child so they can log in.</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-ink block mb-1.5">Year level / form <span className="text-muted-foreground font-normal">(optional)</span></label>
              <select value={yearLevel} onChange={e => setYearLevel(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand appearance-none">
                <option value="">Select year level…</option>
                <option value="Primary (11 yrs & under)">Primary (11 yrs &amp; under)</option>
                <option value="SEA / Standard 5 (11 yrs)">SEA / Standard 5 (11 yrs)</option>
                <option value="Form 1 (11–12 yrs)">Form 1 (11–12 yrs)</option>
                <option value="Form 2 (12–13 yrs)">Form 2 (12–13 yrs)</option>
                <option value="Form 3 (13–14 yrs)">Form 3 (13–14 yrs)</option>
                <option value="Form 4 (14–15 yrs)">Form 4 (14–15 yrs)</option>
                <option value="Form 5 (15–16 yrs)">Form 5 (15–16 yrs)</option>
                <option value="Lower 6 / CAPE (16–17 yrs)">Lower 6 / CAPE (16–17 yrs)</option>
                <option value="Upper 6 / CAPE (17–18 yrs)">Upper 6 / CAPE (17–18 yrs)</option>
                <option value="University / College">University / College</option>
              </select>
            </div>
            {err && <p className="text-xs text-rose-600">{err}</p>}
            <button disabled={!name.trim() || !email.trim() || !password.trim() || saving} onClick={handleCreate}
              className={cn('w-full px-4 py-3 rounded-2xl font-semibold text-sm',
                name.trim() && email.trim() ? 'bg-brand text-white hover:bg-brand-deep' : 'bg-muted text-muted-foreground cursor-not-allowed')}>
              {saving ? 'Creating account…' : 'Create student account'}
            </button>
          </div>
        ) : (
          <div className="p-6 text-center space-y-4">
            <div className="mx-auto size-12 rounded-2xl bg-brand grid place-items-center text-white"><Check className="size-6"/></div>
            <h3 className="font-bold text-ink">{createdName}'s account is ready</h3>
            <p className="text-sm text-muted-foreground">
              Your child can now log in at <strong>itutor.com</strong> using the email and password you set.
            </p>
            <div className="rounded-xl bg-muted/50 p-3 text-xs text-left space-y-1">
              <div><span className="font-semibold text-ink">Email:</span> {email}</div>
              <div><span className="font-semibold text-ink">Password:</span> the one you just set</div>
            </div>
            <p className="text-xs text-muted-foreground">You can now browse classes and enroll them from the Find Classes tab.</p>
            <button onClick={onAdded} className="w-full px-4 py-3 rounded-2xl bg-ink text-white font-semibold text-sm">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
