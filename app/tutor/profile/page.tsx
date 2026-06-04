'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Star, MapPin, Mail, Phone } from 'lucide-react';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import { supabase } from '@/lib/supabase/client';
import TutorShell from '@/components/tutor/TutorShell';

type SubjectInfo = { id: string; name: string; price: number | null };

export default function TutorProfilePage() {
  return (
    <TutorShell>
      <ProfileContent />
    </TutorShell>
  );
}

function ProfileContent() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const completion = useTutorCompletion(profile);
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [stats, setStats] = useState({ avgRating: 0, ratingCount: 0, sessionCount: 0 });

  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [loading, profile, router]);

  useEffect(() => {
    if (!profile?.id) return;
    fetchProfileData(profile.id);
  }, [profile?.id]);

  async function fetchProfileData(tutorId: string) {
    const [{ data: subs }, { data: ratings }, { count: sessions }] = await Promise.all([
      supabase.from('tutor_subjects').select('id, price_per_hour_ttd, subjects(name, label)').eq('tutor_id', tutorId),
      supabase.from('ratings').select('stars').eq('tutor_id', tutorId),
      supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('tutor_id', tutorId).eq('status', 'completed'),
    ]);
    const subList: SubjectInfo[] = (subs ?? []).map((s: any) => ({
      id: s.id,
      name: (Array.isArray(s.subjects) ? s.subjects[0] : s.subjects)?.label || (Array.isArray(s.subjects) ? s.subjects[0] : s.subjects)?.name || 'Subject',
      price: s.price_per_hour_ttd,
    }));
    setSubjects(subList);
    const stars = (ratings ?? []).map((r: any) => r.stars);
    setStats({
      avgRating: stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : 0,
      ratingCount: stars.length,
      sessionCount: sessions ?? 0,
    });
  }

  if (loading || !profile) {
    return <div className="min-h-[400px] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" /></div>;
  }

  const initials = (profile.display_name || profile.full_name || 'T').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  const name = profile.display_name || profile.full_name || profile.email || 'Tutor';

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink">My Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">This is how students see your profile.</p>
        </div>
        <Link href="/tutor/get-listed" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-deep">
          {completion.listed ? 'Edit profile' : 'Complete profile'} <ArrowRight className="size-3.5" />
        </Link>
      </header>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div>
            <div className="text-sm font-semibold text-ink">Profile editor</div>
            <p className="text-xs text-muted-foreground mt-1">All profile fields sync with the Get Listed checklist. Update there to change what students see here.</p>
          </div>
          <Field label="Display name" value={name} />
          <Field label="Email" value={profile.email || '—'} />
          <Field label="Country" value={profile.country || '—'} />
          <Field label="School / Institution" value={profile.school || '—'} />
          <Field label="Bio" value={profile.bio || 'No bio yet'} multiline />
          <Field label="Subjects" value={subjects.length ? subjects.map((s) => s.name).join(', ') : 'None added yet'} multiline />
          <Field label="Hourly rate" value={subjects.find((s) => s.price)?.price ? `From TT$ ${Math.min(...subjects.filter((s) => s.price).map((s) => s.price!))}/hr` : 'Not set'} />
          <div className="text-xs text-muted-foreground pt-2 border-t border-border">
            {completion.listed
              ? 'Your profile is live. Students can find and book you.'
              : `${completion.completed} of ${completion.total} required fields complete. Finish setup to get listed.`}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-card">
          <div className="bg-gradient-to-br from-brand to-brand-deep p-6 text-white">
            <div className="flex items-center gap-4">
              <div className="size-20 rounded-full bg-white/20 grid place-items-center text-2xl font-bold backdrop-blur overflow-hidden">
                {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="size-20 rounded-full object-cover" /> : initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold truncate">{name}</h2>
                  {completion.listed && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20">Listed</span>}
                </div>
                <div className="text-sm text-white/80 mt-1">{subjects[0]?.name ?? 'Tutor'}</div>
                {stats.ratingCount > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-sm">
                    <Star className="size-4 fill-yellow-300 text-yellow-300" />
                    <span className="font-semibold">{stats.avgRating.toFixed(1)}</span>
                    <span className="text-white/70">({stats.ratingCount})</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">Sessions completed</div>
                <div className="font-bold text-ink tabular-nums text-lg">{stats.sessionCount}</div>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">Reviews</div>
                <div className="font-bold text-ink tabular-nums text-lg">{stats.ratingCount}</div>
              </div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground mb-1">Bio</div>
              <p className="text-sm text-ink whitespace-pre-line">{profile.bio || 'No bio yet.'}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 space-y-2 text-sm">
              {profile.country && <div className="flex items-center gap-2"><MapPin className="size-4 text-muted-foreground" /> {profile.country}</div>}
              {profile.email && <div className="flex items-center gap-2"><Mail className="size-4 text-muted-foreground" /> {profile.email}</div>}
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground mb-2">Subjects & rates</div>
              {subjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No subjects added yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {subjects.map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-sm">
                      <span className="font-medium text-ink">{s.name}</span>
                      <span className="text-muted-foreground">{s.price ? `TT$ ${s.price}/hr` : '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`mt-1 text-sm text-ink ${multiline ? 'whitespace-pre-line' : ''}`}>{value}</div>
    </div>
  );
}
