'use client';

import { Suspense, useEffect, useRef, useState, Fragment } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Circle, Camera, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion, notifyCompletionUpdated } from '@/lib/hooks/useTutorCompletion';
import { supabase } from '@/lib/supabase/client';
import TutorShell from '@/components/tutor/TutorShell';
import {
  getTutorAvailabilityRules,
  upsertAvailabilityRule,
  deleteAvailabilityRule,
} from '@/lib/services/bookingService';
import { TutorAvailabilityRule } from '@/lib/types/booking';

export default function TutorGetListedPage() {
  return (
    <TutorShell>
      <Suspense>
        <GetListedContent />
      </Suspense>
    </TutorShell>
  );
}

// ── Availability grid helpers ──────────────────────────────────────────────────
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 23 }, (_, i) => i + 1); // 1am–11pm

type Slot = { day: number; hour: number };

function rulesToSlots(rules: TutorAvailabilityRule[]): Slot[] {
  const slots: Slot[] = [];
  for (const rule of rules) {
    const startHour = parseInt(rule.start_time.split(':')[0]);
    const endHour = parseInt(rule.end_time.split(':')[0]);
    for (let h = startHour; h < endHour; h++) {
      slots.push({ day: rule.day_of_week, hour: h });
    }
  }
  return slots;
}

function slotsToRules(slots: Slot[]): { day_of_week: number; start_time: string; end_time: string }[] {
  const byDay = new Map<number, number[]>();
  for (const s of slots) {
    if (!byDay.has(s.day)) byDay.set(s.day, []);
    byDay.get(s.day)!.push(s.hour);
  }
  const rules: { day_of_week: number; start_time: string; end_time: string }[] = [];
  for (const [day, hours] of byDay.entries()) {
    const sorted = [...new Set(hours)].sort((a, b) => a - b);
    let start = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      const h = sorted[i];
      if (h === prev + 1) {
        prev = h;
      } else {
        rules.push({
          day_of_week: day,
          start_time: `${String(start).padStart(2, '0')}:00`,
          end_time: `${String(prev + 1).padStart(2, '0')}:00`,
        });
        start = h;
        prev = h;
      }
    }
  }
  return rules;
}

// ── Types ──────────────────────────────────────────────────────────────────────
type SubjectRow = { id: string | null; subject_id: string; subjects: { name: string; label?: string | null; curriculum?: string | null } | null; price_per_hour_ttd: number | null };
type SubjectSearchResult = { id: string; name: string; curriculum: string; level: string; label: string | null };

