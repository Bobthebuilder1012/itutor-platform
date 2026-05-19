'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import AvatarUploadModal from '@/components/AvatarUploadModal';
import EditSubjectsModal from '@/components/student/EditSubjectsModal';
import EditProfileModal from '@/components/EditProfileModal';
import type { SessionAttendanceState } from '@/components/student/StudentSessionAttendance';
import { useAvatarUpload } from '@/lib/hooks/useAvatarUpload';
import { Session } from '@/lib/types/database';
import { Area } from '@/lib/utils/imageCrop';
import { getDisplayName } from '@/lib/utils/displayName';
import Link from 'next/link';
import { Clock, Video, Flame, Trophy, ChevronRight, Calendar, CheckCircle2, Settings, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ALL_TOOLS, useStudentStore, type ToolKey } from '@/lib/student-store';

type RecentTutor = {
  tutorId: string;
  name: string;
  avatarUrl: string | null;
  subjectLabel: string;
};

type EnrichedSession = Session & {
  tutor?: { id: string; full_name?: string; display_name?: string; username?: string } | null;
  subject?: { id: string; label?: string; name?: string } | null;
};

function QuickLinksMobile() {
  const { quickLinks, toggleQuickLink } = useStudentStore();
  const [picking, setPicking] = useState(false);
  const pinned = ALL_TOOLS.filter((t) => quickLinks.includes(t.key));
  const available = ALL_TOOLS.filter((t) => !quickLinks.includes(t.key));
  const dense = pinned.length <= 3;

  return (
    <div className="lg:hidden">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="text-sm font-semibold text-ink">My Quick Links</div>
        <button
          onClick={() => setPicking((p) => !p)}
          className="text-xs font-semibold text-brand-deep inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-brand-soft"
        >
          <Plus className="size-3.5" /> {picking ? 'Done' : 'Add'}
        </button>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {pinned.map((t) => (
          <Link
            key={t.key}
            href="/student/tools"
            className="relative flex flex-col items-center gap-1 p-1.5 rounded-2xl bg-background border border-border hover:shadow-card transition"
          >
            <div
              className={cn(dense ? 'size-9' : 'size-11', 'rounded-xl grid place-items-center', dense ? 'text-base' : 'text-xl')}
              style={{ background: `color-mix(in oklab, var(--${t.color}) 35%, white)` }}
            >
              {t.emoji}
            </div>
            <span className="text-[9px] font-medium text-ink text-center leading-tight line-clamp-1">{t.name}</span>
            {picking && (
              <button
                onClick={(e) => { e.preventDefault(); toggleQuickLink(t.key); }}
                className="absolute -top-1 -right-1 size-5 grid place-items-center rounded-full bg-coral text-white shadow"
              >
                <X className="size-3" />
              </button>
            )}
          </Link>
        ))}
        {pinned.length === 0 && (
          <div className="col-span-5 text-xs text-muted-foreground text-center py-3 rounded-2xl border border-dashed border-border">
            Tap Add to pin tools here
          </div>
        )}
      </div>
      {picking && available.length > 0 && (
        <div className="mt-3 p-3 rounded-2xl bg-muted/60">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">Add a quick link</div>
          <div className="grid grid-cols-5 gap-2">
            {available.map((t) => (
              <button
                key={t.key}
                onClick={() => toggleQuickLink(t.key as ToolKey)}
                className="flex flex-col items-center gap-1 p-2 rounded-xl bg-background hover:shadow-sm"
              >
                <span className="text-lg">{t.emoji}</span>
                <span className="text-[10px] text-ink text-center leading-tight">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StudentDashboard() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const testMode = searchParams.get('test') === 'true';
  const [upcomingSessions, setUpcomingSessions] = useState<EnrichedSession[]>([]);
  const [attendanceBySessionId, setAttendanceBySessionId] = useState<Record<string, SessionAttendanceState>>({});
  const [completedSessionsCount, setCompletedSessionsCount] = useState(0);
  const [totalHoursTutored, setTotalHoursTutored] = useState(0);
  const [loadingData, setLoadingData] = useState(true);
  const [recentTutors, setRecentTutors] = useState<RecentTutor[]>([]);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [editSubjectsModalOpen, setEditSubjectsModalOpen] = useState(false);
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false);
  const { uploadAvatar, deleteAvatar, uploading } = useAvatarUpload(profile?.id || '');

  useEffect(() => {
    if (testMode) { setLoadingData(false); return; }
    if (loading) return;
    if (!loading && !profile) { router.push('/login'); return; }
    if (!loading && profile && profile.role !== 'student') { router.push('/login'); return; }
    if (!profile || profile.role !== 'student') return;
    if (profile.billing_mode !== 'parent_required') {
      if (!profile.form_level) { router.push('/signup/complete-role'); return; }
    }
    fetchStudentData();
  }, [profile, loading, router, testMode]);

  async function fetchStudentData() {
    if (!profile) return;
    try {
      const [upcomingRes, completedRes] = await Promise.all([
        supabase.from('sessions').select('*').eq('student_id', profile.id)
          .in('status', ['SCHEDULED', 'JOIN_OPEN']).gte('scheduled_start_at', new Date().toISOString())
          .order('scheduled_start_at', { ascending: true }).limit(5),
        supabase.from('sessions').select('*').eq('student_id', profile.id).eq('status', 'COMPLETED_ASSUMED'),
      ]);

      if (upcomingRes.data && upcomingRes.data.length > 0) {
        const tutorIds = [...new Set(upcomingRes.data.map(s => s.tutor_id).filter(Boolean))];
        const subjectIds = [...new Set(upcomingRes.data.map(s => s.subject_id).filter(Boolean))];
        const [tutorsData, subjectsData] = await Promise.all([
          tutorIds.length > 0 ? supabase.from('profiles').select('id, full_name, display_name, username').in('id', tutorIds) : Promise.resolve({ data: [], error: null }),
          subjectIds.length > 0 ? supabase.from('subjects').select('id, label, name').in('id', subjectIds) : Promise.resolve({ data: [], error: null }),
        ]);
        const enriched = upcomingRes.data.map(session => ({
          ...session,
          tutor: tutorsData.data?.find(t => t.id === session.tutor_id) || null,
          subject: subjectsData.data?.find(s => s.id === session.subject_id) || null,
        }));
        setUpcomingSessions(enriched);
        const sessionIds = enriched.map(s => s.id);
        if (sessionIds.length > 0) {
          const { data: attRows } = await supabase.from('session_student_attendance')
            .select('session_id, status, updated_at').in('session_id', sessionIds);
          const next: Record<string, SessionAttendanceState> = {};
          for (const r of attRows ?? []) {
            const row = r as { session_id: string; status: 'attending' | 'not_attending'; updated_at: string };
            next[row.session_id] = { status: row.status, updatedAt: row.updated_at };
          }
          setAttendanceBySessionId(next);
        }
      } else {
        setUpcomingSessions([]);
        setAttendanceBySessionId({});
      }

      if (completedRes.data) {
        setCompletedSessionsCount(completedRes.data.length);
        const totalMinutes = completedRes.data.reduce((acc, s) => acc + (s.duration_minutes || 0), 0);
        setTotalHoursTutored(Math.round((totalMinutes / 60) * 10) / 10);
      }

      const { data: bookingRows } = await supabase.from('bookings').select('tutor_id, subject_id, updated_at')
        .eq('student_id', profile.id).order('updated_at', { ascending: false }).limit(40);
      const orderedTutorIds: string[] = [];
      const tutorSubject = new Map<string, string>();
      const seenTutors = new Set<string>();
      for (const row of bookingRows ?? []) {
        const tid = row.tutor_id as string;
        if (!tid || seenTutors.has(tid)) continue;
        seenTutors.add(tid);
        orderedTutorIds.push(tid);
        tutorSubject.set(tid, row.subject_id as string);
        if (orderedTutorIds.length >= 6) break;
      }
      if (orderedTutorIds.length > 0) {
        const subjectIds2 = [...new Set([...tutorSubject.values()].filter(Boolean))];
        const [{ data: tutorProfiles }, { data: subjectRows }] = await Promise.all([
          supabase.from('profiles').select('id, full_name, display_name, username, avatar_url').in('id', orderedTutorIds),
          subjectIds2.length ? supabase.from('subjects').select('id, name, label').in('id', subjectIds2) : Promise.resolve({ data: [] as { id: string; name: string; label: string | null }[], error: null }),
        ]);
        const subMap = new Map((subjectRows ?? []).map(s => [s.id, s.label || s.name]));
        const profMap = new Map((tutorProfiles ?? []).map(p => [p.id, p]));
        setRecentTutors(orderedTutorIds.map(tid => {
          const p = profMap.get(tid);
          const sid = tutorSubject.get(tid);
          return { tutorId: tid, name: p ? getDisplayName(p) : 'Tutor', avatarUrl: p?.avatar_url ?? null, subjectLabel: sid ? subMap.get(sid) || 'Subject' : 'Subject' };
        }));
      }
    } catch (error) {
      console.error('Error fetching student data:', error);
    } finally {
      setLoadingData(false);
    }
  }

  const handleAvatarUpload = async (imageSrc: string, croppedArea: Area) => {
    if (!profile) return;
    const result = await uploadAvatar(imageSrc, croppedArea);
    if (result.success) window.location.reload();
  };

  const handleRemoveAvatar = async () => {
    if (!profile) return;
    const result = await deleteAvatar();
    if (!result.success) throw new Error(result.error || 'Failed to remove photo');
    setAvatarModalOpen(false);
    window.location.reload();
  };

  if (!testMode && (loading || !profile)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
      </div>
    );
  }

  const greetingName = profile?.display_name || profile?.full_name?.split(' ')[0] || 'there';
  const fullName = profile ? getDisplayName(profile) : 'Student';
  const userInitials = fullName.slice(0, 2).toUpperCase();
  const nextSession = upcomingSessions[0];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Mobile profile card */}
      <button
        onClick={() => setEditProfileModalOpen(true)}
        className="lg:hidden w-full flex items-center gap-3 rounded-2xl bg-background border border-border p-3 shadow-sm hover:shadow-card transition text-left"
      >
        <div className="size-12 rounded-full bg-gradient-to-br from-coral to-peach grid place-items-center text-white font-semibold shadow-sm flex-shrink-0">
          {userInitials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink truncate">{fullName}</div>
          <div className="text-xs text-muted-foreground truncate">{profile?.form_level || 'Student'} · View profile</div>
        </div>
        <Settings className="size-4 text-muted-foreground" />
      </button>

      {/* Greeting */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink">Hey {greetingName} 👋</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {completedSessionsCount > 0
              ? `You've completed ${completedSessionsCount} session${completedSessionsCount !== 1 ? 's' : ''}. Keep going!`
              : "Welcome to iTutor! Find a tutor to get started."}
          </p>
        </div>
        {completedSessionsCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-coral-soft text-coral text-sm font-semibold">
            <Flame className="size-4" /> {completedSessionsCount} sessions completed
          </div>
        )}
      </div>

      {/* Next session hero */}
      {nextSession && (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-deep p-6 lg:p-8 text-white shadow-pop">
          <div className="absolute -right-12 -top-12 size-56 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-col lg:flex-row lg:items-center gap-6">
            <div className="flex-1">
              <div className="text-xs uppercase tracking-wider text-white/70 font-semibold">Next lesson</div>
              <h2 className="text-xl lg:text-2xl font-bold mt-1">
                {nextSession.subject?.label || nextSession.subject?.name || 'Session'}
              </h2>
              <div className="flex items-center gap-3 text-sm text-white/85 mt-2">
                {nextSession.tutor && (
                  <div className="flex items-center gap-2">
                    <div className="size-7 rounded-full bg-white/20 grid place-items-center text-xs font-semibold">
                      {getDisplayName(nextSession.tutor).slice(0, 2).toUpperCase()}
                    </div>
                    {getDisplayName(nextSession.tutor)}
                  </div>
                )}
                {nextSession.tutor && <span className="text-white/40">•</span>}
                <Clock className="size-3.5" />
                {new Date(nextSession.scheduled_start_at).toLocaleString('en', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </div>
            </div>
            <div className="flex gap-2">
              {nextSession.status === 'JOIN_OPEN' && (
                <button className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white text-forest font-semibold hover:bg-white/90 transition">
                  <Video className="size-4" /> Join lesson
                </button>
              )}
              <Link href="/student/bookings" className="px-4 py-3 rounded-2xl bg-white/15 text-white font-semibold hover:bg-white/25 transition">
                View bookings
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Mobile quick links */}
      <QuickLinksMobile />

      {/* Stat strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Sessions this week', value: upcomingSessions.length.toString(), icon: Calendar, tint: 'bg-sky/40' },
          { label: 'Hours studied', value: totalHoursTutored.toString(), icon: Clock, tint: 'bg-lavender/60' },
          { label: 'Completed sessions', value: completedSessionsCount.toString(), icon: Trophy, tint: 'bg-peach/60' },
          { label: 'Subjects studying', value: (profile?.subjects_of_study?.length || 0).toString(), icon: CheckCircle2, tint: 'bg-brand-soft' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl bg-background border border-border p-4">
            <div className={cn('size-9 rounded-xl grid place-items-center mb-2', s.tint)}>
              <s.icon className="size-4 text-forest" />
            </div>
            <div className="text-2xl font-bold text-ink">{loadingData ? '–' : s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Upcoming sessions */}
        <div className="lg:col-span-2 rounded-3xl bg-background border border-border p-5 lg:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-ink">Upcoming lessons</h3>
            <Link href="/student/bookings" className="text-sm text-brand-deep font-medium inline-flex items-center gap-1 hover:underline">
              See all <ChevronRight className="size-4" />
            </Link>
          </div>
          {loadingData ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : upcomingSessions.length === 0 ? (
            <div className="text-center py-10">
              <div className="size-14 mx-auto rounded-2xl bg-brand-soft grid place-items-center mb-3">
                <Calendar className="size-6 text-brand-deep" />
              </div>
              <p className="font-semibold text-ink">No upcoming lessons</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">Book a session with a tutor to get started.</p>
              <Link href="/student/find-tutors" className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep transition">
                Find a tutor
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingSessions.slice(0, 3).map((s) => {
                const startDate = new Date(s.scheduled_start_at);
                const tutorName = s.tutor ? getDisplayName(s.tutor) : 'Tutor';
                const subjectName = s.subject?.label || s.subject?.name || 'Session';
                const tints = ['bg-sky/50', 'bg-lavender/60', 'bg-brand-soft'];
                const idx = upcomingSessions.indexOf(s);
                return (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-muted/60 transition cursor-pointer">
                    <div className={cn('size-12 rounded-xl grid place-items-center flex-shrink-0', tints[idx % 3])}>
                      <div className="text-center leading-none">
                        <div className="text-[10px] font-semibold text-forest/70 uppercase">{startDate.toLocaleDateString('en', { weekday: 'short' })}</div>
                        <div className="text-base font-bold text-forest">{startDate.getDate()}</div>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-ink truncate">{subjectName}</div>
                      <div className="text-xs text-muted-foreground">{tutorName} · {startDate.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}</div>
                    </div>
                    <Link href="/student/bookings" className="text-xs font-semibold text-brand-deep px-3 py-1.5 rounded-full hover:bg-brand-soft">
                      Details
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent tutors / quick actions */}
        <div className="rounded-3xl bg-background border border-border p-5 lg:p-6">
          <h3 className="font-semibold text-ink mb-4">
            {recentTutors.length > 0 ? 'Recent tutors' : 'Get started'}
          </h3>
          {loadingData ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : recentTutors.length > 0 ? (
            <div className="space-y-2">
              {recentTutors.slice(0, 4).map((t) => (
                <button
                  key={t.tutorId}
                  onClick={() => router.push(`/student/tutors/${t.tutorId}`)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted transition text-left"
                >
                  {t.avatarUrl ? (
                    <img src={t.avatarUrl} alt="" className="size-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="size-9 rounded-full bg-brand-soft grid place-items-center text-forest font-semibold text-sm flex-shrink-0">
                      {t.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-ink truncate">{t.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.subjectLabel}</div>
                  </div>
                  <span className="text-xs text-brand-deep font-medium">Book →</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <Link href="/student/find-tutors" className="flex items-center gap-3 p-3 rounded-2xl bg-brand-soft hover:bg-mint-deep transition">
                <div className="size-9 rounded-xl bg-brand grid place-items-center">
                  <span className="text-white text-lg">🔍</span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-ink">Find a tutor</div>
                  <div className="text-xs text-muted-foreground">Browse verified tutors</div>
                </div>
              </Link>
              <button
                onClick={() => setEditSubjectsModalOpen(true)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-muted transition text-left"
              >
                <div className="size-9 rounded-xl bg-lavender grid place-items-center">
                  <span className="text-lg">📚</span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-ink">Add subjects</div>
                  <div className="text-xs text-muted-foreground">Tell us what you study</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>


      {/* Modals */}
      <AvatarUploadModal
        isOpen={avatarModalOpen}
        onClose={() => setAvatarModalOpen(false)}
        onUpload={handleAvatarUpload}
        uploading={uploading}
        hasAvatar={Boolean(profile?.avatar_url)}
        onRemovePhoto={!testMode && profile ? handleRemoveAvatar : undefined}
      />
      {!testMode && profile && (
        <>
          <EditSubjectsModal
            isOpen={editSubjectsModalOpen}
            onClose={() => setEditSubjectsModalOpen(false)}
            currentSubjects={profile.subjects_of_study || []}
            userId={profile.id}
            onSuccess={() => window.location.reload()}
          />
          <EditProfileModal
            isOpen={editProfileModalOpen}
            onClose={() => setEditProfileModalOpen(false)}
            profile={profile}
            onSuccess={() => window.location.reload()}
          />
        </>
      )}
    </div>
  );
}
