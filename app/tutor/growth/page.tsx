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
      const res = await fetch('/api/groups?limit=100');
      const json = await res.json();
      setClasses((json.groups ?? []).filter((g: any) => g.tutor_id === tutorId));
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

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'overview',   label: 'Overview',        icon: Briefcase },
    { key: 'classes',    label: 'Classes',          icon: BookOpen },
    { key: 'promotions', label: 'Promotions',       icon: Tag },
    { key: 'analytics',  label: 'Analytics',        icon: BarChart3 },
    { key: 'feedback',   label: 'Parent feedback',  icon: FileText },
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
              {tab === t.key && <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-brand" />}
            </button>
          );
        })}
      </div>

      {tab === 'overview'   && <OverviewTab activeClasses={activeClasses} totalRevenue={totalRevenue} totalStudents={totalStudents} profile={profile} />}
      {tab === 'classes'    && <ClassesTab activeClasses={activeClasses} />}
      {tab === 'promotions' && <PromotionsTab classes={activeClasses} />}
      {tab === 'analytics'  && <BusinessAnalyticsTab classes={activeClasses} totalRevenue={totalRevenue} />}
      {tab === 'feedback'   && <FeedbackTab />}
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
  'time-limited': { title: 'Time-limited', blurb: 'Everyone who joins before the end date gets the discounted price.' },
  'open-ended':   { title: 'Open-ended',   blurb: 'An ongoing discount with no end date. Stays active until you remove it manually.' },
};

function PromotionsTab({ classes }: { classes: any[] }) {
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<PromoKind>('early-bird');
  const [originalPrice, setOriginalPrice] = useState(150);
  const [discountedPrice, setDiscountedPrice] = useState(120);
  const [selectedClass, setSelectedClass] = useState('');
  const [promos, setPromos] = useState<any[]>([]);

  const create = () => {
    if (!selectedClass) return;
    setPromos([...promos, { id: Date.now(), kind, originalPrice, discountedPrice, classId: selectedClass, className: classes.find((c) => c.id === selectedClass)?.name ?? '' }]);
    setCreating(false);
  };

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
          <div>
            <div className="text-sm font-semibold text-ink mb-2">Class</div>
            <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm">
              <option value="">Select a class…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-sm font-semibold text-ink mb-2">Original price (TTD)</div>
              <input type="number" value={originalPrice} onChange={(e) => setOriginalPrice(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink mb-2">Discounted price (TTD)</div>
              <input type="number" value={discountedPrice} onChange={(e) => setDiscountedPrice(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted">Cancel</button>
            <button onClick={create} disabled={!selectedClass}
              className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90 disabled:opacity-50">
              Create promotion
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
                <div className="text-xs text-muted-foreground mt-0.5">{PROMO_INFO[p.kind as PromoKind].title} · TTD {p.discountedPrice} <span className="line-through">TTD {p.originalPrice}</span></div>
              </div>
              <button onClick={() => setPromos(promos.filter((x) => x.id !== p.id))} className="size-8 grid place-items-center rounded-lg hover:bg-rose-50 text-rose-500">
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
            <h3 className="font-semibold text-ink">Revenue by month (TTD)</h3>
            <span className="text-[11px] text-muted-foreground">Peak: TTD {maxR.toLocaleString()}</span>
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
type FeedbackDraft = {
  id: string;
  studentName: string;
  initials: string;
  lessonName: string;
  month: string;
  status: 'pending' | 'approved' | 'sent';
  stats: { attendance: string; sessionsAttended: number; sessionsScheduled: number };
  body: string;
  refinedByAi?: boolean;
};

const FEEDBACK_PROMPTS = [
  'What did the student work on this month?',
  'Where did they shine? (a specific strength)',
  'Where are they still struggling?',
  'How was their engagement and attitude?',
  'What\'s your recommendation for next month?',
];

function FeedbackTab() {
  const [drafts, setDrafts] = useState<FeedbackDraft[]>([
    { id: 'f1', studentName: 'Sample Student', initials: 'SS', lessonName: 'CSEC Maths', month: 'May 2026', status: 'pending', stats: { attendance: '100%', sessionsAttended: 4, sessionsScheduled: 4 }, body: '' },
  ]);
  const [editing, setEditing] = useState<string | null>(null);

  const updateBody = (id: string, body: string) =>
    setDrafts((ds) => ds.map((d) => d.id === id ? { ...d, body } : d));
  const approve = (id: string) =>
    setDrafts((ds) => ds.map((d) => d.id === id ? { ...d, status: 'approved' } : d));

  const pending = drafts.filter((d) => d.status === 'pending').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold text-ink">Parent Feedback</h2>
        {pending > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand/10 text-brand-deep">{pending} pending</span>
        )}
      </div>

      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
        <Info className="size-3.5 mt-0.5 shrink-0 text-brand-deep" />
        Write a brief monthly narrative for each student. AI can help refine your wording once you've drafted it. Parents receive the report once you approve and send it.
      </div>

      {drafts.map((d) => (
        <div key={d.id} className="rounded-2xl bg-card border border-border p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-gradient-to-br from-brand to-emerald-400 grid place-items-center text-xs font-bold text-white">
                {d.initials}
              </div>
              <div>
                <div className="font-semibold text-ink">{d.studentName}</div>
                <div className="text-xs text-muted-foreground">{d.lessonName} · {d.month}</div>
              </div>
            </div>
            <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border',
              d.status === 'approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
              : d.status === 'sent' ? 'bg-sky-100 text-sky-700 border-sky-200'
              : 'bg-amber-100 text-amber-800 border-amber-200')}>
              {d.status}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/40 p-3 text-center text-xs">
            <div><div className="text-muted-foreground">Attendance</div><div className="font-bold text-ink">{d.stats.attendance}</div></div>
            <div><div className="text-muted-foreground">Sessions</div><div className="font-bold text-ink">{d.stats.sessionsAttended}/{d.stats.sessionsScheduled}</div></div>
            <div><div className="text-muted-foreground">Status</div><div className="font-bold text-ink capitalize">{d.status}</div></div>
          </div>

          {editing === d.id ? (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground space-y-1">
                {FEEDBACK_PROMPTS.map((q, i) => <div key={i}><span className="text-brand-deep font-semibold">{i + 1}.</span> {q}</div>)}
              </div>
              <textarea value={d.body} onChange={(e) => updateBody(d.id, e.target.value)}
                placeholder="Write your monthly report here…"
                className="w-full min-h-32 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              <div className="flex items-center justify-between">
                <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-deep hover:underline">
                  <Wand2 className="size-3.5" /> Refine with AI
                </button>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted">Close</button>
                  <button onClick={() => { approve(d.id); setEditing(null); }} className="px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand/90 inline-flex items-center gap-1">
                    <Check className="size-3" /> Approve
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              {d.body ? (
                <p className="text-sm text-muted-foreground line-clamp-2">{d.body}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No report written yet.</p>
              )}
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setEditing(d.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted">
                  <Edit3 className="size-3" /> {d.body ? 'Edit' : 'Write'}
                </button>
                {d.status === 'approved' && (
                  <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand/90">
                    <Send className="size-3" /> Send
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
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