// ── Main content ───────────────────────────────────────────────────────────────
function GetListedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, loading, refresh: refreshProfile } = useProfile();
  const completion = useTutorCompletion(profile);

  // Display name
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Bio
  const [bio, setBio] = useState('');
  const [savingBio, setSavingBio] = useState(false);

  // Avatar
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Subjects (loaded for rate section; managed during signup)
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);

  // Rate — per-subject inputs keyed by subject_id
  const [rateInputs, setRateInputs] = useState<Record<string, string>>({});
  const [savingRateId, setSavingRateId] = useState<string | null>(null);
  const [applyAllInput, setApplyAllInput] = useState('');
  const [savingAllRate, setSavingAllRate] = useState(false);

  // Availability
  const [slots, setSlots] = useState<Slot[]>([]);
  const [savingAvail, setSavingAvail] = useState(false);
  const [availRules, setAvailRules] = useState<TutorAvailabilityRule[]>([]);
  const [availOpen, setAvailOpen] = useState(false);
  const [availError, setAvailError] = useState('');

  // Subject search (for adding/removing subjects on this page)
  const [subjectQuery, setSubjectQuery] = useState('');
  const [subjectResults, setSubjectResults] = useState<SubjectSearchResult[]>([]);
  const [showSubjectDropdown, setShowSubjectDropdown] = useState(false);
  const [searchingSubjects, setSearchingSubjects] = useState(false);
  const [subjectChangeInFlight, setSubjectChangeInFlight] = useState(false);

  // Payout account gate
  const [hasPayoutAccount, setHasPayoutAccount] = useState<boolean | null>(null);

  // Video provider
  const [videoConnection, setVideoConnection] = useState<{ provider: string; email: string | null } | null>(null);
  const [videoConnecting, setVideoConnecting] = useState(false);
  const [videoMsg, setVideoMsg] = useState('');

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [loading, profile, router]);

  // Handle OAuth callback redirect back to this page
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    if (success === 'true') {
      setVideoMsg('Video provider connected successfully!');
      notifyCompletionUpdated();
      window.history.replaceState({}, '', '/tutor/get-listed');
    } else if (error) {
      setVideoMsg('Connection failed. Please try again.');
      window.history.replaceState({}, '', '/tutor/get-listed');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (profile?.display_name) setDisplayName(profile.display_name);
    else if (profile?.full_name) setDisplayName(profile.full_name);
  }, [profile?.display_name, profile?.full_name]);

  useEffect(() => {
    if (profile?.bio) setBio(profile.bio);
  }, [profile?.bio]);

  useEffect(() => {
    if (!profile?.id) return;
    fetchData(profile.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function fetchData(tutorId: string) {
    const [{ data: subjs }, rules, { data: vidConn }, { data: payoutAcc }] = await Promise.all([
      supabase.from('tutor_subjects').select('id, subject_id, price_per_hour_ttd, subjects(name, label, curriculum)').eq('tutor_id', tutorId),
      getTutorAvailabilityRules(tutorId),
      supabase.from('tutor_video_provider_connections').select('provider, provider_account_email').eq('tutor_id', tutorId).maybeSingle(),
      supabase.from('tutor_payout_accounts').select('payout_account_identifier').eq('tutor_id', tutorId).maybeSingle(),
    ]);
    setHasPayoutAccount(!!payoutAcc?.payout_account_identifier);

    let tutorSubjects = (subjs ?? []) as unknown as SubjectRow[];

    // If no tutor_subjects rows yet, show subjects from user_subjects without upserting —
    // the save functions will upsert with the chosen price on first write.
    if (tutorSubjects.length === 0) {
      const { data: userSubjs } = await supabase
        .from('user_subjects')
        .select('subject_id, subjects(name, label, curriculum)')
        .eq('user_id', tutorId);

      tutorSubjects = (userSubjs ?? []).map((s: any) => ({
        id: null,
        subject_id: s.subject_id,
        subjects: s.subjects ?? null,
        price_per_hour_ttd: null,
      }));
    }

    setSubjects(tutorSubjects);
    const inputs: Record<string, string> = {};
    tutorSubjects.forEach((s) => { if (s.price_per_hour_ttd) inputs[s.subject_id] = String(s.price_per_hour_ttd); });
    setRateInputs(inputs);
    setAvailRules(rules);
    setSlots(rulesToSlots(rules));
    setVideoConnection(vidConn ? { provider: vidConn.provider, email: vidConn.provider_account_email } : null);
  }

  async function handleAvatar(file: File) {
    if (!profile) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, cacheControl: '3600' });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', profile.id);
      window.location.reload();
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  }

  async function saveDisplayNameField() {
    if (!profile) return;
    setSavingName(true);
    try {
      await supabase.from('profiles').update({ display_name: displayName.trim() || null }).eq('id', profile.id);
      await refreshProfile();
    } finally {
      setSavingName(false);
    }
  }

  async function saveBio() {
    if (!profile) return;
    setSavingBio(true);
    try {
      await supabase.from('profiles').update({ bio: bio.trim() || null }).eq('id', profile.id);
      await refreshProfile();
      notifyCompletionUpdated();
    } finally {
      setSavingBio(false);
    }
  }

  async function saveSubjectRate(subjectId: string) {
    if (!profile) return;
    const price = parseFloat(rateInputs[subjectId] ?? '');
    if (!price || price <= 0) return;
    setSavingRateId(subjectId);
    try {
      await supabase.from('tutor_subjects').upsert(
        { tutor_id: profile.id, subject_id: subjectId, price_per_hour_ttd: price, mode: 'either' },
        { onConflict: 'tutor_id,subject_id' }
      );
      await fetchData(profile.id);
      notifyCompletionUpdated();
    } finally {
      setSavingRateId(null);
    }
  }

  async function saveAllRates() {
    if (!profile) return;
    const price = parseFloat(applyAllInput);
    if (!price || price <= 0) return;
    setSavingAllRate(true);
    try {
      await Promise.all(
        subjects.map((s) =>
          supabase.from('tutor_subjects').upsert(
            { tutor_id: profile.id, subject_id: s.subject_id, price_per_hour_ttd: price, mode: 'either' },
            { onConflict: 'tutor_id,subject_id' }
          )
        )
      );
      await fetchData(profile.id);
      setApplyAllInput('');
      notifyCompletionUpdated();
    } finally {
      setSavingAllRate(false);
    }
  }

  async function saveAvailability() {
    if (!profile) return;
    if (slots.length === 0) { setAvailError('Please select at least one time slot.'); return; }
    setAvailError('');
    setSavingAvail(true);
    try {
      await Promise.all(availRules.map((r) => deleteAvailabilityRule(r.id)));
      const newRules = slotsToRules(slots);
      await Promise.all(
        newRules.map((r) =>
          upsertAvailabilityRule({ tutor_id: profile.id, ...r, slot_minutes: 60, buffer_minutes: 0, is_active: true })
        )
      );
      await fetchData(profile.id);
      setAvailOpen(false);
      notifyCompletionUpdated();
    } finally {
      setSavingAvail(false);
    }
  }

  // Subject search debounce
  useEffect(() => {
    if (!subjectQuery.trim()) { setSubjectResults([]); setShowSubjectDropdown(false); return; }
    const t = setTimeout(async () => {
      setSearchingSubjects(true);
      const safe = subjectQuery.trim().replace(/%/g, '').replace(/,/g, '');
      const { data } = await supabase
        .from('subjects')
        .select('id, name, curriculum, level, label')
        .or(`name.ilike.%${safe}%,label.ilike.%${safe}%`)
        .order('name')
        .limit(10);
      const currentIds = new Set(subjects.map((s) => s.subject_id));
      setSubjectResults(((data ?? []) as SubjectSearchResult[]).filter((s) => !currentIds.has(s.id)));
      setShowSubjectDropdown(true);
      setSearchingSubjects(false);
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectQuery, subjects]);

  async function addSubjectById(subjectId: string) {
    if (!profile) return;
    setSubjectChangeInFlight(true);
    try {
      await supabase.from('tutor_subjects').upsert(
        { tutor_id: profile.id, subject_id: subjectId, price_per_hour_ttd: 100, mode: 'either' },
        { onConflict: 'tutor_id,subject_id' }
      );
      await fetchData(profile.id);
      notifyCompletionUpdated();
      setSubjectQuery('');
      setSubjectResults([]);
      setShowSubjectDropdown(false);
    } finally {
      setSubjectChangeInFlight(false);
    }
  }

  async function removeSubjectById(subjectId: string) {
    if (!profile) return;
    setSubjectChangeInFlight(true);
    try {
      await supabase.from('tutor_subjects').delete()
        .eq('tutor_id', profile.id)
        .eq('subject_id', subjectId);
      await fetchData(profile.id);
      notifyCompletionUpdated();
    } finally {
      setSubjectChangeInFlight(false);
    }
  }

  const toggleSlot = (day: number, hour: number) => {
    setSlots((prev) =>
      prev.some((s) => s.day === day && s.hour === hour)
        ? prev.filter((s) => !(s.day === day && s.hour === hour))
        : [...prev, { day, hour }]
    );
  };

  const copyMonToWeekdays = () => {
    const monSlots = slots.filter((s) => s.day === 1).map((s) => s.hour);
    setSlots((prev) => {
      const base = prev.filter((s) => s.day === 0 || s.day === 6 || s.day === 1);
      const added = [2, 3, 4, 5].flatMap((d) => monSlots.map((h) => ({ day: d, hour: h })));
      return [...base, ...added];
    });
  };

  if (loading || !profile) {
    return <div className="min-h-[400px] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" /></div>;
  }

  const pct = Math.round((completion.completed / completion.total) * 100);
  const initials = (profile.display_name || profile.full_name || profile.email || 'T').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <Link href="/tutor/dashboard" className="text-xs text-muted-foreground hover:text-ink">← Back to dashboard</Link>
        <h1 className="mt-2 text-2xl lg:text-3xl font-bold text-ink">Get listed</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Complete all {completion.total} requirements to appear in student search and start booking sessions.
        </p>
      </header>

      {/* Progress bar */}
      <div className="sticky top-0 z-20 -mx-4 lg:mx-0 px-4 lg:px-0 py-3 bg-background/95 backdrop-blur">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-ink">{completion.completed} of {completion.total} complete</span>
            <span className="text-muted-foreground">{completion.listed ? 'Ready to be listed!' : `${completion.total - completion.completed} more to go`}</span>
          </div>
          <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* 1. Avatar */}
      <SectionShell done={completion.avatar} title="Profile picture" subtitle="A clear, friendly headshot helps students trust you.">
        <div className="flex items-center gap-5">
          <div className="size-20 rounded-full bg-muted grid place-items-center overflow-hidden border border-border text-xl font-semibold text-muted-foreground shrink-0">
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="size-full object-cover" /> : initials}
          </div>
          <div className="flex-1">
            <input type="file" accept="image/*" ref={fileRef} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatar(f); }} />
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleAvatar(f); }}
              onClick={() => fileRef.current?.click()}
              className="rounded-xl border-2 border-dashed border-border p-4 text-center text-sm text-muted-foreground hover:border-brand hover:bg-brand/5 cursor-pointer"
            >
              {uploading ? 'Uploading…' : <>Drag & drop, or <span className="font-semibold text-brand-deep">click to upload</span></>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">JPG or PNG, square works best.</p>
          </div>
        </div>
      </SectionShell>

      {/* 2. Display name */}
      <SectionShell done={!!profile.display_name || !!profile.full_name} title="Your name" subtitle="This is how your name appears on your profile and classes. Your username stays private.">
        <div className="flex gap-3">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={60}
            placeholder="e.g. Kelon Rashad"
            className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <button
            onClick={saveDisplayNameField}
            disabled={savingName || !displayName.trim()}
            className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50 whitespace-nowrap"
          >
            {savingName ? 'Saving…' : 'Save name'}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">Shown publicly on your tutor profile and group classes. Not your login username.</p>
      </SectionShell>

      {/* 3. Bio */}
      <SectionShell done={completion.bio} title="Bio / About you" subtitle="Tell students about your experience, teaching style and personality.">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={5}
          maxLength={500}
          placeholder="e.g. I'm a UWI Maths graduate with 6 years of CSEC tutoring experience. My students average a Grade 1 pass…"
          className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">{bio.length} / 500</span>
          <button onClick={saveBio} disabled={savingBio || !bio.trim()} className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50">
            {savingBio ? 'Saving…' : 'Save bio'}
          </button>
        </div>
      </SectionShell>

      {/* 3. Availability */}
      <SectionShell done={completion.availability} title="Weekly availability" subtitle="Set the hours you're available to teach each week.">
        {/* Summary row */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {slots.length === 0 ? 'No slots selected yet.' : `${slots.length} slot${slots.length === 1 ? '' : 's'} selected across ${[...new Set(slots.map((s) => s.day))].length} day${[...new Set(slots.map((s) => s.day))].length === 1 ? '' : 's'}.`}
          </span>
          <button
            onClick={() => setAvailOpen((o) => !o)}
            className="text-sm font-semibold text-brand-deep hover:underline"
          >
            {availOpen ? 'Collapse ↑' : 'Edit schedule ↓'}
          </button>
        </div>

        {availOpen && (
          <div className="mt-4 space-y-3">
            <div className="flex justify-end">
              <button onClick={copyMonToWeekdays} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:bg-brand/10 px-2 py-1 rounded">
                <Copy className="size-3" /> Copy Monday to all weekdays
              </button>
            </div>
            <div className="overflow-x-auto -mx-1">
              <div className="min-w-[520px] px-1">
                <div className="grid grid-cols-[56px_repeat(7,1fr)] gap-1">
                  <div />
                  {DAYS.map((d) => <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">{d}</div>)}
                  {HOURS.map((h) => (
                    <Fragment key={`row-${h}`}>
                      <div className="text-[10px] text-muted-foreground tabular-nums text-right pr-2 py-1 leading-7">
                        {h % 12 === 0 ? 12 : h % 12}{h < 12 ? 'am' : 'pm'}
                      </div>
                      {DAYS.map((_, d) => {
                        const on = slots.some((s) => s.day === d && s.hour === h);
                        return (
                          <button
                            key={`${d}-${h}`}
                            onClick={() => toggleSlot(d, h)}
                            className={cn('h-7 rounded transition', on ? 'bg-brand hover:bg-brand/90' : 'bg-muted hover:bg-brand/20')}
                            aria-label={`${DAYS[d]} ${h}:00`}
                          />
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
            {availError && <p className="text-sm text-red-500">{availError}</p>}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground">{slots.length} slot{slots.length === 1 ? '' : 's'} selected</span>
              <button
                onClick={saveAvailability}
                disabled={savingAvail}
                className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50"
              >
                {savingAvail ? 'Saving…' : 'Save availability'}
              </button>
            </div>
          </div>
        )}
      </SectionShell>

      {/* 4. Subjects */}
      <SectionShell done={completion.subjects} title="Your subjects" subtitle="Search and add the subjects you teach. You can add or remove them at any time.">
        {/* Current subjects as chips */}
        {subjects.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {subjects.map((s) => {
              const label = s.subjects?.label || s.subjects?.name || 'Subject';
              return (
                <span key={s.subject_id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-brand/10 text-brand-deep border border-brand/20">
                  {label}
                  <button
                    type="button"
                    onClick={() => removeSubjectById(s.subject_id)}
                    disabled={subjectChangeInFlight}
                    aria-label={`Remove ${label}`}
                    className="hover:bg-brand/20 rounded-full p-0.5 transition disabled:opacity-40"
                  >
                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Subject search */}
        <div className="relative">
          <input
            type="text"
            value={subjectQuery}
            onChange={(e) => setSubjectQuery(e.target.value)}
            onFocus={() => { if (subjectResults.length > 0) setShowSubjectDropdown(true); }}
            placeholder="Search subjects (e.g. CAPE Chemistry, CSEC Mathematics)…"
            disabled={subjectChangeInFlight}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
          />
          {showSubjectDropdown && subjectQuery.trim() && (
            <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-60 overflow-y-auto">
              {searchingSubjects ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Searching…</div>
              ) : subjectResults.length > 0 ? (
                subjectResults.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => addSubjectById(s.id)}
                    className="w-full text-left px-4 py-2.5 hover:bg-brand/5 text-sm flex items-center justify-between border-b border-border last:border-b-0"
                  >
                    <span className="font-medium text-ink">{s.label || s.name}</span>
                    <span className={cn('text-xs px-2 py-0.5 rounded font-medium', s.curriculum === 'CSEC' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
                      {s.curriculum} {s.level}
                    </span>
                  </button>
                ))
              ) : (
                <div className="p-4 text-sm text-muted-foreground text-center">No subjects found for "{subjectQuery}"</div>
              )}
            </div>
          )}
        </div>
        {showSubjectDropdown && (
          <div className="fixed inset-0 z-0" onClick={() => setShowSubjectDropdown(false)} />
        )}
      </SectionShell>

      {/* 5. Rate */}
      <SectionShell done={completion.rate} title="Hourly rate" subtitle="Set your rate per subject (TTD). Each subject can have a different rate.">
        {hasPayoutAccount === false && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <svg className="mt-0.5 size-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
            <span>
              You need to <a href="/tutor/wallet" className="font-semibold underline underline-offset-2 hover:text-amber-900">set up your payout account</a> before you can set rates or receive payments.
            </span>
          </div>
        )}
        {subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add subjects first to set rates.</p>
        ) : (
          <div className="space-y-3">
            {subjects.map((s) => {
              const label = s.subjects?.label || s.subjects?.name || 'Subject';
              const isSaving = savingRateId === s.subject_id;
              return (
                <div key={s.subject_id} className="flex items-center gap-3 flex-wrap">
                  <span className="w-36 text-sm font-medium text-ink truncate">{label}</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">TTD</span>
                    <input
                      type="number"
                      min={0}
                      value={rateInputs[s.subject_id] ?? ''}
                      onChange={(e) => setRateInputs((prev) => ({ ...prev, [s.subject_id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && saveSubjectRate(s.subject_id)}
                      placeholder="150"
                      className="w-32 rounded-lg border border-border bg-background pl-12 pr-3 py-2 text-sm focus:outline-none focus:border-brand"
                    />
                  </div>
                  <span className="text-sm text-muted-foreground">/ hr</span>
                  <button
                    onClick={() => saveSubjectRate(s.subject_id)}
                    disabled={isSaving || !rateInputs[s.subject_id] || !hasPayoutAccount}
                    className="px-3 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50"
                  >
                    {isSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {subjects.length > 1 && (
          <div className="mt-4 pt-4 border-t border-border flex items-center gap-3 flex-wrap">
            <span className="text-xs text-muted-foreground shrink-0">Apply same rate to all:</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">TTD</span>
              <input
                type="number"
                min={0}
                value={applyAllInput}
                onChange={(e) => setApplyAllInput(e.target.value)}
                placeholder="150"
                className="w-32 rounded-lg border border-border bg-background pl-12 pr-3 py-2 text-sm focus:outline-none focus:border-brand"
              />
            </div>
            <button
              onClick={saveAllRates}
              disabled={savingAllRate || !applyAllInput || !hasPayoutAccount}
              className="px-3 py-2 rounded-lg bg-muted text-ink text-sm font-semibold hover:bg-muted/70 disabled:opacity-50"
            >
              {savingAllRate ? 'Saving…' : 'Apply to all'}
            </button>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Average for CSEC tutors in Trinidad: <span className="font-semibold text-ink">TT$120–250 / hr</span></p>
      </SectionShell>

      {/* 5. Video provider (optional) */}
      <SectionShell done={completion.videoProvider} title="Video lesson provider" subtitle="Connect Zoom or Google Meet so students get the right join link." optional>
        {videoMsg && (
          <p className={`mb-3 text-sm font-medium ${videoMsg.includes('success') ? 'text-brand-deep' : 'text-red-500'}`}>{videoMsg}</p>
        )}
        {videoConnection ? (
          <div className="flex items-center gap-3 rounded-xl border border-brand bg-brand/5 p-3">
            {videoConnection.provider === 'zoom' ? <ZoomLogo className="size-9 shrink-0" /> : <MeetLogo className="size-9 shrink-0" />}
            <div className="flex-1">
              <div className="text-sm font-semibold text-ink">{videoConnection.provider === 'zoom' ? 'Zoom' : 'Google Meet'} connected</div>
              {videoConnection.email && <div className="text-xs text-muted-foreground">{videoConnection.email}</div>}
            </div>
            <Link href="/tutor/video-setup" className="text-xs text-muted-foreground hover:text-ink underline">Manage</Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              onClick={() => { setVideoConnecting(true); window.location.href = '/api/auth/google/connect?from=/tutor/get-listed'; }}
              disabled={videoConnecting}
              className="flex items-center gap-3 rounded-xl border border-border p-3 hover:border-brand/60 hover:bg-brand/5 transition text-left disabled:opacity-60"
            >
              <MeetLogo className="size-9 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-ink">Google Meet</div>
                <div className="text-xs text-muted-foreground">Connect your Google account</div>
              </div>
            </button>
            <div className="flex items-center gap-3 rounded-xl border border-border p-3 opacity-50 cursor-not-allowed select-none">
              <ZoomLogo className="size-9 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">Zoom</span>
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Coming soon</span>
                </div>
                <div className="text-xs text-muted-foreground">Connect your Zoom account</div>
              </div>
            </div>
          </div>
        )}
      </SectionShell>

      {/* Listed banner */}
      {completion.listed && (
        <div className="rounded-2xl border-2 border-brand bg-brand/5 p-6 text-center">
          <div className="text-3xl">🎉</div>
          <h3 className="mt-2 font-bold text-ink text-lg">You're listed!</h3>
          <p className="mt-1 text-sm text-muted-foreground">Students can now find your profile and book sessions with you.</p>
          <Link href="/tutor/dashboard" className="mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-deep">
            Back to dashboard
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function SectionShell({ done, title, subtitle, children, optional }: { done: boolean; title: string; subtitle: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <header className="px-5 py-4 border-b border-border flex items-start gap-3">
        <span className={cn('size-7 rounded-full grid place-items-center shrink-0', done ? 'bg-brand text-white' : 'bg-muted text-muted-foreground')}>
          {done ? <Check className="size-4" /> : <Circle className="size-4" />}
        </span>
        <div className="flex-1">
          <h2 className="font-semibold text-ink">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        {optional && !done ? (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shrink-0 bg-sky/20 text-sky-700">Optional</span>
        ) : (
          <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shrink-0', done ? 'bg-brand/15 text-brand-deep' : 'bg-muted text-muted-foreground')}>
            {done ? 'Complete' : 'Incomplete'}
          </span>
        )}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

// ── Logos ──────────────────────────────────────────────────────────────────────
function ZoomLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="10" fill="#2D8CFF"/>
      <path d="M10 17.5C10 16.12 11.12 15 12.5 15H28C30.21 15 32 16.79 32 19V29C32 30.38 30.88 31.5 29.5 31.5H14C11.79 31.5 10 29.71 10 27.5V17.5Z" fill="white"/>
      <path d="M33.5 20.5L40 16V32L33.5 27.5V20.5Z" fill="white"/>
    </svg>
  );
}

function MeetLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="10" fill="white" stroke="#E5E7EB" strokeWidth="1.5"/>
      {/* Green camera body */}
      <path d="M30 18v4.5l7-5.25v13.5l-7-5.25V30a3 3 0 01-3 3H11a3 3 0 01-3-3V18a3 3 0 013-3h16a3 3 0 013 3z" fill="#00832D"/>
      {/* Red bottom-right triangle */}
      <path d="M30 28.5V30a3 3 0 01-3 3h-4.5L30 28.5z" fill="#EA4335"/>
      {/* Blue top-right triangle */}
      <path d="M30 19.5V18a3 3 0 00-3-3h-4.5L30 19.5z" fill="#1A73E8"/>
    </svg>
  );
}
