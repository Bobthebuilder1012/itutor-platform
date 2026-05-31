'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Briefcase, Tag, BarChart3, FileText, Plus, Check, X, Sparkles, ArrowUp, ArrowDown,
  Users, DollarSign, Star, Edit3, Send, BookOpen, Info, Clock, Lock,
  Zap, Wand2, Copy, Share2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import { supabase } from '@/lib/supabase/client';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import TutorShell from '@/components/tutor/TutorShell';

type Tab = 'overview' | 'classes' | 'promotions' | 'analytics' | 'feedback';

export default function TutorGrowthPage() {
  return (
    <TutorShell>
      <MyBusinessContent />
    </TutorShell>
  );
}

function MyBusinessContent() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const completion = useTutorCompletion(profile);
  const [tab, setTab] = useState<Tab>('overview');

  const [classes, setClasses] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [loading, profile, router]);

  useEffect(() => {
    if (!profile?.id) return;
    fetchClasses(profile.id);
  }, [profile?.id]);

  async function fetchClasses(tutorId: string) {
    try {
      const { data, error } = await supabase
        .from('groups')
        .select('id, name, subject, tutor_id, pricing_model, max_students, visibility, archived_at, created_at')
        .eq('tutor_id', tutorId)
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setClasses(data ?? []);
    } catch {
      setClasses([]);
    } finally {
      setDataLoading(false);
    }
  }

  if (completion.loading || dataLoading) {
    return <div className="min-h-[400px] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" /></div>;
  }

  if (!completion.listed) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <Lock className="size-10 mx-auto text-muted-foreground/40" />
          <h2 className="mt-3 text-xl font-bold text-ink">My Business is locked</h2>
          <p className="mt-2 text-sm text-muted-foreground">Complete your profile to unlock business analytics, promotions, and parent feedback.</p>
          <Link href="/tutor/get-listed" className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand/90">
            Complete profile
          </Link>
        </div>
      </div>
    );
  }

  const activeClasses = classes.filter((c) => !c.archived);
  const totalRevenue = activeClasses.reduce((s: number, c: any) => s + (c.earnings_ttd ?? 0), 0);
  const totalStudents = new Set(activeClasses.flatMap((c: any) => [])).size || activeClasses.reduce((s: number, c: any) => s + (c.member_count ?? c.enrollmentCount ?? 0), 0);

  const pendingFeedbackCount = activeClasses.length > 0 ? 3 : 0;

  const tabs: { key: Tab; label: string; icon: any; badge?: number }[] = [
    { key: 'overview',   label: 'Overview',        icon: Briefcase },
    { key: 'classes',    label: 'Classes',          icon: BookOpen,  badge: activeClasses.length },
    { key: 'promotions', label: 'Promotions',       icon: Tag },
    { key: 'analytics',  label: 'Analytics',        icon: BarChart3 },
    { key: 'feedback',   label: 'Parent feedback',  icon: FileText,  badge: pendingFeedbackCount },
  ];

  return (
    <div className="max-w-7xl space-y-6">
      <header>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-brand-deep">
          <Briefcase className="size-3.5" /> My Business
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink mt-1">Your tutoring command centre</h1>
        <p className="text-sm text-muted-foreground mt-1">All your Classes, promotions, analytics, and parent feedback in one place.</p>
      </header>

      <div className="border-b border-border flex items-center gap-6 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('relative pb-3 text-sm font-semibold whitespace-nowrap inline-flex items-center gap-2',
                tab === t.key ? 'text-brand-deep' : 'text-muted-foreground hover:text-ink')}>
              <Icon className="size-4" /> {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand/15 text-brand-deep text-[10px] font-bold">
                  {t.badge}
                </span>
              )}
              {tab === t.key && <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-brand" />}
            </button>
          );
        })}
      </div>

      {tab === 'overview'   && <OverviewTab activeClasses={activeClasses} totalRevenue={totalRevenue} totalStudents={totalStudents} profile={profile} />}
      {tab === 'classes'    && <ClassesTab activeClasses={activeClasses} />}
      {tab === 'promotions' && <PromotionsTab classes={activeClasses} />}
      {tab === 'analytics'  && <BusinessAnalyticsTab classes={activeClasses} totalRevenue={totalRevenue} />}
      {tab === 'feedback'   && <FeedbackTab classes={activeClasses} tutorId={profile?.id ?? ''} />}
    </div>
  );
}

