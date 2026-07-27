'use client';

// Parent "Your children" hub. Linking now works by INVITE + student consent:
// the parent enters a child's email, we email/notify the student a secure accept
// link, and the child must accept before any link is created. No account or
// password is ever created here.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Send, Loader2, Check, ChevronRight, AlertCircle, GraduationCap, RefreshCw, UserPlus } from 'lucide-react';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/utils/displayName';
import ParentShell from '@/components/parent/ParentShell';

type ChildData = { id: string; name: string; initials: string; hue: number; activeClasses: number; pendingCount: number };
type PendingInvite = { id: string; child_email: string; created_at: string };

export default function ChildrenPage() {
  return <ParentShell><ChildrenContent /></ParentShell>;
}

function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function ChildrenContent() {
  const { profile } = useProfile();
  const [children, setChildren] = useState<ChildData[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (parentId: string) => {
    const [{ data: links }, { data: inv }] = await Promise.all([
      supabase.from('parent_child_links')
        .select('child_id, child:profiles!parent_child_links_child_id_fkey(id, full_name, display_name)')
        .eq('parent_id', parentId),
      supabase.from('parent_child_invites')
        .select('id, child_email, created_at').eq('parent_id', parentId).eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ]);
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
    setInvites((inv ?? []) as PendingInvite[]);
    setLoading(false);
  }, []);

  useEffect(() => { if (profile?.id) load(profile.id); }, [profile?.id, load]);

  async function sendInvite() {
    const value = email.trim().toLowerCase();
    if (!value || sending) return;
    setSending(true);
    setMsg(null);
    try {
      const res = await fetch('/api/parent/invite-child', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: value }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ kind: 'err', text: data.error || 'Could not send invite.' }); return; }
      setEmail('');
      setMsg({ kind: 'ok', text: `Invite sent to ${value}. We’ll let you know when they accept.` });
      if (profile?.id) await load(profile.id);
    } catch {
      setMsg({ kind: 'err', text: 'Could not send invite. Please try again.' });
    } finally {
      setSending(false);
    }
  }

  async function resend(id: string) {
    setResendingId(id);
    try {
      const res = await fetch(`/api/parent/invites/${id}/resend`, { method: 'POST' });
      if (res.ok) setMsg({ kind: 'ok', text: 'Invite re-sent.' });
    } finally {
      setResendingId(null);
    }
  }

  const parentName = profile ? getDisplayName(profile) || 'Parent' : 'Parent';
  const parentInitials = parentName.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Welcome back, {parentName}</div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink mt-0.5">Your children</h1>
        </div>
        <button onClick={() => { emailRef.current?.focus(); emailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep">
          <UserPlus className="size-4" /> Invite a child
        </button>
      </div>

      {/* Linked children */}
      {!loading && children.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {children.map((c) => (
            <Link key={c.id} href={`/parent/children/${c.id}`}
              className="group rounded-2xl bg-background border border-border p-5 hover:border-brand-deep/40 hover:shadow-card transition">
              <div className="flex items-start gap-3">
                <div className="size-12 rounded-full grid place-items-center font-bold text-ink shrink-0 text-lg" style={{ background: `oklch(0.85 0.1 ${c.hue})` }}>{c.initials}</div>
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
      )}

      {/* Invite card */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="rounded-xl bg-muted/40 border border-border/60 p-4 flex items-center justify-center gap-4">
          <div className="flex flex-col items-center gap-1">
            <div className="size-11 rounded-full bg-brand/15 text-brand-deep grid place-items-center font-bold">{parentInitials}</div>
            <span className="text-[11px] text-muted-foreground">You</span>
          </div>
          <div className="flex flex-col items-center gap-1 flex-1 max-w-[180px]">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Waiting</span>
            <div className="w-full border-t border-dashed border-border" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="size-11 rounded-full bg-muted text-muted-foreground grid place-items-center font-bold">?</div>
            <span className="text-[11px] text-muted-foreground">{children.length > 0 ? 'Add another' : 'No child yet'}</span>
          </div>
        </div>

        <h2 className="mt-5 font-bold text-ink">Invite your child to connect</h2>
        <p className="text-sm text-muted-foreground mt-0.5">A connection is made by them, not by you — here’s the sequence.</p>

        <ol className="mt-4 space-y-3">
          <Step n={1}>Your child creates their own student account</Step>
          <Step n={2}>
            <div>
              You enter their email address below
              <div className="mt-2 flex flex-col sm:flex-row gap-2">
                <input ref={emailRef} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') sendInvite(); }}
                  placeholder="child@example.com"
                  className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                <button onClick={sendInvite} disabled={sending || !email.trim()}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50">
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send invite
                </button>
              </div>
              {msg && <p className={`mt-2 text-xs ${msg.kind === 'ok' ? 'text-brand-deep' : 'text-coral'}`}>{msg.text}</p>}
            </div>
          </Step>
          <Step n={3}>They get a secure link by email (and in their iTutor notifications)</Step>
          <Step n={4}>They accept, and the connection is made</Step>
        </ol>
      </section>

      {/* Pending invites */}
      {invites.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink">Pending invites <span className="text-muted-foreground font-normal">{invites.length}</span></h3>
            <span className="text-xs text-muted-foreground">Nothing links until your child accepts.</span>
          </div>
          <div className="space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="size-8 rounded-full bg-white text-amber-700 grid place-items-center text-xs font-bold shrink-0">{inv.child_email[0]?.toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink truncate">{inv.child_email}</div>
                  <div className="text-xs text-muted-foreground">sent {relative(inv.created_at)} · Waiting</div>
                </div>
                <button onClick={() => resend(inv.id)} disabled={resendingId === inv.id}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 hover:underline disabled:opacity-50">
                  {resendingId === inv.id ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Resend
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading && <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />)}</div>}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 size-6 shrink-0 rounded-full bg-brand text-white grid place-items-center text-xs font-bold">{n}</span>
      <div className="text-sm text-ink flex-1">{children}</div>
    </li>
  );
}
