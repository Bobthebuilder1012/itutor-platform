'use client';

import { Suspense, useEffect, useRef, useState, Fragment } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Circle, Camera, Plus, X, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
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
type SubjectRow = { id: string; subject_id: string; subjects: { name: string; label?: string | null } | null; price_per_hour_ttd: number | null };
type SubjectOption = { id: string; name: string; label: string | null };

// ── Main content ───────────────────────────────────────────────────────────────
function GetListedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, loading, refresh: refreshProfile } = useProfile();
  const [completionKey, setCompletionKey] = useState(0);
  const completion = useTutorCompletion(profile, completionKey);

  // Bio
  const [bio, setBio] = useState('');
  const [savingBio, setSavingBio] = useState(false);

  // Avatar
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Subjects
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [subjectOptions, setSubjectOptions] = useState<SubjectOption[]>([]);
  const [addSubjectOpen, setAddSubjectOpen] = useState(false);
  const [pickSubjectId, setPickSubjectId] = useState('');
  const [pickPrice, setPickPrice] = useState('');
  const [addingSubject, setAddingSubject] = useState(false);

  // Rate
  const [rateInput, setRateInput] = useState('');
  const [savingRate, setSavingRate] = useState(false);

  // Availability
  const [slots, setSlots] = useState<Slot[]>([]);
  const [savingAvail, setSavingAvail] = useState(false);
  const [availRules, setAvailRules] = useState<TutorAvailabilityRule[]>([]);
  const [availOpen, setAvailOpen] = useState(false);
  const [availError, setAvailError] = useState('');

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
      setCompletionKey((k) => k + 1);
      window.history.replaceState({}, '', '/tutor/get-listed');
    } else if (error) {
      setVideoMsg('Connection failed. Please try again.');
      window.history.replaceState({}, '', '/tutor/get-listed');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (profile?.bio) setBio(profile.bio);
  }, [profile?.bio]);

  useEffect(() => {
    if (!profile?.id) return;
    fetchData(profile.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function fetchData(tutorId: string) {
    const [{ data: subjs }, { data: opts }, rules, { data: vidConn }] = await Promise.all([
      supabase.from('tutor_subjects').select('id, subject_id, price_per_hour_ttd, subjects(name, label)').eq('tutor_id', tutorId),
      supabase.from('subjects').select('id, name, label').order('name'),
      getTutorAvailabilityRules(tutorId),
      supabase.from('tutor_video_provider_connections').select('provider, provider_account_email').eq('tutor_id', tutorId).maybeSingle(),
    ]);
    setSubjects((subjs ?? []) as unknown as SubjectRow[]);
    setSubjectOptions((opts ?? []) as unknown as SubjectOption[]);
    setAvailRules(rules);
    setSlots(rulesToSlots(rules));
    if (!pickSubjectId && opts && opts.length > 0) setPickSubjectId(opts[0].id);
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

  async function saveBio() {
    if (!profile) return;
    setSavingBio(true);
    try {
      await supabase.from('profiles').update({ bio: bio.trim() || null }).eq('id', profile.id);
      await refreshProfile();
    } finally {
      setSavingBio(false);
    }
  }

  async function addSubject() {
    if (!profile || !pickSubjectId) return;
    setAddingSubject(true);
    try {
      const price = parseFloat(pickPrice) || null;
      await supabase.from('tutor_subjects').upsert(
        { tutor_id: profile.id, subject_id: pickSubjectId, price_per_hour_ttd: price },
        { onConflict: 'tutor_id,subject_id' }
      );
      setAddSubjectOpen(false);
      setPickPrice('');
      await fetchData(profile.id);
      setCompletionKey((k) => k + 1);
    } finally {
      setAddingSubject(false);
    }
  }

  async function removeSubject(id: string) {
    await supabase.from('tutor_subjects').delete().eq('id', id);
    setSubjects((prev) => prev.filter((s) => s.id !== id));
    setCompletionKey((k) => k + 1);
  }

  async function saveRate() {
    if (!profile || subjects.length === 0) return;
    const price = parseFloat(rateInput);
    if (!price || price <= 0) return;
    setSavingRate(true);
    try {
      await Promise.all(
        subjects.map((s) =>
          supabase.from('tutor_subjects').update({ price_per_hour_ttd: price }).eq('id', s.id)
        )
      );
      await fetchData(profile.id);
      setRateInput('');
      setCompletionKey((k) => k + 1);
    } finally {
      setSavingRate(false);
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
      setCompletionKey((k) => k + 1);
    } finally {
      setSavingAvail(false);
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

      {/* 2. Bio */}
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

      {/* 3. Subjects */}
      <SectionShell done={completion.subjects} title="Subjects you teach" subtitle="Add at least one subject you teach.">
        <div className="flex flex-wrap gap-2 mb-3">
          {subjects.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-2 pl-3 pr-1 py-1 rounded-full bg-brand/10 text-brand-deep text-sm font-medium">
              {s.subjects?.label || s.subjects?.name || 'Subject'}
              {s.price_per_hour_ttd ? <span className="text-xs opacity-70">· TT${s.price_per_hour_ttd}/hr</span> : null}
              <button onClick={() => removeSubject(s.id)} className="size-5 grid place-items-center rounded-full hover:bg-brand/20">
                <X className="size-3" />
              </button>
            </span>
          ))}
          <button
            onClick={() => setAddSubjectOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-dashed border-border text-sm text-muted-foreground hover:border-brand hover:text-brand-deep"
          >
            <Plus className="size-3.5" /> Add subject
          </button>
        </div>

        {addSubjectOpen && (
          <div className="rounded-xl border border-border bg-muted/40 p-3 flex flex-col sm:flex-row gap-2">
            <select
              value={pickSubjectId}
              onChange={(e) => setPickSubjectId(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {subjectOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label || o.name}</option>
              ))}
            </select>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">TT$</span>
              <input
                type="number"
                min={0}
                value={pickPrice}
                onChange={(e) => setPickPrice(e.target.value)}
                placeholder="Rate/hr (optional)"
                className="w-44 rounded-lg border border-border bg-background pl-10 pr-3 py-2 text-sm focus:outline-none focus:border-brand"
              />
            </div>
            <button onClick={addSubject} disabled={addingSubject} className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50">
              {addingSubject ? 'Adding…' : 'Add'}
            </button>
            <button onClick={() => setAddSubjectOpen(false)} className="px-3 py-2 rounded-lg text-sm hover:bg-muted">Cancel</button>
          </div>
        )}
      </SectionShell>

      {/* 4. Availability */}
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

      {/* 5. Rate */}
      <SectionShell done={completion.rate} title="Hourly rate" subtitle="Set your rate per hour (TTD). Applies to all your subjects.">
        {subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground mb-3">Add at least one subject first, then set your rate.</p>
        ) : (
          <>
            {subjects.filter((s) => (s.price_per_hour_ttd ?? 0) > 0).length > 0 && (
              <p className="text-sm text-muted-foreground mb-3">
                Current: {subjects.filter((s) => (s.price_per_hour_ttd ?? 0) > 0).map((s) => `TT$${s.price_per_hour_ttd}/hr (${s.subjects?.label || s.subjects?.name})`).join(', ')}
              </p>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">TTD</span>
                <input
                  type="number"
                  min={0}
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  placeholder="150"
                  className="w-40 rounded-lg border border-border bg-background pl-12 pr-3 py-2 text-sm focus:outline-none focus:border-brand"
                />
              </div>
              <span className="text-sm text-muted-foreground">/ hour</span>
              <button
                onClick={saveRate}
                disabled={savingRate || !rateInput}
                className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50"
              >
                {savingRate ? 'Saving…' : 'Apply to all subjects'}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Average for CSEC tutors in Trinidad: <span className="font-semibold text-ink">TT$120–250 / hr</span></p>
          </>
        )}
      </SectionShell>

      {/* 6. Video provider (optional for now) */}
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
            <button
              onClick={() => { setVideoConnecting(true); window.location.href = '/api/auth/zoom/connect?from=/tutor/get-listed'; }}
              disabled={videoConnecting}
              className="flex items-center gap-3 rounded-xl border border-border p-3 hover:border-brand/60 hover:bg-brand/5 transition text-left disabled:opacity-60"
            >
              <ZoomLogo className="size-9 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-ink">Zoom</div>
                <div className="text-xs text-muted-foreground">Connect your Zoom account</div>
              </div>
            </button>
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