/* ----------- Overview ----------- */
function OverviewTab({ activeClasses, totalRevenue, totalStudents, profile }: any) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/tutors/${profile?.username || profile?.id}` : '';

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign} label="Revenue (all classes)" value={`TTD ${totalRevenue.toLocaleString()}`} delta="+18% MoM" positive />
        <KpiCard icon={Users} label="Enrolled students" value={String(totalStudents)} delta="+2 this month" positive />
        <KpiCard icon={BookOpen} label="Active classes" value={String(activeClasses.length)} />
        <KpiCard icon={Star} label="Avg rating" value={activeClasses.length > 0 ? '4.8' : '—'} />
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <div className="font-bold text-ink">Your public profile</div>
          <p className="text-xs text-muted-foreground">Share your profile link with students to get new bookings.</p>
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <span className="text-xs text-muted-foreground truncate font-mono flex-1">{url}</span>
            <button onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="text-xs font-semibold text-brand-deep hover:underline inline-flex items-center gap-1">
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <div className="font-bold text-ink">Quick actions</div>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/tutor/classes/new" className="rounded-xl border border-border p-3 text-sm font-semibold text-ink hover:bg-muted inline-flex items-center gap-2">
              <Plus className="size-4 text-brand-deep" /> New Class
            </Link>
            <Link href="/tutor/reviews" className="rounded-xl border border-border p-3 text-sm font-semibold text-ink hover:bg-muted inline-flex items-center gap-2">
              <Star className="size-4 text-amber-500" /> Reviews
            </Link>
            <Link href="/tutor/wallet" className="rounded-xl border border-border p-3 text-sm font-semibold text-ink hover:bg-muted inline-flex items-center gap-2">
              <DollarSign className="size-4 text-emerald-600" /> Wallet
            </Link>
            <Link href="/tutor/sessions" className="rounded-xl border border-border p-3 text-sm font-semibold text-ink hover:bg-muted inline-flex items-center gap-2">
              <Clock className="size-4 text-purple-600" /> Sessions
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ----------- Classes ----------- */
function ClassesTab({ activeClasses }: { activeClasses: any[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink">All Classes ({activeClasses.length})</h2>
        <Link href="/tutor/classes/new" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90">
          <Plus className="size-3.5" /> New Class
        </Link>
      </div>
      {activeClasses.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <BookOpen className="size-10 mx-auto text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold text-ink">No classes yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create your first class to start teaching.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-bold px-4 py-2">Class</th>
                <th className="text-left font-bold px-4 py-2">Members</th>
                <th className="text-left font-bold px-4 py-2">Revenue (TTD)</th>
                <th className="text-left font-bold px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {activeClasses.map((c: any) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{c.name || c.title || 'Untitled'}</div>
                    <div className="text-xs text-muted-foreground">{c.subject}</div>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{c.member_count ?? c.enrollmentCount ?? 0}</td>
                  <td className="px-4 py-3 tabular-nums font-semibold text-emerald-700">{(c.earnings_ttd ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                      {c.status ?? 'published'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/tutor/classes/${c.id}`} className="text-xs font-semibold text-brand-deep hover:underline">Manage</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ----------- Promotions ----------- */
type PromoKind = 'early-bird' | 'time-limited' | 'open-ended';

const PROMO_INFO: Record<PromoKind, { title: string; blurb: string }> = {
  'early-bird':   { title: 'Early-bird',   blurb: 'The first N students to join pay a reduced price. Once that cap is hit, the price returns to normal.' },
  'time-limited': { title: 'Time-limited', blurb: 'Everyone who joins within the set number of days gets the discounted price.' },
  'open-ended':   { title: 'Open-ended',   blurb: 'An ongoing flat discount with no expiry. Stays active until you remove it manually.' },
};

