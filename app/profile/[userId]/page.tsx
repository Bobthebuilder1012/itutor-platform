'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { getDisplayName } from '@/lib/utils/displayName';
import { getAvatarColor } from '@/lib/utils/avatarColors';
import { useProfile } from '@/lib/hooks/useProfile';
import RatingComment from '@/components/tutor/RatingComment';
import { getOrCreateConversation } from '@/lib/services/notificationService';

type ProfileSnapshot = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  role: string | null;
  bio: string | null;
  school?: string | null;
  institution_id?: string | null;
};

type RatingWithStudent = {
  id: string;
  stars: number;
  comment: string | null;
  created_at: string;
  student_name: string;
  helpful_count: number;
};

const ROLE_LABEL: Record<string, string> = {
  student: 'Student',
  tutor: 'iTutor',
  parent: 'Parent',
  reviewer: 'Reviewer',
  admin: 'Admin',
};

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;
  const { profile: currentUser, loading: currentLoading } = useProfile();
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [completedSessions, setCompletedSessions] = useState<number>(0);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [ratings, setRatings] = useState<RatingWithStudent[]>([]);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [messageRequestLoading, setMessageRequestLoading] = useState(false);

  useEffect(() => {
    if (!currentLoading && !currentUser) {
      router.push('/login');
      return;
    }
  }, [currentUser, currentLoading, router]);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    (async () => {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, display_name, username, avatar_url, role, bio, school, institution_id')
        .eq('id', userId)
        .single();

      if (cancelled) return;
      if (profileError || !profileData) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const prof = profileData as ProfileSnapshot;
      setProfile(prof);

      let school: string | null = prof.school ?? null;
      if (!school && prof.institution_id) {
        const { data: inst } = await supabase.from('institutions').select('name').eq('id', prof.institution_id).single();
        if (inst?.name) school = inst.name;
      }
      setSchoolName(school);

      const viewedRole = (prof.role ?? '').toLowerCase();
      const isTutor = viewedRole === 'tutor';
      const sessionsColumn = isTutor ? 'tutor_id' : 'student_id';

      const { count, error: sessionsError } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .eq(sessionsColumn, userId)
        .eq('status', 'COMPLETED_ASSUMED');

      if (!cancelled && !sessionsError && count !== null) {
        setCompletedSessions(count);
      }

      const viewerRole = (currentUser?.role ?? '').toLowerCase();
      if (viewerRole === 'tutor' && isTutor) {
        const { data: ratingsData, error: ratingsError } = await supabase
          .from('ratings')
          .select('id, stars, comment, created_at, student_id, helpful_count')
          .eq('tutor_id', userId)
          .not('comment', 'is', null)
          .order('helpful_count', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false });

        if (!cancelled && !ratingsError && ratingsData?.length) {
          const studentIds = [...new Set(ratingsData.map((r) => r.student_id))];
          const { data: students } = await supabase
            .from('profiles')
            .select('id, full_name, username, display_name')
            .in('id', studentIds);
          const studentsMap = new Map((students ?? []).map((s) => [s.id, s]));

          const withNames: RatingWithStudent[] = ratingsData.map((r) => {
            const student = studentsMap.get(r.student_id);
            return {
              id: r.id,
              stars: r.stars,
              comment: r.comment,
              created_at: r.created_at,
              student_name: student ? getDisplayName(student as { full_name?: string; username?: string; display_name?: string }) : 'Anonymous',
              helpful_count: r.helpful_count ?? 0,
            };
          });
          setRatings(withNames);
          const avg = withNames.reduce((s, r) => s + r.stars, 0) / withNames.length;
          setAverageRating(avg);
        }
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, currentUser?.role]);

  if (currentLoading || !currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-itutor-green" />
      </div>
    );
  }

  const role = (currentUser.role as 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin') ?? 'student';
  const displayName = currentUser.display_name || currentUser.full_name || currentUser.username || 'User';

  if (loading) {
    return (
      <DashboardLayout role={role} userName={displayName}>
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-itutor-green" />
        </div>
      </DashboardLayout>
    );
  }

  if (!profile) {
    return (
      <DashboardLayout role={role} userName={displayName}>
        <div className="max-w-lg mx-auto px-4 py-8 text-center">
          <p className="text-gray-600 mb-4">Profile not found.</p>
          <Link href="/communities" className="text-itutor-green hover:underline">
            Back to communities
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const name = getDisplayName(profile as { full_name?: string; username?: string; display_name?: string });
  const initial = name.charAt(0).toUpperCase() || '?';
  const roleLabel = (profile.role && ROLE_LABEL[profile.role]) || profile.role || 'Member';
  const showImg = profile.avatar_url && !avatarFailed;
  const isTutorViewingTutor = role === 'tutor' && (profile.role ?? '').toLowerCase() === 'tutor';
  const isStudentViewingStudent =
    role === 'student' &&
    (profile.role ?? '').toLowerCase() === 'student' &&
    currentUser?.id !== userId;

  const handleSendMessageRequest = async () => {
    if (!currentUser?.id || messageRequestLoading) return;
    setMessageRequestLoading(true);
    try {
      const conversationId = await getOrCreateConversation(currentUser.id, userId);
      router.push(`/student/messages/${conversationId}`);
    } catch (err) {
      console.error('Error starting conversation:', err);
      alert('Could not start conversation. Please try again.');
    } finally {
      setMessageRequestLoading(false);
    }
  };

  return (
    <DashboardLayout role={role} userName={displayName}>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            <div
              className={`h-24 w-24 flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center ${
                showImg ? 'bg-gray-100' : `bg-gradient-to-br ${getAvatarColor(profile.id)}`
              }`}
            >
              {showImg ? (
                <Image
                  src={profile.avatar_url!}
                  alt=""
                  width={96}
                  height={96}
                  className="h-24 w-24 object-cover"
                  unoptimized={profile.avatar_url?.includes('supabase')}
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <span className="text-3xl font-bold text-white">{initial}</span>
              )}
            </div>
            <div className="text-center sm:text-left flex-1 min-w-0">
              <h1 className="text-xl font-semibold text-gray-900 truncate">{name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{roleLabel}</p>
              {schoolName && (
                <p className="text-sm text-gray-600 mt-1 flex items-center gap-1.5 justify-center sm:justify-start">
                  <svg className="w-4 h-4 text-itutor-green flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  {schoolName}
                </p>
              )}
              <p className="text-sm text-gray-600 mt-1">
                {completedSessions} completed {completedSessions === 1 ? 'session' : 'sessions'}
              </p>
            </div>
          </div>

          {isStudentViewingStudent && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={handleSendMessageRequest}
                disabled={messageRequestLoading}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-itutor-green text-white font-medium text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {messageRequestLoading ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Opening chat…
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    Send message
                  </>
                )}
              </button>
            </div>
          )}

          {profile.bio && profile.bio.trim() && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Description</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{profile.bio.trim()}</p>
            </div>
          )}

          {isTutorViewingTutor && (averageRating !== null || ratings.length > 0) && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Rating &amp; reviews</h3>
              {averageRating !== null && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg font-semibold text-gray-900">
                    {averageRating.toFixed(1)}
                  </span>
                  <div className="flex text-amber-500 text-sm">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span key={star}>{star <= Math.round(averageRating) ? '★' : '☆'}</span>
                    ))}
                  </div>
                  <span className="text-sm text-gray-500">
                    ({ratings.length} {ratings.length === 1 ? 'review' : 'reviews'})
                  </span>
                </div>
              )}
              <div className="space-y-3">
                {ratings.map((r) => (
                  <RatingComment key={r.id} rating={r} />
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-center">
          <Link href="/communities" className="text-sm text-itutor-green hover:underline">
            ← Back to communities
          </Link>
        </p>
      </div>
    </DashboardLayout>
  );
}
