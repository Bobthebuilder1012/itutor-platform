'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Briefcase, Tag, BarChart3, FileText, Plus, Check, X,
  Users, DollarSign, BookOpen, Clock, Lock, Copy, ExternalLink,
  GraduationCap, BadgeCheck, AlertCircle, UploadCloud, Loader2, ShieldCheck, CalendarClock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import { supabase } from '@/lib/supabase/client';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import TutorShell from '@/components/tutor/TutorShell';
import SupportFormModal from '@/components/SupportFormModal';
import VerifiedBadge from '@/components/VerifiedBadge';
import ClassesSection from '@/components/tutor/public/ClassesSection';
import EditableProfilePanel from '@/components/tutor/business/EditableProfilePanel';
import ProfileQrCard from '@/components/tutor/business/ProfileQrCard';
import AvailabilityEditor from '@/components/tutor/AvailabilityEditor';
import OneOnOneMarketplaceToggle from '@/components/tutor/OneOnOneMarketplaceToggle';
import { getDisplayName } from '@/lib/utils/displayName';

type Tab =
  | 'overview'
  | 'availability'
  | 'promotions'
  | 'verification'
  | 'analytics'
  | 'feedback';

const TAB_KEYS: ReadonlyArray<Tab> = [
  'overview',
  'availability',
  'promotions',
  'verification',
  'analytics',
  'feedback',
];

export default function TutorBusinessPage() {
  return (
    <TutorShell>
      {/* useSearchParams needs a Suspense boundary in the App Router. */}
      <Suspense fallback={null}>
        <MyBusinessContent />
      </Suspense>
    </TutorShell>
  );
}

function MyBusinessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, loading, refresh: refreshProfile } = useProfile();
  const completion = useTutorCompletion(profile);

  // Tabs are addressable via ?tab=, so a link can land on one. Unknown values
  // fall back to overview rather than rendering nothing.
  const requestedTab = searchParams.get('tab');
  const initialTab: Tab = TAB_KEYS.includes(requestedTab as Tab) ? (requestedTab as Tab) : 'overview';
  const [tab, setTab] = useState<Tab>(initialTab);

  // Class Match Week used to be a tab here and is now the second tab of My
  // Classes, next to the classes the campaign depends on. This forwards the
  // links that still point at the old home — the dashboard countdown, the
  // /tutor/class-match-week redirect, /class-match-week/teach, and anything
  // already sent to a teacher — rather than dropping them on Overview with no
  // explanation of where the campaign went.
  useEffect(() => {
    if (requestedTab === 'class-match-week') {
      router.replace('/tutor/classes?tab=class-match-week');
    }
  }, [requestedTab, router]);

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
      // Use select('*') to avoid failing if newer optional columns don't exist in this environment
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
        // Class-level promotions only — personal coupons (migration 231) are
        // per-attendee and are not this tutor's class-promotion state.
        const { data: promoData } = await supabase
          .from('group_promotions')
          .select('*')
          .in('group_id', classIds)
          .eq('active', true)
          .is('user_id', null);
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
          <p className="mt-2 text-sm text-muted-foreground">
            Complete your profile to unlock business analytics and promotions.
          </p>
          {/* No ?redirect= here: get-listed reads only the OAuth success/error
              params and would drop it silently. */}
          <Link
            href="/tutor/get-listed"
            className="mt-5 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand/90"
          >
            Complete profile
          </Link>
        </div>
      </div>
    );
  }

  const activeClasses = classes.filter((c) => !c.archived);
  const totalRevenue = activeClasses.reduce((s: number, c: any) => s + (c.earnings_ttd ?? 0), 0);
  const totalStudents = new Set(activeClasses.flatMap((c: any) => [])).size || activeClasses.reduce((s: number, c: any) => s + (c.member_count ?? c.enrollmentCount ?? 0), 0);

  const tabs: {
    key: Tab;
    label: string;
    icon: any;
    badge?: number;
    comingSoon?: boolean;
    /** A campaign flag, e.g. "Limited time" — distinct from the "Soon" pill. */
    flag?: string;
  }[] = [
    { key: 'overview',   label: 'Overview',        icon: Briefcase },
    { key: 'availability', label: 'Availability',   icon: CalendarClock },
    { key: 'promotions', label: 'Promotions',       icon: Tag },
    { key: 'verification', label: 'Verification',   icon: ShieldCheck },
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
              {t.flag && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-brand/15 text-brand-deep whitespace-nowrap">
                  {t.flag}
                </span>
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

      {tab === 'overview'   && <OverviewTab activeClasses={activeClasses} totalRevenue={totalRevenue} totalStudents={totalStudents} profile={profile} onProfileUpdated={refreshProfile} />}
      {tab === 'availability' && <AvailabilityTab tutorId={profile?.id} />}
      {tab === 'promotions' && <PromotionsTab classes={activeClasses} />}
      {tab === 'verification' && <VerificationCredentialsTab />}
      {tab === 'analytics'  && <BusinessAnalyticsTab classes={activeClasses} totalRevenue={totalRevenue} />}
      {tab === 'feedback'   && <FeedbackComingSoon />}
    </div>
  );
}