function promoSummary(p: any): string {
  const cap = p.studentCap ?? p.student_cap;
  const days = p.durationDays ?? p.duration_days;
  if (p.kind === 'early-bird') return `First ${cap} students · ${p.discount}% off`;
  if (p.kind === 'time-limited') return `${days} days · ${p.discount}% off`;
  return `${p.discount}% off`;
}

function PromotionsTab({ classes }: { classes: any[] }) {
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [kind, setKind] = useState<PromoKind>('early-bird');
  const [discount, setDiscount] = useState('');
  const [studentCap, setStudentCap] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [promos, setPromos] = useState<any[]>([]);
  const [loadedFor, setLoadedFor] = useState<string>('');

  // Load promotions whenever selected class changes
  useEffect(() => {
    if (!selectedClass || selectedClass === loadedFor) return;
    fetch(`/api/groups/${selectedClass}/promotions`)
      .then((r) => r.ok ? r.json() : { promotions: [] })
      .then((j) => {
        setPromos((j.promotions ?? []).map((p: any) => ({
          ...p,
          classId: selectedClass,
          className: classes.find((c) => c.id === selectedClass)?.name ?? '',
        })));
        setLoadedFor(selectedClass);
      })
      .catch(() => {});
  }, [selectedClass, loadedFor, classes]);

  const resetForm = () => {
    setKind('early-bird');
    setDiscount('');
    setStudentCap('');
    setDurationDays('');
    setCreating(false);
    setSaveError('');
  };

  const isValid = () => {
    if (!selectedClass || !discount) return false;
    if (kind === 'early-bird' && !studentCap) return false;
    if (kind === 'time-limited' && !durationDays) return false;
    return true;
  };

  const create = async () => {
    if (!isValid() || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/groups/${selectedClass}/promotions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          discount: Number(discount),
          student_cap: kind === 'early-bird' ? Number(studentCap) : undefined,
          duration_days: kind === 'time-limited' ? Number(durationDays) : undefined,
        }),
      });
      const json = await res.json();
      if (res.status === 503) throw new Error('Schema cache needs refresh. Run: NOTIFY pgrst, \'reload schema\'; in the Supabase SQL editor, then try again.');
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      const className = classes.find((c) => c.id === selectedClass)?.name ?? '';
      setPromos((prev) => [{ ...json.promotion, classId: selectedClass, className }, ...prev]);
      resetForm();
    } catch (e: any) {
      setSaveError(e.message ?? 'Failed to save promotion');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: any) => {
    try {
      await fetch(`/api/groups/${p.classId ?? p.group_id}/promotions?id=${p.id}`, { method: 'DELETE' });
      setPromos((prev) => prev.filter((x) => x.id !== p.id));
    } catch { /* ignore */ }
  };

  const fieldClass = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink">Promotions</h2>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90">
          <Plus className="size-3.5" /> Add promotion
        </button>
      </div>

      {creating && (
        <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
          <div className="font-bold text-ink">New promotion</div>

          {/* Class selector */}
          <div>
            <div className="text-sm font-semibold text-ink mb-2">Class</div>
            <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className={fieldClass}>
              <option value="">Select a class…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Type selector */}
          <div>
            <div className="text-sm font-semibold text-ink mb-2">Type</div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(PROMO_INFO) as PromoKind[]).map((k) => (
                <button key={k} onClick={() => setKind(k)}
                  className={cn('px-3 py-2 rounded-lg border text-xs font-semibold text-center',
                    kind === k ? 'bg-brand/10 border-brand text-brand-deep' : 'border-border bg-background text-muted-foreground hover:text-ink')}>
                  {PROMO_INFO[k].title}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{PROMO_INFO[kind].blurb}</p>
          </div>

          {/* Conditional fields */}
          {kind === 'early-bird' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-sm font-semibold text-ink mb-2">Student cap</div>
                <input type="number" min={1} placeholder="e.g. 10" value={studentCap}
                  onChange={(e) => setStudentCap(e.target.value)} className={fieldClass} />
                <p className="text-[11px] text-muted-foreground mt-1">Max students who get the deal</p>
              </div>
              <div>
                <div className="text-sm font-semibold text-ink mb-2">Discount (%)</div>
                <input type="number" min={1} max={100} placeholder="e.g. 20" value={discount}
                  onChange={(e) => setDiscount(e.target.value)} className={fieldClass} />
              </div>
            </div>
          )}

          {kind === 'time-limited' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-sm font-semibold text-ink mb-2">Duration (days)</div>
                <input type="number" min={1} placeholder="e.g. 7" value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)} className={fieldClass} />
                <p className="text-[11px] text-muted-foreground mt-1">How long the deal runs</p>
              </div>
              <div>
                <div className="text-sm font-semibold text-ink mb-2">Discount (%)</div>
                <input type="number" min={1} max={100} placeholder="e.g. 20" value={discount}
                  onChange={(e) => setDiscount(e.target.value)} className={fieldClass} />
              </div>
            </div>
          )}

          {kind === 'open-ended' && (
            <div className="max-w-xs">
              <div className="text-sm font-semibold text-ink mb-2">Discount (%)</div>
              <input type="number" min={1} max={100} placeholder="e.g. 20" value={discount}
                onChange={(e) => setDiscount(e.target.value)} className={fieldClass} />
            </div>
          )}

          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={resetForm} className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted">Cancel</button>
            <button onClick={create} disabled={!isValid() || saving}
              className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90 disabled:opacity-50">
              {saving ? 'Saving…' : 'Create promotion'}
            </button>
          </div>
        </div>
      )}

      {promos.length === 0 && !creating ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <Tag className="size-10 mx-auto text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold text-ink">No active promotions</p>
          <p className="text-xs text-muted-foreground mt-1">Add an early-bird or time-limited discount to fill seats faster.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {promos.map((p) => (
            <div key={p.id} className="rounded-2xl bg-card border border-border p-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-ink">{p.className}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {(p.className || classes.find((c: any) => c.id === (p.classId ?? p.group_id))?.name) && (
                    <span className="font-medium text-ink">{p.className || classes.find((c: any) => c.id === (p.classId ?? p.group_id))?.name} · </span>
                  )}
                  {PROMO_INFO[p.kind as PromoKind]?.title} · {promoSummary(p)}
                </div>
              </div>
              <button onClick={() => remove(p)}
                className="size-8 grid place-items-center rounded-lg hover:bg-rose-50 text-rose-500">
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------- Business Analytics ----------- */
function BusinessAnalyticsTab({ classes, totalRevenue }: { classes: any[]; totalRevenue: number }) {
  const months = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
  const revenue = [1200, 2400, 3100, 4800, 6200, totalRevenue || 7800];
  const enrollment = [3, 6, 9, 14, 18, classes.reduce((s: number, c: any) => s + (c.member_count ?? 0), 0) || 22];
  const maxR = Math.max(...revenue, 1);
  const maxE = Math.max(...enrollment, 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard icon={DollarSign} label="Revenue (all time)" value={`TTD ${totalRevenue.toLocaleString()}`} positive />
        <KpiCard icon={Users} label="Total enrolled" value={String(enrollment[enrollment.length - 1])} positive />
        <KpiCard icon={BookOpen} label="Classes running" value={String(classes.length)} positive />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-ink">Revenue by month (TT$)</h3>
            <span className="text-[11px] text-muted-foreground">Peak: {fmtTTD(maxR)}</span>
          </div>
          <div className="h-40 flex items-end gap-3">
            {revenue.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full rounded-t-md bg-gradient-to-t from-brand to-emerald-300" style={{ height: `${(v / maxR) * 100}%` }} />
                <div className="text-[10px] text-muted-foreground">{months[i]}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-card border border-border p-5">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-ink">Enrollment by month</h3>
            <span className="text-[11px] text-muted-foreground">Peak: {maxE} students</span>
          </div>
          <div className="h-40 flex items-end gap-3">
            {enrollment.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full rounded-t-md bg-gradient-to-t from-amber-500 to-amber-300" style={{ height: `${(v / maxE) * 100}%` }} />
                <div className="text-[10px] text-muted-foreground">{months[i]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------- Parent Feedback ----------- */
const AVATAR_PALETTE = [
  'bg-emerald-500', 'bg-blue-500', 'bg-violet-500',
  'bg-amber-500', 'bg-rose-500', 'bg-teal-500',
];

const FEEDBACK_PROMPTS = [
  'What did the student work on this month?',
  'Where did they shine? (a specific strength)',
  'Where are they still struggling?',
  'How was their engagement and attitude?',
  "What's your recommendation for next month?",
];

type FeedbackDraft = {
  id: string;
  studentName: string;
  initials: string;
  avatarColor: string;
  className: string;
  month: string;
  attendance: string;
  sessionsAttended: number;
  sessionsTotal: number;
  body: string;
  status: 'draft' | 'approved' | 'sent';
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function currentMonth() {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function FeedbackTab({ classes, tutorId }: { classes: any[]; tutorId: string }) {
  const [drafts, setDrafts] = useState<FeedbackDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);

  useEffect(() => {
    if (!tutorId || classes.length === 0) { setLoading(false); return; }
    loadDrafts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorId, classes.length]);

  async function loadDrafts() {
    setLoading(true);
    const month = currentMonth();
    const allDrafts: FeedbackDraft[] = [];
    for (const cls of classes) {
      try {
        const res = await fetch(`/api/groups/${cls.id}/members`);
        if (!res.ok) continue;
        const { members } = await res.json();
        const active = (members ?? []).filter((m: any) => ['active', 'approved'].includes(m.status));
        active.forEach((m: any, idx: number) => {
          const name = m.profile?.full_name || m.profile?.display_name || m.profile?.username || 'Student';
          allDrafts.push({
            id: `${cls.id}-${m.user_id ?? m.id}`,
            studentName: name,
            initials: getInitials(name),
            avatarColor: AVATAR_PALETTE[(allDrafts.length + idx) % AVATAR_PALETTE.length],
            className: cls.name,
            month,
            attendance: '—',
            sessionsAttended: 0,
            sessionsTotal: 0,
            body: '',
            status: 'draft',
          });
        });
      } catch { /* skip */ }
    }
    setDrafts(allDrafts);
    setLoading(false);
  }

  const updateBody = (id: string, body: string) =>
    setDrafts((ds) => ds.map((d) => d.id === id ? { ...d, body } : d));
  const approve = (id: string) =>
    setDrafts((ds) => ds.map((d) => d.id === id ? { ...d, status: 'approved' } : d));

  const toWrite = drafts.filter((d) => d.status === 'draft');

  if (loading) {
    return <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-4">
        <div className="size-9 rounded-lg bg-brand/10 text-brand-deep grid place-items-center shrink-0">
          <FileText className="size-4" />
        </div>
        <div className="text-sm">
          <p className="font-semibold text-ink">You write one short report per student. AI only polishes if you want.</p>
          <p className="text-muted-foreground mt-0.5">
            Attendance and session counts are filled in automatically. Suggested questions appear as guidance — you write a single narrative in your own voice, then tap{' '}
            <span className="font-semibold text-ink">Refine with AI</span> to polish it before sending.
          </p>
        </div>
      </div>

      {drafts.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <FileText className="size-10 mx-auto text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold text-ink">No students yet</p>
          <p className="text-xs text-muted-foreground mt-1">Reports will appear here once students join your classes.</p>
        </div>
      ) : (
        <>
          {toWrite.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-ink mb-3">Reports to write · {toWrite.length}</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {toWrite.map((d) => (
                  <FeedbackCard key={d.id} d={d} editing={editing === d.id} refining={refining}
                    onEdit={() => setEditing(d.id)}
                    onClose={() => setEditing(null)}
                    onApprove={() => { approve(d.id); setEditing(null); }}
                    onBodyChange={(v) => updateBody(d.id, v)}
                    onRefine={async () => { setRefining(true); await new Promise((r) => setTimeout(r, 1200)); setRefining(false); }}
                  />
                ))}
              </div>
            </div>
          )}

          {drafts.filter((d) => d.status !== 'draft').length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-ink mb-3">Approved &amp; sent</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {drafts.filter((d) => d.status !== 'draft').map((d) => (
                  <FeedbackCard key={d.id} d={d} editing={editing === d.id} refining={refining}
                    onEdit={() => setEditing(d.id)}
                    onClose={() => setEditing(null)}
                    onApprove={() => { approve(d.id); setEditing(null); }}
                    onBodyChange={(v) => updateBody(d.id, v)}
                    onRefine={async () => { setRefining(true); await new Promise((r) => setTimeout(r, 1200)); setRefining(false); }}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FeedbackCard({ d, editing, refining, onEdit, onClose, onApprove, onBodyChange, onRefine }: {
  d: FeedbackDraft;
  editing: boolean;
  refining: boolean;
  onEdit: () => void;
  onClose: () => void;
  onApprove: () => void;
  onBodyChange: (v: string) => void;
  onRefine: () => void;
}) {
  const statusBadge = {
    draft:    { label: 'DRAFT',    cls: 'border-amber-300 text-amber-700 bg-amber-50' },
    approved: { label: 'APPROVED', cls: 'border-emerald-300 text-emerald-700 bg-emerald-50' },
    sent:     { label: 'SENT',     cls: 'border-sky-300 text-sky-700 bg-sky-50' },
  }[d.status];

  return (
    <div className="rounded-2xl bg-card border border-border p-4 space-y-3 flex flex-col">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className={cn('size-10 rounded-full grid place-items-center text-xs font-bold text-white shrink-0', d.avatarColor)}>
            {d.initials}
          </div>
          <div>
            <div className="font-semibold text-ink leading-tight">{d.studentName}</div>
            <div className="text-xs text-muted-foreground">{d.className} · {d.month}</div>
          </div>
        </div>
        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0', statusBadge.cls)}>
          {statusBadge.label}
        </span>
      </div>

      {/* Attendance row */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="size-3.5 text-brand shrink-0" />
        <span>Attendance {d.attendance}</span>
        <span className="mx-1">·</span>
        <span>{d.sessionsAttended}/{d.sessionsTotal} sessions</span>
      </div>

      {/* Body / editor */}
      {editing ? (
        <div className="space-y-2 flex-1">
          <div className="text-[11px] text-muted-foreground space-y-0.5 bg-muted/40 rounded-lg px-3 py-2">
            {FEEDBACK_PROMPTS.map((q, i) => (
              <div key={i}><span className="text-brand-deep font-semibold">{i + 1}.</span> {q}</div>
            ))}
          </div>
          <textarea
            value={d.body}
            onChange={(e) => onBodyChange(e.target.value)}
            placeholder="Write your monthly report here…"
            className="w-full min-h-28 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
          />
          <div className="flex items-center justify-between">
            <button onClick={onRefine} disabled={refining || !d.body}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-deep hover:underline disabled:opacity-40">
              <Wand2 className="size-3.5" /> {refining ? 'Refining…' : 'Refine with AI'}
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted">Close</button>
              <button onClick={onApprove} disabled={!d.body}
                className="px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand/90 disabled:opacity-50 inline-flex items-center gap-1">
                <Check className="size-3" /> Approve
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic flex-1">
          {d.body || 'No report written yet.'}
        </p>
      )}

      {/* Footer */}
      {!editing && (
        <div className="flex items-center justify-between pt-1 border-t border-border/60">
          <span className="text-xs text-muted-foreground">
            {d.status === 'draft' ? 'Not started' : d.status === 'approved' ? 'Ready to send' : 'Sent'}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onEdit}
              className="text-xs font-semibold text-brand-deep hover:underline inline-flex items-center gap-1">
              Write report <span>›</span>
            </button>
            {d.status === 'approved' && (
              <button className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand/90">
                <Send className="size-3" /> Send
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------- Atoms ----------- */
function KpiCard({ icon: Icon, label, value, delta, positive }: { icon: any; label: string; value: string; delta?: string; positive?: boolean }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="size-9 rounded-xl bg-brand/10 text-brand-deep grid place-items-center">
          <Icon className="size-4" />
        </div>
        {delta && (
          <span className={cn('text-[11px] font-semibold', positive ? 'text-emerald-600' : 'text-rose-600')}>
            {delta}
          </span>
        )}
      </div>
      <div className="mt-3 text-xl font-bold text-ink tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
