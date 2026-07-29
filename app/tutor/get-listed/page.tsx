'use client';

import { Suspense, useEffect, useRef, useState, Fragment } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Circle, Camera, Copy, Lock, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion, notifyCompletionUpdated } from '@/lib/hooks/useTutorCompletion';
import { useAutosave } from '@/lib/hooks/useAutosave';
import { supabase } from '@/lib/supabase/client';
import SaveStatus from '@/components/SaveStatus';
import TutorShell from '@/components/tutor/TutorShell';
import PayoutSetupModal from '@/components/tutor/PayoutSetupModal';
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

/** Order-independent identity for a slot set, so re-reading rules isn't seen as an edit. */
function slotsKey(slots: Slot[]): string {
  return [...new Set(slots.map((s) => `${s.day}-${s.hour}`))].sort().join(',');
}

// ── Main content ───────────────────────────────────────────────────────────────
function GetListedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, loading, refresh: refreshProfile } = useProfile();
  const completion = useTutorCompletion(profile);

  // Display name
  const [displayName, setDisplayName] = useState('');

  // Bio
  const [bio, setBio] = useState('');

  // Avatar
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Subjects (loaded for rate section; managed during signup)
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);

  // Rate — per-subject inputs keyed by subject_id
  const [rateInputs, setRateInputs] = useState<Record<string, string>>({});
  const [applyAllInput, setApplyAllInput] = useState('');
  const [savingAllRate, setSavingAllRate] = useState(false);

  // Availability
  const [slots, setSlots] = useState<Slot[]>([]);
  const [availRules, setAvailRules] = useState<TutorAvailabilityRule[]>([]);
  const [availOpen, setAvailOpen] = useState(false);

  // Subject search (for adding/removing subjects on this page)
  const [subjectQuery, setSubjectQuery] = useState('');
  const [subjectResults, setSubjectResults] = useState<SubjectSearchResult[]>([]);
  const [showSubjectDropdown, setShowSubjectDropdown] = useState(false);
  const [searchingSubjects, setSearchingSubjects] = useState(false);
  const [subjectChangeInFlight, setSubjectChangeInFlight] = useState(false);

  // Payout account gate
  const [hasPayoutAccount, setHasPayoutAccount] = useState<boolean | null>(null);
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);

  // Video provider
  const [videoConnection, setVideoConnection] = useState<{ provider: string; email: string | null } | null>(null);
  const [videoConnecting, setVideoConnecting] = useState(false);
  const [videoMsg, setVideoMsg] = useState('');

  // Read by the autosave closures so they always diff against what's persisted
  // without having to be re-created (and re-armed) on every render.
  const subjectsRef = useRef<SubjectRow[]>([]);
  subjectsRef.current = subjects;
  const availRulesRef = useRef<TutorAvailabilityRule[]>([]);
  availRulesRef.current = availRules;

  // ── Autosave ────────────────────────────────────────────────────────────────
  const nameSave = useAutosave({
    value: displayName,
    enabled: !!profile?.id,
    validate: (v) => (v.trim() ? null : 'Enter a name to save'),
    save: async (v) => {
      const { error } = await supabase.from('profiles').update({ display_name: v.trim() }).eq('id', profile!.id);
      if (error) throw new Error(error.message);
      await refreshProfile();
    },
  });

  const bioSave = useAutosave({
    value: bio,
    enabled: !!profile?.id,
    // An empty bio is held rather than persisted — clearing the box mid-rewrite
    // shouldn't wipe the live profile.
    validate: (v) => (v.trim() ? null : 'Write a bio to save'),
    save: async (v) => {
      const { error } = await supabase.from('profiles').update({ bio: v.trim() }).eq('id', profile!.id);
      if (error) throw new Error(error.message);
      await refreshProfile();
      notifyCompletionUpdated();
    },
  });

  const ratesSave = useAutosave<Record<string, string>>({
    value: rateInputs,
    enabled: !!profile?.id && hasPayoutAccount === true,
    delay: 900,
    validate: (v) => {
      for (const s of subjectsRef.current) {
        const t = String(v[s.subject_id] ?? '').trim();
        // Blank is fine for a subject with no rate yet, but clearing one that is
        // already live must be held — otherwise the status would read "Saved"
        // while the old rate is still what students see.
        if (t === '') {
          if ((s.price_per_hour_ttd ?? 0) > 0) return 'Enter a rate above 0 to save';
          continue;
        }
        const n = Number(t);
        if (!Number.isFinite(n) || n <= 0) return 'Enter a rate above 0 to save';
      }
      return null;
    },
    save: async (v) => {
      const rows = subjectsRef.current
        .map((s) => ({ s, n: Number(String(v[s.subject_id] ?? '').trim()) }))
        .filter(({ s, n }) => Number.isFinite(n) && n > 0 && n !== (s.price_per_hour_ttd ?? null))
        .map(({ s, n }) => ({
          tutor_id: profile!.id,
          subject_id: s.subject_id,
          price_per_hour_ttd: n,
          mode: 'either' as const,
        }));
      if (rows.length === 0) return;

      const { error } = await supabase
        .from('tutor_subjects')
        .upsert(rows, { onConflict: 'tutor_id,subject_id' });
      if (error) throw new Error(error.message);

      // Advance the local baseline instead of re-fetching — fetchData would reset
      // rateInputs and clobber a rate the tutor is still typing in another row.
      setSubjects((prev) =>
        prev.map((s) => {
          const hit = rows.find((r) => r.subject_id === s.subject_id);
          return hit ? { ...s, price_per_hour_ttd: hit.price_per_hour_ttd } : s;
        })
      );
      notifyCompletionUpdated();
    },
  });

  // Availability rewrites the whole rule set, so saves must never overlap.
  const availChain = useRef<Promise<unknown>>(Promise.resolve());
  const availSave = useAutosave<Slot[]>({
    value: slots,
    enabled: !!profile?.id,
    delay: 700,
    isEqual: (a, b) => slotsKey(a) === slotsKey(b),
    validate: (v) => (v.length === 0 ? 'Select at least one time slot to save' : null),
    save: (v) => {
      const next = availChain.current.catch(() => {}).then(async () => {
        await Promise.all(availRulesRef.current.map((r) => deleteAvailabilityRule(r.id)));
        await Promise.all(
          slotsToRules(v).map((r) =>
            upsertAvailabilityRule({ tutor_id: profile!.id, ...r, slot_minutes: 60, buffer_minutes: 0, is_active: true })
          )
        );
        const rules = await getTutorAvailabilityRules(profile!.id);
        setAvailRules(rules);
        notifyCompletionUpdated();
      });
      availChain.current = next.catch(() => {});
      return next;
    },
  });

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

  // Hydrate the text fields exactly once per profile. Re-running on every
  // profile change would let the refresh that follows a save overwrite
  // keystrokes typed while that save was in flight.
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!profile?.id || hydratedFor.current === profile.id) return;
    hydratedFor.current = profile.id;

    const initialName = profile.display_name || profile.full_name || '';
    setDisplayName(initialName);
    nameSave.hydrate(initialName);

    const initialBio = profile.bio || '';
    setBio(initialBio);
    bioSave.hydrate(initialBio);
  }, [profile?.id, profile?.display_name, profile?.full_name, profile?.bio, nameSave.hydrate, bioSave.hydrate]);

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
    const loadedSlots = rulesToSlots(rules);
    setSlots(loadedSlots);
    setVideoConnection(vidConn ? { provider: vidConn.provider, email: vidConn.provider_account_email } : null);

    // These arrived from the server — adopt them as the saved baseline so
    // loading (or a subject add/remove) doesn't look like an unsaved edit.
    ratesSave.hydrate(inputs);
    availSave.hydrate(loadedSlots);
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
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onBlur={() => void nameSave.flush()}
          maxLength={60}
          placeholder="e.g. Kelon Rashad"
          className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Shown publicly on your tutor profile and group classes. Not your login username.</p>
          <SaveStatus state={nameSave} />
        </div>
      </SectionShell>

      {/* 3. Bio */}
      <SectionShell done={completion.bio} title="Bio / About you" subtitle="Tell students about your experience, teaching style and personality.">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          onBlur={() => void bioSave.flush()}
          rows={5}
          maxLength={500}
          placeholder="e.g. I'm a UWI Maths graduate with 6 years of CSEC tutoring experience. My students average a Grade 1 pass…"
          className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">{bio.length} / 500</span>
          <SaveStatus state={bioSave} />
        </div>
      </SectionShell>

      {/* 3. Availability */}
      <SectionShell done={completion.availability} title="Weekly availability" subtitle="Set the hours you're available to teach each week.">
        {/* Summary row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {slots.length === 0 ? 'No slots selected yet.' : `${slots.length} slot${slots.length === 1 ? '' : 's'} selected across ${[...new Set(slots.map((s) => s.day))].length} day${[...new Set(slots.map((s) => s.day))].length === 1 ? '' : 's'}.`}
          </span>
          <div className="flex items-center gap-3">
            <SaveStatus state={availSave} />
            <button
              onClick={() => setAvailOpen((o) => !o)}
              className="text-sm font-semibold text-brand-deep hover:underline"
            >
              {availOpen ? 'Collapse ↑' : 'Edit schedule ↓'}
            </button>
          </div>
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
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-xs text-muted-foreground">{slots.length} slot{slots.length === 1 ? '' : 's'} selected · changes save automatically</span>
              <SaveStatus state={availSave} />
            </div>
          </div>
        )}
      </SectionShell>

      {/* 4. Rate */}
      <SectionShell done={completion.rate} title="Hourly rate" subtitle="Set your rate per subject (TTD). Each subject can have a different rate.">
        {hasPayoutAccount === false && (
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <svg className="mt-0.5 size-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
              <span>Set up your payout account before you can set rates or receive payments.</span>
            </div>
            <button
              type="button"
              onClick={() => setPayoutModalOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep"
            >
              <Lock className="size-4" /> Set up payout account
            </button>
          </div>
        )}

        {hasPayoutAccount === true && (
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3 text-sm text-ink sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-deep" />
              <span>Payout account connected. Payouts are sent via secure bulk bank transfer.</span>
            </div>
            <button
              type="button"
              onClick={() => setPayoutModalOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-ink hover:bg-muted"
            >
              <Lock className="size-4" /> Manage payout account
            </button>
          </div>
        )}

        {/* Subject rows */}
        {subjects.length > 0 && (
          <div className="space-y-3 mb-4">
            {subjects.map((s) => {
              const label = s.subjects?.label || s.subjects?.name || 'Subject';
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
                      onBlur={() => void ratesSave.flush()}
                      onKeyDown={(e) => { if (e.key === 'Enter') void ratesSave.flush(); }}
                      disabled={!hasPayoutAccount}
                      placeholder="150"
                      className="w-32 rounded-lg border border-border bg-background pl-12 pr-3 py-2 text-sm focus:outline-none focus:border-brand disabled:opacity-50"
                    />
                  </div>
                  <span className="text-sm text-muted-foreground">/ hr</span>
                  <button
                    onClick={() => removeSubjectById(s.subject_id)}
                    disabled={subjectChangeInFlight}
                    aria-label={`Remove ${label}`}
                    className="ml-auto p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40"
                  >
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Rates save automatically.</span>
              <SaveStatus state={ratesSave} />
            </div>
          </div>
        )}

        {/* Add subject search */}
        <div className="relative">
          <input
            type="text"
            value={subjectQuery}
            onChange={(e) => setSubjectQuery(e.target.value)}
            onFocus={() => { if (subjectResults.length > 0) setShowSubjectDropdown(true); }}
            placeholder="Search to add a subject (e.g. CAPE Chemistry, CSEC Mathematics)…"
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

      <PayoutSetupModal
        open={payoutModalOpen}
        onClose={() => setPayoutModalOpen(false)}
        onSaved={() => { if (profile?.id) fetchData(profile.id); }}
      />
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
