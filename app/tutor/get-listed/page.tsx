'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Circle, Camera, ArrowRight, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import { supabase } from '@/lib/supabase/client';
import TutorShell from '@/components/tutor/TutorShell';

export default function TutorGetListedPage() {
  return (
    <TutorShell>
      <GetListedContent />
    </TutorShell>
  );
}

type SubjectRow = { id: string; subject_id: string; subjects: { name: string; label?: string | null } | null; price_per_hour_ttd: number | null };

function GetListedContent() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const completion = useTutorCompletion(profile);
  const [bio, setBio] = useState('');
  const [savingBio, setSavingBio] = useState(false);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [availabilityCount, setAvailabilityCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [loading, profile, router]);

  useEffect(() => {
    if (profile?.bio) setBio(profile.bio);
  }, [profile?.bio]);

  useEffect(() => {
    if (!profile?.id) return;
    fetchData(profile.id);
  }, [profile?.id, completion.subjects, completion.availability]);

  async function fetchData(tutorId: string) {
    const [{ data: subjs }, { count: avc }] = await Promise.all([
      supabase.from('tutor_subjects').select('id, subject_id, price_per_hour_ttd, subjects(name, label)').eq('tutor_id', tutorId),
      supabase.from('tutor_availability_rules').select('id', { count: 'exact', head: true }).eq('tutor_id', tutorId),
    ]);
    setSubjects((subjs ?? []) as unknown as SubjectRow[]);
    setAvailabilityCount(avc ?? 0);
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
    } finally {
      setSavingBio(false);
    }
  }

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
          Complete all 5 requirements to appear in student search and start booking sessions.
        </p>
      </header>

      <div className="sticky top-14 z-20 -mx-4 lg:mx-0 px-4 lg:px-0 py-3 bg-mint/95 backdrop-blur">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-ink">{completion.completed} of {completion.total} complete</span>
            <span className="text-muted-foreground">{completion.listed ? 'Ready to be listed' : `${completion.total - completion.completed} more to go`}</span>
          </div>
          <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <SectionShell done={completion.avatar} title="Profile picture" subtitle="A clear, friendly headshot helps students trust you.">
        <div className="flex items-center gap-5">
          <div className="size-24 rounded-full bg-muted grid place-items-center overflow-hidden border border-border text-2xl font-semibold text-muted-foreground">
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="size-full object-cover" /> : initials}
          </div>
          <div className="flex-1">
            <input type="file" accept="image/*" ref={fileRef} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatar(f); }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50">
              <Camera className="size-4" /> {uploading ? 'Uploading…' : profile.avatar_url ? 'Replace photo' : 'Upload photo'}
            </button>
            <p className="mt-2 text-xs text-muted-foreground">JPG or PNG, square works best.</p>
          </div>
        </div>
      </SectionShell>

      <SectionShell done={completion.bio} title="About you" subtitle="At least 150 characters describing your teaching style and experience.">
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={5} maxLength={500}
          placeholder="I'm a CSEC Mathematics tutor with 5 years of experience teaching Forms 4 and 5 students. I focus on building strong fundamentals…"
          className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        <div className="mt-2 flex items-center justify-between">
          <div className={cn('text-xs', bio.trim().length >= 150 ? 'text-brand-deep' : 'text-muted-foreground')}>
            {bio.length}/500 · {bio.trim().length >= 150 ? 'Minimum reached' : `${150 - bio.trim().length} more needed`}
          </div>
          <button onClick={saveBio} disabled={savingBio} className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50">
            {savingBio ? 'Saving…' : 'Save bio'}
          </button>
        </div>
      </SectionShell>

      <SectionShell done={completion.subjects} title="Subjects" subtitle="Add at least one subject you teach.">
        {subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subjects added yet.</p>
        ) : (
          <ul className="space-y-2 mb-3">
            {subjects.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40">
                <span className="text-sm font-medium text-ink">{s.subjects?.label || s.subjects?.name || 'Subject'}</span>
                <span className="text-xs text-muted-foreground">{s.price_per_hour_ttd ? `TT$ ${s.price_per_hour_ttd}/hr` : 'No rate set'}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/tutor/dashboard" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep">
          {subjects.length === 0 ? 'Add subjects' : 'Manage subjects'} <ArrowRight className="size-3.5" />
        </Link>
      </SectionShell>

      <SectionShell done={completion.availability} title="Weekly availability" subtitle="Set the hours you're willing to teach.">
        <div className="text-sm text-muted-foreground mb-3">
          {availabilityCount > 0 ? `You have ${availabilityCount} availability rule${availabilityCount === 1 ? '' : 's'} set.` : 'No availability rules set yet.'}
        </div>
        <Link href="/tutor/availability" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep">
          {availabilityCount > 0 ? 'Manage availability' : 'Set availability'} <ArrowRight className="size-3.5" />
        </Link>
      </SectionShell>

      <SectionShell done={completion.rate} title="Hourly rate" subtitle="Set a rate per subject (TTD per hour). Industry average TT$120–250/hr.">
        {subjects.filter((s) => (s.price_per_hour_ttd ?? 0) > 0).length === 0 ? (
          <p className="text-sm text-muted-foreground mb-3">None of your subjects have a rate set yet.</p>
        ) : (
          <p className="text-sm text-muted-foreground mb-3">{subjects.filter((s) => (s.price_per_hour_ttd ?? 0) > 0).length} subject(s) have rates set.</p>
        )}
        <Link href="/tutor/dashboard" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep">
          Set rates per subject <ArrowRight className="size-3.5" />
        </Link>
      </SectionShell>

      {completion.listed && (
        <div className="rounded-2xl border-2 border-brand bg-brand/5 p-6 text-center">
          <div className="text-3xl">🎉</div>
          <h3 className="mt-2 font-bold text-ink text-lg">You're listed!</h3>
          <p className="mt-1 text-sm text-muted-foreground">Students can now find your profile and book sessions with you.</p>
          <Link href="/tutor/dashboard" className="mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-brand text-white font-semibold hover:bg-brand-deep">
            Back to dashboard <ArrowRight className="size-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

function SectionShell({ done, title, subtitle, children }: { done: boolean; title: string; subtitle: string; children: React.ReactNode }) {
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
        <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full', done ? 'bg-brand/15 text-brand-deep' : 'bg-muted text-muted-foreground')}>
          {done ? 'Complete' : 'Incomplete'}
        </span>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
