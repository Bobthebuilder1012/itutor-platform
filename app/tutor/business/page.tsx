'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Briefcase, Tag, BarChart3, FileText, Plus, Check, X, Sparkles,
  Users, DollarSign, Star, BookOpen, Clock, Lock, Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import { supabase } from '@/lib/supabase/client';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import { formatLevel } from '@/lib/utils/formatLevel';
import TutorShell from '@/components/tutor/TutorShell';

type Tab = 'overview' | 'classes' | 'promotions' | 'analytics' | 'feedback';

export default function TutorBusinessPage() {
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
        .select('*')
        .eq('tutor_id', tutorId)
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[fetchClasses] groups query failed:', error.message);
        setClasses([]);
        return;
      }

      const rows = data ?? [];
      const classIds = rows.map((c: any) => c.id);
      let promotionsByGroup: Record<string, any> = {};

      if (classIds.length > 0) {
        const { data: promoData } = await supabase
          .from('group_promotions')
          .select('*')
          .in('group_id', classIds)
          .eq('active', true);
        (promoData ?? []).forEach((p: any) => {
          if (!promotionsByGroup[p.group_id]) promotionsByGroup[p.group_id] = p;
        });
      }

      setClasses(rows.map((c: any) => ({ ...c, active_promotion: promotionsByGroup[c.id] ?? null })));
    } catch (e) {
      console.error('[fetchClasses] unexpected error:', e);
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
          <p className="mt-2 text-sm text-muted-foreground">Complete your profile to unlock business analytics and promotions.</p>
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

  const tabs: { key: Tab; label: string; icon: any; badge?: number; comingSoon?: boolean }[] = [
    { key: 'overview',   label: 'Overview',        icon: Briefcase },
    { key: 'classes',    label: 'Classes',          icon: BookOpen,  badge: activeClasses.length },
    { key: 'promotions', label: 'Promotions',       icon: Tag },
    { key: 'analytics',  label: 'Analytics',        icon: BarChart3 },
    { key: 'feedback',   label: 'Parent feedback',  icon: FileText,  comingSoon: true },
  ];

  return (
    <div className="max-w-7xl space-y-6">
      <header>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-brand-deep">
          <Briefcase className="size-3.5" /> My Business
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink mt-1">Your tutoring command centre</h1>
        <p className="text-sm text-muted-foreground mt-1">All your classes, promotions, and analytics in one place.</p>
      </header>

      <div className="border-b border-border flex items-center gap-6 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('relative pb-3 text-sm font-semibold whitespace-nowrap inline-flex items-center gap-2',
                tab === t.key ? 'text-brand-deep' : 'text-muted-foreground hover:text-ink')}>
              <Icon className="size-4" /> {t.label}
              {t.comingSoon && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Soon</span>
              )}
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
      {tab === 'feedback'   && <FeedbackComingSoon />}
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
  const GRADIENTS = ['from-brand to-emerald-400', 'from-sky-500 to-cyan-400', 'from-orange-500 to-amber-400', 'from-fuchsia-500 to-purple-500', 'from-rose-500 to-pink-400', 'from-indigo-500 to-blue-500'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">Your classes ({activeClasses.length})</h2>
          <p className="text-xs text-muted-foreground mt-0.5">This is how your classes appear to students on the marketplace.</p>
        </div>
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
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeClasses.map((c: any, i: number) => {
            const gradient = GRADIENTS[i % GRADIENTS.length];
            const enrolled = c.member_count ?? c.enrollmentCount ?? 0;
            const capacity = c.max_students ?? 20;
            const pct = capacity > 0 ? Math.round((enrolled / capacity) * 100) : 0;
            const spotsLeft = capacity - enrolled;
            const isLow = spotsLeft > 0 && spotsLeft <= 3;
            const price = Number(c.price_monthly ?? c.price_per_session ?? 0);
            const promo = c.active_promotion ?? null;
            const discountedPrice = promo ? Math.round(price * (1 - promo.discount / 100)) : null;
            const daysLeft = promo?.kind === 'time-limited' && promo.duration_days && promo.created_at
              ? Math.max(0, promo.duration_days - Math.floor((Date.now() - new Date(promo.created_at).getTime()) / 86400000))
              : null;

            return (
              <div key={c.id} className="rounded-3xl bg-background border border-border overflow-hidden shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 flex flex-col">
                <div className={cn('relative h-24 flex items-end p-3', !c.cover_image && `bg-gradient-to-br ${gradient}`)}
                  style={c.cover_image ? { backgroundImage: `url(${c.cover_image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                  <div className="size-12 rounded-2xl bg-white/90 backdrop-blur grid place-items-center text-2xl shadow-md">📚</div>
                  <span className={cn('absolute top-2.5 right-2.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                    c.visibility === 'private' ? 'bg-muted/90 text-ink' : 'bg-emerald-500 text-white')}>
                    {c.visibility === 'private' ? 'Private' : 'Live'}
                  </span>
                  {promo && (
                    <span className="absolute top-2.5 left-2.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-amber-900">
                      {promo.discount}% off{daysLeft !== null ? ` · ${daysLeft}d left` : ''}
                    </span>
                  )}
                </div>
                <div className="p-4 space-y-2 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-ink leading-tight">{c.name || 'Untitled'}</h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold shrink-0">
                      <Star className="size-3 fill-amber-500 text-amber-500" /> —
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">{c.subject}{c.form_level ? ` · ${formatLevel(c.form_level)}` : ''}</div>
                  {c.description && <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>}
                  <div className="flex flex-wrap gap-1">
                    {c.require_join_requests && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground">Approval required</span>}
                    {c.feedback_mode && c.feedback_mode !== 'off' && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-brand text-white inline-flex items-center gap-1">
                        <Sparkles className="size-2.5" /> Parent feedback
                      </span>
                    )}
                    {isLow && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Only {spotsLeft} left</span>}
                  </div>
                  {c.schedule_display && <div className="text-xs text-muted-foreground whitespace-pre-line">{c.schedule_display}</div>}
                  <div className="space-y-1 mt-auto">
                    <div className="text-xs text-muted-foreground">{enrolled}/{capacity} enrolled</div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={cn('h-full rounded-full', pct > 80 ? 'bg-coral' : 'bg-brand')} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <div>
                      {price > 0 ? (
                        promo ? (
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-bold text-ink">TT${discountedPrice}</span>
                            <span className="text-xs text-muted-foreground line-through">TT${price}</span>
                            <span className="text-xs text-muted-foreground">/mo</span>
                          </div>
                        ) : (
                          <><span className="font-bold text-ink">TT${price}</span><span className="text-xs text-muted-foreground">/mo</span></>
                        )
                      ) : (
                        <span className="font-bold text-brand-deep">Free</span>
                      )}
                    </div>
                    <Link href={`/tutor/classes/${c.id}`} className="text-xs font-semibold text-brand-deep hover:underline">Manage →</Link>
                  </div>
                </div>
              </div>
            );
          })}
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
  const [loadingPromos, setLoadingPromos] = useState(true);

  // Load all promotions for all classes on mount
  useEffect(() => {
    if (classes.length === 0) { setLoadingPromos(false); return; }
    setLoadingPromos(true);
    Promise.all(
      classes.map((c) =>
        fetch(`/api/groups/${c.id}/promotions`)
          .then((r) => r.ok ? r.json() : { promotions: [] })
          .then((j) => (j.promotions ?? []).map((p: any) => ({ ...p, classId: c.id, className: c.name })))
          .catch(() => [])
      )
    ).then((results) => {
      setPromos(results.flat());
      setLoadingPromos(false);
    });
  }, [classes]);

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

          <div>
            <div className="text-sm font-semibold text-ink mb-2">Class</div>
            <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className={fieldClass}>
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

      {loadingPromos ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" /></div>
      ) : promos.length === 0 && !creating ? (
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

/* ----------- Parent Feedback Coming Soon ----------- */
function FeedbackComingSoon() {
  return (
    <div className="max-w-xl mx-auto py-8">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 flex flex-col items-center text-center gap-4">
        <div className="size-14 rounded-2xl bg-amber-100 grid place-items-center">
          <FileText className="size-7 text-amber-700" />
        </div>
        <div>
          <div className="font-bold text-amber-900 text-lg flex items-center justify-center gap-2">
            Parent feedback
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">Coming soon</span>
          </div>
          <p className="text-sm text-amber-800 mt-2 max-w-sm">
            Parent accounts are launching soon. Once live, you&apos;ll be able to send monthly feedback reports directly to your students&apos; parents — included free or as a paid add-on.
          </p>
        </div>
      </div>
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