/* ----------- Overview — inline-editable view of the tutor's public profile ----------- */
function OverviewTab({ activeClasses, profile, onProfileUpdated }: any) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/tutors/${profile?.username || profile?.id}` : '';
  const firstName = (getDisplayName(profile) || 'Tutor').split(' ')[0];

  return (
    <div className="space-y-6">
      {/* Share link + QR — compact */}
      <section className="grid md:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-card border border-border p-4 space-y-2">
          <div className="text-sm font-bold text-ink">Share your profile</div>
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <span className="text-xs text-muted-foreground truncate font-mono flex-1">{url}</span>
            <button onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="shrink-0 text-xs font-semibold text-brand-deep hover:underline inline-flex items-center gap-1">
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border p-4 space-y-2">
          <div className="text-sm font-bold text-ink">QR code</div>
          {profile?.id && <ProfileQrCard tutorId={profile.id} />}
        </div>
      </section>

      {/* Preview (what students see) + tips */}
      <section className="grid lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-bold text-ink">Your profile</div>
              <p className="text-xs text-muted-foreground">Edit any field here — changes show on your public profile right away.</p>
            </div>
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
                Open live profile <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>

          <EditableProfilePanel profile={profile} onUpdated={onProfileUpdated} />

          {profile?.id && (
            activeClasses.length > 0 ? (
              <ClassesSection tutorId={profile.id} tutorFirstName={firstName} readOnly />
            ) : (
              <section className="rounded-3xl bg-background border border-border p-6 text-sm text-muted-foreground">
                No classes yet — create one from{' '}
                <Link href="/tutor/classes" className="font-semibold text-brand-deep hover:underline">My Classes</Link>.
              </section>
            )
          )}
        </div>

        <aside className="lg:col-span-4">
          <div className="lg:sticky lg:top-20 rounded-2xl bg-card border border-border p-5 space-y-2">
            <div className="font-bold text-ink">Tips</div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              A complete profile — a clear bio, subjects with rates, and an up-to-date class list — gets more bookings. Keep it fresh from your settings.
            </p>
            <Link href="/tutor/settings" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
              Profile settings →
            </Link>
          </div>
        </aside>
      </section>
    </div>
  );
}

/* ----------- Availability + 1:1 marketplace ----------- */
function AvailabilityTab({ tutorId }: { tutorId?: string }) {
  if (!tutorId) return null;
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Availability &amp; 1:1 bookings</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Set the weekly hours you&apos;re free to teach, and control whether you appear on the one-on-one marketplace.
        </p>
      </div>

      {/* On/off for the 1:1 marketplace */}
      <OneOnOneMarketplaceToggle tutorId={tutorId} />

      {/* Weekly availability grid */}
      <div>
        <h3 className="text-sm font-bold text-ink mb-2">Weekly availability</h3>
        <AvailabilityEditor tutorId={tutorId} />
      </div>
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
// Every figure here must come from real data. The by-month revenue and
// enrolment charts that used to live here were hardcoded sample series
// ([1200, 2400, 3100, ...] with `|| 7800` / `|| 22` fallbacks), so a tutor
// with no classes was shown someone else's imaginary business. They are gone
// until there is a real per-month source to plot.
function BusinessAnalyticsTab({ classes, totalRevenue }: { classes: any[]; totalRevenue: number }) {
  const totalEnrolled = classes.reduce((s: number, c: any) => s + (c.member_count ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard icon={DollarSign} label="Revenue (all time)" value={fmtTTD(totalRevenue)} />
        <KpiCard icon={Users} label="Total enrolled" value={String(totalEnrolled)} />
        <KpiCard icon={BookOpen} label="Classes running" value={String(classes.length)} />
      </div>

      <div className="rounded-2xl bg-card border border-border p-8 text-center">
        <div className="font-semibold text-ink">Trends are coming</div>
        <div className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
          Month-by-month revenue and enrolment charts will appear here once there is
          enough history to plot. The totals above are live.
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

// ── Verification & Credentials tab ───────────────────────────────────────────
// One tab holding the two SEPARATE "prove you're qualified" systems, led by a
// comparison card so tutors aren't confused about which is which:
//   • Verification — the iTutor "Verified" badge pipeline
//     (tutor_verification_status + verification_requests). Grants the trust
//     badge next to the name + a marketplace ranking boost. Doc stays private.
//   • Credentials  — the degrees table (mig 096). Shows the degree text
//     (title, institution, year) on the public profile once approved.
function VerificationCredentialsTab() {
  return (
    <div className="max-w-2xl space-y-8">
      {/* Clearly state the difference between the two */}
      <div className="rounded-2xl bg-mint p-5 space-y-3">
        <div>
          <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Verification &amp; Credentials</div>
          <p className="text-sm text-ink mt-1 font-medium">Two separate ways to prove you&apos;re qualified — do either or both.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl bg-background/70 border border-border/70 p-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-ink"><ShieldCheck className="size-4 text-brand-deep" /> Verification badge</div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Upload a teaching credential (CSEC, CAPE, or other) to earn the <span className="font-semibold text-ink">Verified</span> badge next to your name.
              Builds trust and lifts your marketplace ranking. Your document stays <span className="font-semibold text-ink">private</span> — students never see it.
            </p>
          </div>
          <div className="rounded-xl bg-background/70 border border-border/70 p-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-ink"><GraduationCap className="size-4 text-brand-deep" /> Credentials</div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Add a degree or qualification (title, institution, year) that appears as <span className="font-semibold text-ink">text on your public profile</span> once approved.
              Counts toward your profile completion.
            </p>
          </div>
        </div>
      </div>

      <VerificationSection />
      <div className="border-t border-border" />
      <CredentialsSection />
    </div>
  );
}

// ── Verification section — the "Verified" badge pipeline ─────────────────────
// Reuses the standalone /tutor/verification 3-step upload flow: create request
// (signed URL) → PUT file → trigger processing.
interface VerificationRequest {
  id: string;
  status: string;
  system_recommendation: string | null;
  system_reason: string | null;
  reviewer_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/** Internal status enums are not tutor-facing copy. */
function verificationStatusLabel(status: string | null | undefined): string {
  switch (String(status ?? '').toUpperCase()) {
    case 'SUBMITTED':
    case 'PROCESSING':
      return 'Processing';
    case 'READY_FOR_REVIEW':
      return 'Awaiting review';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Not approved';
    default:
      return status ? String(status).replace(/_/g, ' ').toLowerCase() : '—';
  }
}

function VerificationSection() {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [latestRequest, setLatestRequest] = useState<VerificationRequest | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  async function load() {
    try {
      const res = await fetch('/api/verification/request');
      const data = await res.json();
      if (res.ok) {
        setStatus(data.verificationStatus ?? null);
        setLatestRequest(data.latestRequest ?? null);
        setPendingCount(data.pendingCount ?? 0);
      }
    } catch (e) {
      console.error('[VerificationSection] failed to load status:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);
    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const fileType = fileExt === 'pdf' ? 'pdf' : 'image';

      const createRes = await fetch('/api/verification/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileType, originalFilename: file.name }),
      });
      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error || 'Failed to create verification request');
      }
      const { uploadUrl, requestId } = await createRes.json();

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!uploadRes.ok) throw new Error('Failed to upload file');

      const processRes = await fetch(`/api/verification/request/${requestId}/process`, { method: 'POST' });
      if (!processRes.ok) console.warn('[VerificationSection] processing may have failed, but file was uploaded');

      setUploadSuccess(true);
      await load();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-10"><Loader2 className="size-4 animate-spin" /> Loading verification…</div>;
  }

  // A pending review no longer hides the upload card. Blocking on 'PENDING'
  // stranded any tutor who submitted the wrong file, a blurry scan or the wrong
  // side of a results slip: the card vanished the moment they submitted, so
  // their only route to fixing it was to wait for a rejection or ask support.
  // Documents now queue — submit as many as you like, each reviewed separately.
  //
  // Still hidden once VERIFIED: a fresh request against an already-verified
  // tutor is a live hazard, because rejecting it strips the badge they already
  // hold and unpublishes every verified subject.
  const canUpload = status !== 'VERIFIED';
  const hasQueue = pendingCount > 0;
  // Only what a REVIEWER wrote. Falling back to system_reason published the
  // automated note, which on every real upload was the "Sample Tutor" name
  // mismatch — so a tutor rejected for any reason was told it was because
  // their name did not match a document belonging to somebody who does not
  // exist. If a reviewer left no note, say nothing rather than invent one.
  const rejectionReason = latestRequest?.reviewer_reason || null;

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink"><ShieldCheck className="size-4 text-brand-deep" /> Verification badge</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Upload a teaching credential to get the Verified badge and a marketplace ranking boost. Your document stays private.</p>
        </div>
        <button onClick={() => setShowSupport(true)} className="shrink-0 text-xs font-semibold text-brand-deep hover:underline whitespace-nowrap">
          Need help?
        </button>
      </div>

      {/* Status card */}
      {status === 'VERIFIED' && (
        <div className="rounded-2xl border border-brand/30 bg-brand/5 p-4 flex items-start gap-3">
          <BadgeCheck className="size-5 shrink-0 text-brand-deep mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-ink flex items-center gap-2">Verified <VerifiedBadge size="sm" /></div>
            <div className="text-sm text-muted-foreground mt-0.5">
              Your credentials have been verified. The badge shows on your public profile and you rank higher in the marketplace.
            </div>
          </div>
        </div>
      )}

      {status === 'PENDING' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <Clock className="size-5 shrink-0 text-amber-500 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-800">Under review</div>
            <div className="text-sm text-amber-700 mt-0.5">
              Our team is reviewing your document. This usually takes 1–2 business days. It stays hidden from students until approved.
            </div>
          </div>
        </div>
      )}

      {status === 'REJECTED' && (
        <div className="rounded-2xl border border-coral/30 bg-coral/5 p-4 flex items-start gap-3">
          <AlertCircle className="size-5 shrink-0 text-coral mt-0.5" />
          <div>
            <div className="font-semibold text-ink">Not verified</div>
            {rejectionReason && <div className="text-sm text-ink/80 mt-0.5"><span className="font-medium">Reason:</span> {rejectionReason}</div>}
            <div className="text-xs text-muted-foreground mt-1">Review the feedback, then upload a clearer document below to resubmit.</div>
          </div>
        </div>
      )}

      {uploadError && <div className="rounded-xl bg-coral/10 border border-coral/30 p-3 text-sm text-coral">{uploadError}</div>}
      {uploadSuccess && (
        <div className="rounded-xl bg-brand/10 border border-brand/30 p-3 text-sm text-brand-deep">
          Your document was submitted and is being processed.
        </div>
      )}

      {/* Upload */}
      {canUpload && (
        <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <div>
            <div className="font-bold text-ink">
              {status === 'REJECTED'
                ? 'Resubmit your document'
                : hasQueue
                  ? 'Upload another document'
                  : 'Upload verification document'}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">CSEC, CAPE, or other teaching qualification — PDF, JPG, PNG or WEBP (max 10MB).</p>
            {hasQueue && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {pendingCount === 1 ? '1 document is' : `${pendingCount} documents are`} waiting to be reviewed.
                You can add more — each one is reviewed on its own.
              </p>
            )}
          </div>
          <label className={cn(
            'flex items-center gap-3 rounded-xl border-2 border-dashed border-border p-4',
            uploading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-brand hover:bg-brand/5',
          )}>
            {uploading ? <Loader2 className="size-5 text-brand-deep animate-spin" /> : <UploadCloud className="size-5 text-muted-foreground" />}
            <span className="text-sm text-muted-foreground">
              {uploading ? 'Uploading and processing…' : 'Click to upload your certificate or results slip'}
            </span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" disabled={uploading} onChange={handleFileUpload} />
          </label>
        </div>
      )}

      {/* Request details */}
      {latestRequest && (
        <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <div className="font-bold text-ink">Latest request</div>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <div className="text-ink font-medium mt-0.5">{verificationStatusLabel(latestRequest.status)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Submitted</div>
              <div className="text-ink font-medium mt-0.5">{new Date(latestRequest.created_at).toLocaleString()}</div>
            </div>
            {/* The system assessment is a REVIEWER's note and is not shown here.
                It read "REJECT: Name does not match profile. Extracted: 'Sample
                Tutor' vs Profile: '<their name>'" — an internal string, about a
                document belonging to nobody, telling a tutor they had been
                rejected directly underneath a banner saying their upload was
                being processed. A reviewer's decision reaches them through
                reviewer_reason below, once a human has actually made one. */}
            {latestRequest.reviewed_at && (
              <div>
                <div className="text-xs text-muted-foreground">Reviewed</div>
                <div className="text-ink font-medium mt-0.5">{new Date(latestRequest.reviewed_at).toLocaleString()}</div>
              </div>
            )}
          </div>
        </div>
      )}

      <SupportFormModal isOpen={showSupport} onClose={() => setShowSupport(false)} />
    </div>
  );
}

// ── Credentials section — degree text on the public profile ──────────────────
// Surfaces the existing degree-verification pipeline (mig 096): submit/resubmit
// a degree with a private document, see review status, and — when rejected —
// see the reason and resubmit. The uploaded document is evidence only (private
// bucket); students only ever see the verified text.
const CREDENTIAL_INPUT = 'w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand';

function CredentialsSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [degree, setDegree] = useState<any>(null);
  const [editing, setEditing] = useState(false);

  const [fullName, setFullName] = useState('');
  const [school, setSchool] = useState('');
  const [title, setTitle] = useState('');
  const [field, setField] = useState('');
  const [year, setYear] = useState('');
  const [file, setFile] = useState<File | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/degrees/me');
      const json = await res.json();
      setDegree(json.degree ?? null);
      if (json.degree) {
        setFullName(json.degree.full_name ?? '');
        setSchool(json.degree.school_name ?? '');
        setTitle(json.degree.degree ?? '');
        setField(json.degree.field ?? '');
        setYear(json.degree.graduation_year ? String(json.degree.graduation_year) : '');
      }
    } catch {
      setError('Failed to load your credentials.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function submit() {
    setError('');
    if (!fullName.trim() || !school.trim() || !title.trim() || !year.trim()) {
      setError('Full name, institution, credential title and year are required.');
      return;
    }
    if (!file) { setError('Please attach a photo or PDF of your certificate.'); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('full_name', fullName.trim());
      fd.append('school_name', school.trim());
      fd.append('degree', title.trim());
      fd.append('field', field.trim());
      fd.append('graduation_year', year.trim());
      fd.append('file', file);
      const res = await fetch('/api/degrees', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Submission failed');
      setEditing(false);
      setFile(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const status = degree?.status as 'pending' | 'verified' | 'rejected' | undefined;
  const showForm = !degree || status === 'rejected' || editing;

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-10"><Loader2 className="size-4 animate-spin" /> Loading credentials…</div>;
  }

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink"><GraduationCap className="size-4 text-brand-deep" /> Credentials</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Add a degree or qualification shown as text on your public profile. Your document stays private — students only ever see the
          approved text (title, institution, year) plus a “Verified” badge. Counts toward your profile completion.
        </p>
      </div>

      {error && <div className="rounded-xl bg-coral/10 border border-coral/30 p-3 text-sm text-coral">{error}</div>}

      {/* Status card */}
      {status === 'verified' && (
        <div className="rounded-2xl border border-brand/30 bg-brand/5 p-4 flex items-start gap-3">
          <BadgeCheck className="size-5 shrink-0 text-brand-deep mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-ink">Verified{degree.field ? `: ${degree.degree} — ${degree.field}` : `: ${degree.degree}`}</div>
            <div className="text-sm text-muted-foreground mt-0.5">{[degree.school_name, degree.graduation_year].filter(Boolean).join(' · ')}</div>
            <div className="text-xs text-brand-deep mt-1">This is shown on your public profile.</div>
          </div>
        </div>
      )}

      {status === 'pending' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <Clock className="size-5 shrink-0 text-amber-500 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-800">Under review</div>
            <div className="text-sm text-amber-700 mt-0.5">
              {degree.degree}{degree.school_name ? ` · ${degree.school_name}` : ''}. Our team is checking your document against the details you entered. It stays hidden from students until approved.
            </div>
          </div>
        </div>
      )}

      {status === 'rejected' && (
        <div className="rounded-2xl border border-coral/30 bg-coral/5 p-4 flex items-start gap-3">
          <AlertCircle className="size-5 shrink-0 text-coral mt-0.5" />
          <div>
            <div className="font-semibold text-ink">Couldn’t verify this credential</div>
            {degree.rejection_reason && <div className="text-sm text-ink/80 mt-0.5"><span className="font-medium">Reason:</span> {degree.rejection_reason}</div>}
            <div className="text-xs text-muted-foreground mt-1">Update the details or upload a clearer document below and resubmit.</div>
          </div>
        </div>
      )}

      {status === 'verified' && !editing && (
        <button onClick={() => setEditing(true)} className="text-sm font-semibold text-brand-deep hover:underline">
          Replace credential
        </button>
      )}

      {/* Submit / resubmit form */}
      {showForm && (
        <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-ink mb-1.5">Name as it appears on the document</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={CREDENTIAL_INPUT} placeholder="e.g. Jane A. Doe" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1.5">Credential title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={CREDENTIAL_INPUT} placeholder="e.g. B.Sc. Mathematics" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1.5">Field of study <span className="text-muted-foreground">(optional)</span></label>
              <input value={field} onChange={(e) => setField(e.target.value)} className={CREDENTIAL_INPUT} placeholder="e.g. Applied Mathematics" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1.5">Institution</label>
              <input value={school} onChange={(e) => setSchool(e.target.value)} className={CREDENTIAL_INPUT} placeholder="e.g. UWI St. Augustine" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1.5">Year</label>
              <input value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" className={CREDENTIAL_INPUT} placeholder="e.g. 2019" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1.5 flex items-center gap-1.5">
              <Lock className="size-3.5 text-brand-deep" /> Document (PDF or image, private)
            </label>
            <label className="flex items-center gap-3 rounded-xl border-2 border-dashed border-border p-4 cursor-pointer hover:border-brand hover:bg-brand/5">
              <UploadCloud className="size-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {file ? file.name : 'Click to upload your certificate or transcript (max 10MB)'}
              </span>
              <input type="file" accept=".pdf,image/png,image/jpeg,image/webp" className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          <div className="flex justify-end gap-2">
            {editing && (
              <button onClick={() => { setEditing(false); setFile(null); }} className="px-4 py-2 rounded-xl border border-border bg-background text-sm font-semibold hover:bg-muted">
                Cancel
              </button>
            )}
            <button onClick={submit} disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {status === 'rejected' ? 'Resubmit for review' : 'Submit for review'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
