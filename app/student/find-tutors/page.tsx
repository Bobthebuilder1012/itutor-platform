// @ts-nocheck
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/utils/displayName';
import VerifiedBadge from '@/components/VerifiedBadge';
import UserAvatar from '@/components/UserAvatar';
import { cn } from '@/lib/utils';
import { Search, Star, Clock, SlidersHorizontal, Users, GraduationCap, Flame, X, Check, Video, Sparkles, BadgeCheck, MessageSquare, TrendingUp, Play } from 'lucide-react';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import {
  parseScheduleData,
  scheduleToCompact,
  scheduleMatchesDayTime,
  DAY_FILTER_OPTIONS,
  TIME_BANDS,
  type ScheduleEntry,
  type TimeBand,
} from '@/lib/utils/scheduleFormat';
import { formatLevel } from '@/lib/utils/formatLevel';

type Tutor = {
  id: string;
  full_name: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  profile_banner_url?: string | null;
  updated_at?: string;
  school?: string | null;
  institution_id?: string | null;
  institution_name?: string | null;
  country: string;
  bio: string | null;
  tutor_verification_status: string | null;
  subjects: Array<{
    id: string;
    name: string;
    curriculum: string;
    level: string;
    price_per_hour_ttd: number;
  }>;
  average_rating: number | null;
  total_reviews: number;
  topComment: {
    comment: string;
    stars: number;
    student_name: string;
  } | null;
};

type Institution = {
  id: string;
  name: string;
};

type GroupLesson = {
  id: string;
  title: string;
  tutor: string;
  tutorId: string;
  tutorHue: number;
  subject: string;
  level: string;
  /** Recurring schedule line, or '' when the class has no recurring schedule. */
  day: string;
  time: string;
  /** True when `day` is a compact line that already includes the time range. */
  hasCompactSchedule: boolean;
  /** Structured weekly pattern — drives the day / time-of-day filters. */
  scheduleEntries: ScheduleEntry[];
  monthlyPrice: number;
  seats: { taken: number; total: number | null };
  sessionLength: number | null;
  rating: number;
  tags: string[];
  color: string;
  description?: string | null;
  coverImage?: string | null;
  requireJoinRequests?: boolean;
  feedbackMode?: string | null;
  parentFeedbackPrice?: number | null;
  activePromotion?: { id: string; kind: string; discount: number; student_cap: number | null; duration_days: number | null } | null;
};

function promoLabel(promo: { kind: string; discount: number; student_cap: number | null; duration_days: number | null; created_at?: string; used_count?: number }): string {
  if (promo.kind === 'early-bird' && promo.student_cap) {
    const remaining = promo.student_cap - (promo.used_count ?? 0);
    return `Next ${remaining} student${remaining !== 1 ? 's' : ''} get ${promo.discount}% off`;
  }
  if (promo.kind === 'time-limited' && promo.duration_days && promo.created_at) {
    const exp = new Date(promo.created_at);
    exp.setDate(exp.getDate() + promo.duration_days);
    const daysLeft = Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 86400000));
    return `${promo.discount}% off · ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`;
  }
  return `${promo.discount}% off`;
}

function formatDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function formatHHMM(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

const SUBJECT_CHIPS = ['All', 'Maths', 'English', 'Physics', 'Chemistry', 'Biology', 'SEA'];

function TutorInitialAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '').split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      className="inline-flex items-center justify-center rounded-full font-semibold shrink-0 bg-brand-soft text-forest"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

// Map a stored country (ISO2 code or full name) to a flag emoji for the card.
// Returns '' when we can't confidently resolve one — never a fabricated flag.
function countryToFlag(country?: string | null): string {
  if (!country) return '';
  const c = country.trim();
  if (/^[A-Za-z]{2}$/.test(c)) {
    return c.toUpperCase().replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
  }
  const MAP: Record<string, string> = {
    'trinidad and tobago': '🇹🇹', 'trinidad & tobago': '🇹🇹', 'trinidad': '🇹🇹',
    'jamaica': '🇯🇲', 'guyana': '🇬🇾', 'barbados': '🇧🇧', 'grenada': '🇬🇩',
    'saint lucia': '🇱🇨', 'st. lucia': '🇱🇨', 'st lucia': '🇱🇨', 'dominica': '🇩🇲',
    'saint vincent and the grenadines': '🇻🇨', 'antigua and barbuda': '🇦🇬',
    'the bahamas': '🇧🇸', 'bahamas': '🇧🇸', 'suriname': '🇸🇷', 'belize': '🇧🇿',
    'united states': '🇺🇸', 'united kingdom': '🇬🇧', 'canada': '🇨🇦',
  };
  return MAP[c.toLowerCase()] ?? '';
}

export default function FindTutorsPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [loadingTutors, setLoadingTutors] = useState(true);
  // Real per-tutor stats (lessons taught, students taught, recent bookings),
  // aggregated server-side (service role) so counts are RLS-correct.
  const [tutorStats, setTutorStats] = useState<Record<string, { lessonsTaught: number; studentsTaught: number; recentBookings: number }>>({});
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [priceMin, setPriceMin] = useState<string>('');
  const [priceMax, setPriceMax] = useState<string>('');
  const [selectedSchool, setSelectedSchool] = useState<string>('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<'relevance' | 'price_low' | 'rating_high'>('relevance');
  const [tab, setTab] = useState<'lessons' | 'tutors'>('lessons');
  const [activeChip, setActiveChip] = useState('All');
  // Day / time-of-day narrowing for group lessons. Both multi-select; a lesson
  // matches when one of its recurring sessions satisfies every active filter.
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [selectedBands, setSelectedBands] = useState<TimeBand[]>([]);
  const [groupLessons, setGroupLessons] = useState<GroupLesson[]>([]);
  const [loadingGroupLessons, setLoadingGroupLessons] = useState(true);
  const [enrolledLessonIds, setEnrolledLessonIds] = useState<Set<string>>(new Set());
  const [joiningLesson, setJoiningLesson] = useState(false);
  const [joinLesson, setJoinLesson] = useState<GroupLesson | null>(null);
  const TUTORS_PER_PAGE = 12;

  useEffect(() => {
    if (loading) return;
    
    if (!profile || profile.role !== 'student') {
      router.push('/login');
      return;
    }

    fetchTutors();
    fetchGroupLessons();
  }, [profile, loading, router]);

  async function fetchTutors() {
    setLoadingTutors(true);
    try {
      console.log('=== STARTING TUTOR FETCH ===');
      
      // Fetch all institutions for the filter dropdown
      let institutionsData: Institution[] = [];
      try {
        const { data, error: institutionsError } = await supabase
          .from('institutions')
          .select('id, name')
          .order('name');

        if (institutionsError) {
          console.error('❌ Error fetching institutions:', institutionsError);
        } else {
          institutionsData = data || [];
          setInstitutions(institutionsData);
          console.log('✅ Fetched institutions:', institutionsData.length);
        }
      } catch (err) {
        console.error('❌ Exception fetching institutions:', err);
      }
      
      const tutorSelectTiers = [
        'id, full_name, username, display_name, avatar_url, profile_banner_url, updated_at, institution_id, country, bio, tutor_verification_status, teaching_mode, tutor_type',
        'id, full_name, username, display_name, avatar_url, updated_at, institution_id, country, bio, tutor_verification_status, teaching_mode, tutor_type',
        'id, full_name, username, display_name, avatar_url, country, bio, tutor_verification_status, teaching_mode, tutor_type',
        'id, full_name, username, display_name, avatar_url, country, bio, tutor_verification_status',
        'id, full_name, username, display_name, country, bio, tutor_verification_status',
        'id, full_name, country, bio, tutor_verification_status',
        'id, full_name, country, tutor_verification_status',
        'id, full_name',
      ];

      let tutorProfiles: Record<string, unknown>[] | null = null;
      let profilesError: { message: string; code?: string; details?: string } | null = null;
      for (const cols of tutorSelectTiers) {
        const res = await supabase.from('profiles').select(cols).eq('role', 'tutor').or('pause_1on1.is.null,pause_1on1.eq.false');
        if (!res.error) {
          tutorProfiles = (res.data ?? []) as unknown as Record<string, unknown>[];
          profilesError = null;
          break;
        }
        profilesError = res.error;
        console.warn('find-tutors profiles select retry:', cols, res.error.message);
      }

      if (profilesError || !tutorProfiles) {
        console.error('❌ Error fetching tutor profiles:', JSON.stringify(profilesError));
        alert(`Error loading tutors: ${profilesError?.message ?? 'Unknown error'}`);
        throw profilesError ?? new Error('No tutor profiles');
      }

      // Final ordering is applied after we know the listed set, using the
      // marketplace ranking view (mig 190). Verification-status order is kept
      // only as a fallback below if that view isn't available yet.
      const tutorProfilesWithBanners = tutorProfiles as Array<Record<string, unknown> & { id: string }>;

      // Fetch listed tutor IDs from server API (bypasses RLS on protected tables)
      const listedRes = await fetch('/api/tutors/listed-ids', { cache: 'no-store' });
      const listedJson = listedRes.ok ? await listedRes.json() : { ids: [] };
      const listedSet = new Set<string>(listedJson.ids ?? []);

      const activeTutorProfiles = tutorProfilesWithBanners.filter(t => listedSet.has(t.id));
      const activeTutorIds = activeTutorProfiles.map((t) => t.id);

      console.log(`✅ Showing ${activeTutorProfiles.length} listed tutors (of ${tutorProfilesWithBanners.length} total)`);

      // Marketplace ordering (mig 190): pinned tutors first in pin order,
      // then everyone else by ranking_score desc. Falls back to
      // verification-status order if the ranking view isn't present yet.
      try {
        const { data: rankRows, error: rankErr } = activeTutorIds.length > 0
          ? await supabase
              .from('tutor_marketplace_rankings')
              .select('tutor_id, pin_rank, ranking_score')
              .in('tutor_id', activeTutorIds)
          : { data: [] as any[], error: null };
        if (rankErr) throw rankErr;
        const rankMap = new Map<string, { pin: number | null; score: number }>();
        (rankRows ?? []).forEach((r: any) =>
          rankMap.set(r.tutor_id, { pin: r.pin_rank ?? null, score: Number(r.ranking_score ?? 0) })
        );
        activeTutorProfiles.sort((a, b) => {
          const ra = rankMap.get(a.id) ?? { pin: null, score: 0 };
          const rb = rankMap.get(b.id) ?? { pin: null, score: 0 };
          if (ra.pin != null || rb.pin != null) {
            if (ra.pin == null) return 1;
            if (rb.pin == null) return -1;
            if (ra.pin !== rb.pin) return ra.pin - rb.pin;
          }
          return rb.score - ra.score;
        });
      } catch {
        const verificationRank: Record<string, number> = { VERIFIED: 0, PENDING: 1, PROCESSING: 2, UNVERIFIED: 3, REJECTED: 4 };
        activeTutorProfiles.sort(
          (a, b) =>
            (verificationRank[String((a as any).tutor_verification_status ?? 'UNVERIFIED')] ?? 9) -
            (verificationRank[String((b as any).tutor_verification_status ?? 'UNVERIFIED')] ?? 9)
        );
      }

      // Fetch subjects for all tutor profiles
      const { data: tutorSubjects, error: subjectsError } =
        activeTutorIds.length > 0
          ? await supabase
              .from('tutor_subjects')
              .select('tutor_id, price_per_hour_ttd, subject_id')
              .in('tutor_id', activeTutorIds)
          : { data: [], error: null };

      if (subjectsError) {
        console.error('❌ Error fetching tutor subjects:', subjectsError);
        alert(`Error loading tutor subjects: ${subjectsError.message}`);
        throw subjectsError;
      }

      console.log('✅ Fetched tutor subjects:', tutorSubjects?.length || 0);

      // Fetch all subjects separately
      const { data: allSubjectsData, error: allSubjectsError } = await supabase
        .from('subjects')
        .select('id, name, label, curriculum, level');

      if (allSubjectsError) {
        console.error('Error fetching subjects:', allSubjectsError);
        throw allSubjectsError;
      }

      console.log('Fetched subjects:', allSubjectsData?.length || 0);

      // Create a map for quick subject lookup
      const subjectsMap = new Map(allSubjectsData.map((s) => [s.id, s]));

      // Create a map for quick institution lookup
      const institutionsMap = new Map<string, string>();
      institutionsData.forEach((inst) => {
        institutionsMap.set(inst.id, inst.name);
      });

      // Fetch ratings only for these tutors
      const ratingsQuery =
        activeTutorIds.length > 0
          ? supabase.from('ratings').select('tutor_id, stars').in('tutor_id', activeTutorIds)
          : Promise.resolve({ data: [] as { tutor_id: string; stars: number }[], error: null });

      const commentsQuery =
        activeTutorIds.length > 0
          ? supabase
              .from('ratings')
              .select(
                `tutor_id, stars, comment, helpful_count, student:student_id (display_name, full_name, username)`
              )
              .in('tutor_id', activeTutorIds)
              .not('comment', 'is', null)
              .order('helpful_count', { ascending: false })
              .order('stars', { ascending: false })
          : Promise.resolve({ data: [] as any[], error: null });

      const [{ data: allRatings, error: allRatingsError }, { data: ratingsWithComments, error: commentsError }] =
        await Promise.all([ratingsQuery, commentsQuery]);

      if (allRatingsError) throw allRatingsError;
      if (commentsError) throw commentsError;

      // Process data - manually join tutor_subjects with subjects
      const tutorsWithData: Tutor[] = activeTutorProfiles.map(tutor => {
        const subjects = tutorSubjects
          .filter(ts => ts.tutor_id === tutor.id)
          .map(ts => {
            const subject = subjectsMap.get(ts.subject_id);
            if (!subject) {
              console.warn(`Subject not found for id: ${ts.subject_id}`);
              return null;
            }
            
            return {
              id: subject.id,
              name: subject.label || subject.name, // Use label for display
              curriculum: subject.curriculum || subject.level || '', // Try curriculum first, then level
              level: subject.level || '',
              price_per_hour_ttd: ts.price_per_hour_ttd
            };
          })
          .filter((s): s is NonNullable<typeof s> => s !== null);
        
        console.log(`Tutor ${tutor.username || tutor.full_name}: ${subjects.length} subjects`);

        const tutorRatings = allRatings.filter(r => r.tutor_id === tutor.id);
        const avgRating = tutorRatings.length > 0
          ? tutorRatings.reduce((sum, r) => sum + r.stars, 0) / tutorRatings.length
          : null;

        // Find top comment (highest stars, prefer 5 stars)
        const tutorComments = ratingsWithComments.filter(r => r.tutor_id === tutor.id);
        const topComment = tutorComments.length > 0 ? tutorComments[0] : null;

        return {
          ...tutor,
          institution_name: tutor.institution_id ? institutionsMap.get(tutor.institution_id) : null,
          subjects,
          average_rating: avgRating,
          total_reviews: tutorRatings.length,
          topComment: topComment ? {
            comment: topComment.comment,
            stars: topComment.stars,
            student_name: (topComment.student as any)?.display_name || (topComment.student as any)?.full_name || (topComment.student as any)?.username || 'Anonymous'
          } : null
        };
      });

      // Only require at least one subject to be listed
      const tutorsWithSubjects = tutorsWithData.filter(t => t.subjects.length > 0);

      console.log('=== TUTOR LOADING SUMMARY ===');
      console.log('Total tutor profiles:', activeTutorProfiles?.length || 0);
      console.log('Tutors with subjects:', tutorsWithSubjects.length);

      setTutors(tutorsWithSubjects);

      // Real marketplace stats (lessons taught, students taught, recent bookings).
      const statIds = tutorsWithSubjects.map((t) => t.id);
      if (statIds.length > 0) {
        fetch('/api/public/tutors/stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tutorIds: statIds }),
        })
          .then((r) => (r.ok ? r.json() : { byTutorId: {} }))
          .then((j) => setTutorStats(j.byTutorId ?? {}))
          .catch(() => {});
      }
    } catch (error) {
      console.error('Error fetching tutors:', error);
    } finally {
      setLoadingTutors(false);
    }
  }

  const SUBJECT_STYLE: Record<string, { color: string }> = {
    math: { color: 'from-coral to-peach' },
    physics: { color: 'from-sky to-lavender' },
    chemistry: { color: 'from-brand-deep to-forest' },
    biology: { color: 'from-brand to-brand-deep' },
    english: { color: 'from-lavender to-brand-soft' },
    history: { color: 'from-peach to-coral' },
    economics: { color: 'from-peach to-coral' },
    information: { color: 'from-sky to-lavender' },
    spanish: { color: 'from-coral to-peach' },
    french: { color: 'from-sky to-lavender' },
    sea: { color: 'from-brand to-brand-deep' },
    accounting: { color: 'from-peach to-coral' },
  };

  function getSubjectStyle(subject: string) {
    const lower = (subject || '').toLowerCase();
    for (const [key, val] of Object.entries(SUBJECT_STYLE)) {
      if (lower.includes(key)) return val;
    }
    return { color: 'from-brand to-brand-deep' };
  }

  async function fetchGroupLessons() {
    setLoadingGroupLessons(true);
    try {
      if (!profile?.id) return;

      // Query groups directly — avoids API column-schema issues
      let groups: any[] | null = null;

      const { data: g1, error: e1 } = await supabase
        .from('groups')
        .select('*')
        .is('archived_at', null)
        .or('visibility.neq.private,visibility.is.null')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!e1) {
        groups = g1;
      } else {
        // Fallback: visibility column may not exist — fetch all non-archived
        const { data: g2, error: e2 } = await supabase
          .from('groups')
          .select('*')
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .limit(50);
        if (e2) throw e2;
        groups = g2;
      }

      if (!groups?.length) { setGroupLessons([]); return; }

      const groupIds = groups.map((g: any) => g.id);
      const tutorIds = [...new Set<string>(groups.map((g: any) => g.tutor_id).filter(Boolean))];

      // Fetch tutor names, enrollment status, and server-side member counts in parallel
      const [{ data: tutorProfiles }, { data: memberRows }, { data: subEnrollments }, countsRes] = await Promise.all([
        tutorIds.length
          ? supabase.from('profiles').select('id, full_name, display_name, is_dev_account').in('id', tutorIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('group_members').select('group_id, user_id, status').in('group_id', groupIds),
        supabase
          .from('group_enrollments')
          .select('group_id')
          .eq('student_id', profile.id)
          .in('group_id', groupIds)
          .in('status', ['ACTIVE', 'GRACE', 'SUSPENDED', 'PENDING_PAYMENT']),
        fetch(`/api/groups/member-counts?ids=${groupIds.join(',')}`).then((r) => r.json()).catch(() => ({ counts: {} })),
      ]);

      // Remove groups owned by dev-account tutors — but dev-account viewers
      // (test/QA students) still see them, mirroring the viewer is_dev_account
      // gates in /api/groups, /api/tutors/listed-ids and the tutor profile page.
      const viewerIsDev = profile?.is_dev_account === true;
      const devTutorIdSet = new Set((tutorProfiles ?? []).filter((p: any) => p.is_dev_account).map((p: any) => p.id));
      if (!viewerIsDev && devTutorIdSet.size > 0) groups = groups.filter((g: any) => !devTutorIdSet.has(g.tutor_id));

      const tutorMap = new Map((tutorProfiles ?? []).map((p: any) => [p.id, p]));
      // Server-side counts (service role, accurate) take priority over RLS-limited client query
      const serverCounts: Record<string, number> = countsRes?.counts ?? {};
      const memberCountMap = new Map<string, number>(
        Object.entries(serverCounts).map(([k, v]) => [k, v as number])
      );
      const enrolledSet = new Set<string>();

      // group_members rows: used only for enrolled-status of non-subscription groups.
      // Must match the server's definition in GET /api/groups/[groupId] — a
      // 'pending' request is not membership, and badging it "Enrolled" here sent
      // students to a class page they have no access to yet.
      (memberRows ?? []).forEach((m: any) => {
        if (m.user_id === profile.id && ['approved', 'active', 'invited'].includes(m.status)) enrolledSet.add(m.group_id);
        // Only fall back to group_members count when server didn't return a count
        if (!(m.group_id in serverCounts)) {
          memberCountMap.set(m.group_id, (memberCountMap.get(m.group_id) ?? 0) + 1);
        }
      });

      // Also mark subscription-enrolled groups
      (subEnrollments ?? []).forEach((e: any) => enrolledSet.add(e.group_id));

      setEnrolledLessonIds(enrolledSet);

      // Order classes by their tutor's marketplace ranking (mig 190): pinned
      // tutors' classes first in pin order, then by ranking_score. Keeps the
      // created_at order within a tutor; falls back to it entirely if the
      // ranking view isn't present yet.
      {
        const { data: rankRows, error: rankErr } = tutorIds.length
          ? await supabase.from('tutor_marketplace_rankings').select('tutor_id, pin_rank, ranking_score').in('tutor_id', tutorIds)
          : { data: [] as any[], error: null };
        if (!rankErr && rankRows) {
          const rankMap = new Map<string, { pin: number | null; score: number }>();
          rankRows.forEach((r: any) => rankMap.set(r.tutor_id, { pin: r.pin_rank ?? null, score: Number(r.ranking_score ?? 0) }));
          groups = [...groups].sort((a: any, b: any) => {
            const ra = rankMap.get(a.tutor_id) ?? { pin: null, score: 0 };
            const rb = rankMap.get(b.tutor_id) ?? { pin: null, score: 0 };
            if (ra.pin != null || rb.pin != null) {
              if (ra.pin == null) return 1;
              if (rb.pin == null) return -1;
              if (ra.pin !== rb.pin) return ra.pin - rb.pin;
            }
            return rb.score - ra.score;
          });
        }
      }

      const mapped: GroupLesson[] = groups.map((g: any) => {
        const tutor = tutorMap.get(g.tutor_id);
        const { color } = getSubjectStyle(g.subject || '');
        return {
          id: g.id,
          title: g.name,
          tutor: tutor?.display_name || tutor?.full_name || 'Unknown Tutor',
          tutorId: g.tutor_id,
          tutorHue: 145,
          subject: g.subject || 'General',
          level: formatLevel(g.form_level || g.difficulty || ''),
          ...(() => {
            const entries = parseScheduleData(g.schedule_data);
            const compact = scheduleToCompact(entries);
            return {
              day: compact ?? g.schedule_display ?? '',
              hasCompactSchedule: !!compact,
              scheduleEntries: entries,
            };
          })(),
          time: '',
          monthlyPrice: Number(g.price_monthly ?? g.price_per_session ?? g.price_per_course ?? 0),
          seats: { taken: memberCountMap.get(g.id) ?? 0, total: g.max_students ?? null },
          sessionLength: g.session_length_minutes ?? null,
          rating: 0,
          tags: [],
          color,
          description: g.description ?? null,
          coverImage: g.cover_image ?? null,
          requireJoinRequests: g.require_join_requests ?? false,
          feedbackMode: g.feedback_mode ?? g.parent_feedback_mode ?? null,
          parentFeedbackPrice: g.parent_feedback_price ?? null,
          activePromotion: null,
        };
      });

      // Fetch active promotions + usage counts for all groups
      try {
        const [{ data: promos }, { data: usageRows }] = await Promise.all([
          supabase
            .from('group_promotions')
            .select('id, group_id, kind, discount, student_cap, duration_days, created_at')
            .in('group_id', groupIds)
            .eq('active', true)
            .order('created_at', { ascending: false }),
          supabase
            .from('group_enrollments')
            .select('promotion_id')
            .in('group_id', groupIds)
            .not('promotion_id', 'is', null),
        ]);

        // Count how many enrollments used each promotion
        const usageByPromoId = new Map<string, number>();
        for (const row of usageRows ?? []) {
          if (row.promotion_id) usageByPromoId.set(row.promotion_id, (usageByPromoId.get(row.promotion_id) ?? 0) + 1);
        }

        const now = new Date();
        const bestPromoByGroup = new Map<string, any>();
        for (const promo of promos ?? []) {
          if (bestPromoByGroup.has(promo.group_id)) continue;
          const usedCount = usageByPromoId.get(promo.id) ?? 0;
          let valid = false;
          if (promo.kind === 'open-ended') valid = true;
          else if (promo.kind === 'early-bird' && promo.student_cap && usedCount < promo.student_cap) valid = true;
          else if (promo.kind === 'time-limited' && promo.duration_days) {
            const exp = new Date(promo.created_at);
            exp.setDate(exp.getDate() + promo.duration_days);
            if (now < exp) valid = true;
          }
          if (valid) bestPromoByGroup.set(promo.group_id, { ...promo, used_count: usedCount });
        }
        mapped.forEach((g) => { g.activePromotion = bestPromoByGroup.get(g.id) ?? null; });
      } catch { /* non-fatal */ }

      // Resolve each class's recurring pattern server-side. Sessions and
      // occurrences are RLS-scoped, so a student who isn't enrolled can't read
      // them from the browser — and that's exactly the student who needs to see
      // the schedule before joining. Mirrors the /member-counts workaround.
      try {
        const groupIds = groups.map((g: any) => g.id);
        if (!groupIds.length) { setGroupLessons(mapped); return; }

        const schedRes = await fetch(`/api/groups/schedules?ids=${groupIds.join(',')}`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        const schedules: Record<string, ScheduleEntry[]> = schedRes?.schedules ?? {};

        if (Object.keys(schedules).length > 0) {
          setGroupLessons(mapped.map((l) => {
            const entries = schedules[l.id];
            if (!entries?.length) return l;
            const compact = scheduleToCompact(entries);
            if (!compact) return { ...l, scheduleEntries: entries };
            return {
              ...l,
              day: compact,
              // The compact line already carries the time range.
              time: '',
              hasCompactSchedule: true,
              scheduleEntries: entries,
            };
          }));
          return;
        }
      } catch { /* non-critical */ }

      setGroupLessons(mapped);
    } catch (err) {
      console.error('fetchGroupLessons error:', err);
      setGroupLessons([]);
    } finally {
      setLoadingGroupLessons(false);
    }
  }

  async function handleJoinLesson() {
    if (!joinLesson || !profile) return;
    if (enrolledLessonIds.has(joinLesson.id)) {
      setJoinLesson(null);
      router.push('/student/classes');
      return;
    }
    setJoiningLesson(true);
    try {
      if (joinLesson.monthlyPrice > 0) {
        // Paid group — go through subscribe → LuniPay checkout
        const res = await fetch(`/api/groups/${joinLesson.id}/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (data.waitlisted) {
          setJoinLesson(null);
          alert(`You've been added to the waitlist (position #${data.position ?? '?'}). We'll notify you when a spot opens.`);
          return;
        }
        if (!res.ok) throw new Error(data.error || 'Failed to start checkout');
        if (data.checkout_url) {
          window.location.href = data.checkout_url;
          return;
        }
      } else {
        // Free group — join directly
        const res = await fetch(`/api/groups/${joinLesson.id}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to join lesson');
        setEnrolledLessonIds((s) => new Set([...s, joinLesson.id]));
        setJoinLesson(null);
        const status = data.member?.status;
        if (status === 'pending_approval' || status === 'pending') {
          alert('Your join request has been sent. The tutor will approve it shortly.');
        }
        router.push('/student/classes');
      }
    } catch (err: any) {
      console.error('Error joining lesson:', err);
      alert(err.message || 'Failed to join lesson. Please try again.');
    } finally {
      setJoiningLesson(false);
    }
  }

  const filteredTutors = useMemo(() => {
    let filtered = [...tutors];

    // Search by name (display name, username, or full name)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(tutor => {
        const displayName = getDisplayName(tutor).toLowerCase();
        const username = tutor.username?.toLowerCase() || '';
        const fullName = tutor.full_name?.toLowerCase() || '';
        
        return displayName.includes(query) || 
               username.includes(query) || 
               fullName.includes(query);
      });
    }

    // Filter by subject
    if (selectedSubjects.length > 0) {
      filtered = filtered.filter(tutor =>
        tutor.subjects.some(s => selectedSubjects.includes(s.name))
      );
    }

    // Filter by school/institution
    if (selectedSchool) {
      filtered = filtered.filter(tutor =>
        tutor.institution_id === selectedSchool
      );
    }

    // Filter by rating
    if (selectedRating !== null) {
      filtered = filtered.filter(tutor =>
        tutor.average_rating !== null && tutor.average_rating >= selectedRating
      );
    }

    // Filter by price range
    const min = priceMin ? parseFloat(priceMin) : null;
    const max = priceMax ? parseFloat(priceMax) : null;
    if (min !== null || max !== null) {
      filtered = filtered.filter(tutor =>
        tutor.subjects.some(s => {
          const p = s.price_per_hour_ttd;
          if (min !== null && p < min) return false;
          if (max !== null && p > max) return false;
          return true;
        })
      );
    }

    const minPrice = (t: Tutor) => {
      const prices = t.subjects.map((s) => s.price_per_hour_ttd);
      return prices.length ? Math.min(...prices) : Number.POSITIVE_INFINITY;
    };

    if (sortOrder === 'price_low') {
      filtered.sort((a, b) => minPrice(a) - minPrice(b));
    } else if (sortOrder === 'rating_high') {
      filtered.sort((a, b) => (b.average_rating ?? -1) - (a.average_rating ?? -1));
    }
    // 'relevance' (the default): keep the marketplace ranking order already
    // applied in fetchTutors from the tutor_marketplace_rankings view (mig 190)
    // — pinned first, then ranking_score desc. We intentionally do NOT re-sort
    // here. The previous default re-sorted by the *viewer's* subjects_of_study
    // and then rating, which overrode the ranking and made the marketplace
    // disagree with the admin Tutor Ranking page (e.g. a new, unrated tutor who
    // happened to match the viewer's subjects jumped above a higher-scored one).

    return filtered;
  }, [tutors, searchQuery, selectedSubjects, selectedRating, priceMin, priceMax, selectedSchool, profile, sortOrder]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, selectedSubjects, selectedRating, priceMin, priceMax, selectedSchool, sortOrder]);

  const totalPages = Math.ceil(filteredTutors.length / TUTORS_PER_PAGE);
  const pagedTutors = filteredTutors.slice(
    (currentPage - 1) * TUTORS_PER_PAGE,
    currentPage * TUTORS_PER_PAGE
  );

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  const hasActiveFilters = searchQuery || selectedSubjects.length > 0 || selectedRating !== null || priceMin || priceMax || selectedSchool;
  const activeFilterCount = [selectedRating !== null, !!(priceMin || priceMax), !!selectedSchool].filter(Boolean).length;

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedSubjects([]);
    setSelectedRating(null);
    setPriceMin('');
    setPriceMax('');
    setSelectedSchool('');
  };

  const matchChip = (subject: string) => {
    if (activeChip === 'All') return true;
    const s = subject.toLowerCase();
    if (activeChip === 'Maths') return s.includes('math');
    if (activeChip === 'SEA') return s.includes('sea');
    return s.includes(activeChip.toLowerCase());
  };

  const filteredGroupLessons = groupLessons
    .filter((l) => matchChip(l.subject))
    .filter((l) => scheduleMatchesDayTime(l.scheduleEntries, selectedDays, selectedBands))
    .filter((l) => !searchQuery || l.title.toLowerCase().includes(searchQuery.toLowerCase()) || l.tutor.toLowerCase().includes(searchQuery.toLowerCase()) || l.subject.toLowerCase().includes(searchQuery.toLowerCase()));

  const scheduleFilterActive = selectedDays.length > 0 || selectedBands.length > 0;
  const toggleDay = (d: number) =>
    setSelectedDays((prev) => (prev.includes(d) ? prev.filter((v) => v !== d) : [...prev, d]));
  const toggleBand = (b: TimeBand) =>
    setSelectedBands((prev) => (prev.includes(b) ? prev.filter((v) => v !== b) : [...prev, b]));

  return (
    <>
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-ink">Explore</h1>
          <p className="text-sm text-muted-foreground mt-1">Join a recurring group lesson, or book a 1:1 with a tutor.</p>
        </div>

        {/* Tab switcher */}
        <div className="inline-flex p-1 rounded-2xl bg-muted">
          <button
            onClick={() => setTab('lessons')}
            className={cn('inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition', tab === 'lessons' ? 'bg-background text-ink shadow-sm' : 'text-muted-foreground hover:text-ink')}
          >
            <Users className="size-4" /> Group Lessons
          </button>
          <button
            onClick={() => setTab('tutors')}
            className={cn('inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition', tab === 'tutors' ? 'bg-background text-ink shadow-sm' : 'text-muted-foreground hover:text-ink')}
          >
            <GraduationCap className="size-4" /> 1:1 Tutors
          </button>
        </div>

        {/* Search bar */}
        <div className="rounded-2xl bg-background border border-border p-2 flex items-center gap-2 shadow-sm">
          <div className="flex-1 flex items-center gap-2 px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tab === 'lessons' ? 'Search lessons, subjects, tutors…' : 'Search tutors by subject or name…'}
              className="flex-1 bg-transparent outline-none text-sm py-2 min-w-0"
            />
          </div>
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition',
              filtersOpen || activeFilterCount > 0
                ? 'bg-brand text-white'
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            <SlidersHorizontal className="size-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="size-5 rounded-full bg-white text-brand text-xs font-bold grid place-items-center">{activeFilterCount}</span>
            )}
          </button>
        </div>

        {/* Filters panel */}
        {filtersOpen && (
          <div className="rounded-2xl border border-border bg-background p-4 space-y-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ink text-sm">Filters</h3>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-xs text-brand-deep font-semibold hover:underline">
                  Clear all
                </button>
              )}
            </div>

            {/* Price range */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Price range (TT$/hr)</label>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  min={0}
                  placeholder="Min"
                  value={priceMin}
                  onChange={(e) => setPriceMin(e.target.value)}
                  className="w-24 px-3 py-2 rounded-xl border border-border bg-background text-sm tabular-nums"
                />
                <span className="text-muted-foreground text-sm">—</span>
                <input
                  type="number"
                  min={0}
                  placeholder="Max"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                  className="w-24 px-3 py-2 rounded-xl border border-border bg-background text-sm tabular-nums"
                />
              </div>
            </div>

            {/* Star rating */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Minimum rating</label>
              <div className="flex items-center gap-1.5 mt-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setSelectedRating(selectedRating === star ? null : star)}
                    className={cn(
                      'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium border transition',
                      selectedRating === star
                        ? 'bg-coral/10 border-coral text-coral'
                        : 'border-border text-muted-foreground hover:border-coral/40'
                    )}
                  >
                    <Star className={cn('size-3.5', selectedRating !== null && star <= selectedRating ? 'fill-coral text-coral' : 'text-current')} />
                    {star}+
                  </button>
                ))}
              </div>
            </div>

            {/* School filter */}
            {institutions.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">School / Institution</label>
                <select
                  value={selectedSchool}
                  onChange={(e) => setSelectedSchool(e.target.value)}
                  className="mt-2 w-full px-3 py-2 rounded-xl border border-border bg-background text-sm"
                >
                  <option value="">All schools</option>
                  {institutions.map((inst) => (
                    <option key={inst.id} value={inst.id}>{inst.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Subject chips */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {SUBJECT_CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => setActiveChip(c)}
              className={cn('px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition border', activeChip === c ? 'bg-ink text-white border-ink' : 'bg-background text-muted-foreground border-border hover:border-ink/30')}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Group Lessons tab */}
        {tab === 'lessons' && (
          <>
            {/* Day + time narrowing — "does this fit our week?" */}
            <div className="rounded-2xl border border-border bg-background p-3 space-y-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-xs font-semibold text-ink shrink-0">Meets on</span>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_FILTER_OPTIONS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      aria-pressed={selectedDays.includes(d.value)}
                      aria-label={d.label}
                      onClick={() => toggleDay(d.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-semibold border transition',
                        selectedDays.includes(d.value)
                          ? 'bg-brand text-white border-brand'
                          : 'bg-background text-muted-foreground border-border hover:border-brand/40'
                      )}
                    >
                      {d.short}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-xs font-semibold text-ink shrink-0">Time</span>
                <div className="flex flex-wrap gap-1.5">
                  {TIME_BANDS.map((b) => (
                    <button
                      key={b.value}
                      type="button"
                      aria-pressed={selectedBands.includes(b.value)}
                      onClick={() => toggleBand(b.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-semibold border transition',
                        selectedBands.includes(b.value)
                          ? 'bg-brand text-white border-brand'
                          : 'bg-background text-muted-foreground border-border hover:border-brand/40'
                      )}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                {scheduleFilterActive && (
                  <button
                    type="button"
                    onClick={() => { setSelectedDays([]); setSelectedBands([]); }}
                    className="ml-auto text-xs font-semibold text-brand-deep hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Times are in AST (Trinidad &amp; Tobago).
                {scheduleFilterActive && ' One-off classes are hidden while a day or time filter is on.'}
              </p>
            </div>

            <div className="text-sm text-muted-foreground">
              {loadingGroupLessons ? 'Loading lessons…' : (() => {
                const enrolledCount = filteredGroupLessons.filter(l => enrolledLessonIds.has(l.id)).length;
                return (
                  <>
                    {filteredGroupLessons.length} lesson{filteredGroupLessons.length === 1 ? '' : 's'}
                    {enrolledCount > 0 && <> · <span className="text-brand font-medium">{enrolledCount} enrolled</span></>}
                  </>
                );
              })()}
              {!loadingGroupLessons && searchQuery && <> matching &ldquo;<span className="text-ink font-medium">{searchQuery}</span>&rdquo;</>}
            </div>

            {loadingGroupLessons ? (
              <div className="flex justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
              </div>
            ) : filteredGroupLessons.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">
                <div className="text-3xl mb-3">📚</div>
                {scheduleFilterActive ? (
                  <>
                    <p className="font-semibold text-ink">No classes match those days or times</p>
                    <p className="mt-1">Try widening your selection, or clear the day and time filters.</p>
                    <button
                      type="button"
                      onClick={() => { setSelectedDays([]); setSelectedBands([]); }}
                      className="mt-3 px-4 py-2 rounded-xl bg-brand text-white text-xs font-semibold hover:bg-brand-deep transition"
                    >
                      Clear day &amp; time filters
                    </button>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-ink">No group lessons yet</p>
                    <p className="mt-1">Check back soon — tutors are adding new group classes.</p>
                  </>
                )}
              </div>
            ) : null}

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredGroupLessons.map((l) => {
                const remaining = l.seats.total !== null ? l.seats.total - l.seats.taken : null;
                const lowStock = remaining !== null && remaining > 0 && remaining <= 3;
                const full = remaining !== null && remaining <= 0;
                const pctFull = l.seats.total ? Math.round((l.seats.taken / l.seats.total) * 100) : null;
                return (
                  <div key={l.id} className={cn('group rounded-3xl bg-background border overflow-hidden hover:shadow-card transition-all hover:-translate-y-0.5 flex flex-col', enrolledLessonIds.has(l.id) ? 'border-brand/40' : 'border-border')}>
                    <div className={`relative h-24 ${l.coverImage ? '' : `bg-gradient-to-br ${l.color}`}`}
                      style={l.coverImage ? { backgroundImage: `url(${l.coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                      {enrolledLessonIds.has(l.id) && (
                        <div className="absolute top-2.5 left-2.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand text-white">
                          Enrolled
                        </div>
                      )}
                    </div>
                    <div className="p-4 space-y-3 flex-1 flex flex-col">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-semibold text-ink leading-tight">{l.title}</h3>
                          {l.rating > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold tabular-nums shrink-0">
                              <Star className="size-3 fill-amber-500 text-amber-500" />
                              {l.rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 inline-flex items-center gap-2">
                          <TutorInitialAvatar name={l.tutor} size={22} />
                          <span className="text-sm text-muted-foreground">by {l.tutor}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{l.subject}{l.level ? ` · ${l.level}` : ''}</div>
                        {l.description && (
                          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{l.description}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {l.requireJoinRequests && !enrolledLessonIds.has(l.id) && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground">
                            Approval required
                          </span>
                        )}
                        {/* Parent feedback badges hidden — parent accounts coming soon */}
                        {(lowStock || full) && (
                          <div className={cn('inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full', full ? 'bg-muted text-muted-foreground' : 'bg-coral-soft text-coral')}>
                            <Flame className="size-3.5" />
                            {full ? 'Class full' : `Only ${remaining} spot${remaining === 1 ? '' : 's'} left!`}
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5 text-xs">
                        {/* Recurring schedule — days and time on one line, e.g.
                            "Recurring every Monday and Wednesday · 5:00–7:00 PM AST".
                            Renders nothing when the class has no recurring
                            schedule, rather than a "Schedule TBD" placeholder. */}
                        {l.day && (
                          <div className="text-muted-foreground whitespace-pre-line leading-relaxed">{l.day}</div>
                        )}
                        {/* Time / duration only for free-text or legacy schedules —
                            a compact line already states the range. */}
                        {!l.hasCompactSchedule && l.time && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="size-3.5" /> {l.time}
                            {l.sessionLength && <span className="text-muted-foreground/70">· {formatDuration(l.sessionLength)}</span>}
                          </div>
                        )}
                        {!l.hasCompactSchedule && !l.time && l.sessionLength && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="size-3.5" /> {formatDuration(l.sessionLength)} per session
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Users className="size-3.5" />
                          {l.seats.total !== null
                            ? `${l.seats.taken}/${l.seats.total} enrolled`
                            : `${l.seats.taken} enrolled`}
                        </div>
                        {pctFull !== null && (
                          <div className="h-1 rounded-full bg-muted overflow-hidden">
                            <div className={cn('h-full rounded-full', lowStock ? 'bg-coral' : 'bg-brand')} style={{ width: `${pctFull}%` }} />
                          </div>
                        )}
                      </div>

                      <div className="flex items-end justify-between pt-3 mt-auto border-t border-border">
                        <div>
                          {l.monthlyPrice > 0 ? (
                            l.activePromotion ? (
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                                    {promoLabel(l.activePromotion)}
                                  </span>
                                </div>
                                <div className="flex items-baseline gap-1 mt-0.5">
                                  <span className="text-lg font-bold text-brand-deep">{fmtTTD(Math.round(l.monthlyPrice * (1 - l.activePromotion.discount / 100)))}</span>
                                  <span className="text-xs line-through text-muted-foreground">{fmtTTD(l.monthlyPrice)}</span>
                                  <span className="text-xs text-muted-foreground">/month</span>
                                </div>
                              </div>
                            ) : (
                              <>
                                <span className="text-lg font-bold text-ink">{fmtTTD(l.monthlyPrice)}</span>
                                <span className="text-xs text-muted-foreground">/month</span>
                              </>
                            )
                          ) : (
                            <span className="text-lg font-bold text-brand-deep">Free</span>
                          )}
                        </div>
                        {enrolledLessonIds.has(l.id) ? (
                          <Link
                            href={`/student/classes/${l.id}`}
                            className="px-3 py-1.5 rounded-xl bg-brand-soft text-forest text-xs font-semibold hover:bg-brand/20 transition"
                          >
                            Open Class
                          </Link>
                        ) : (
                          <Link
                            href={`/student/explore/${l.id}`}
                            className="px-3 py-1.5 rounded-xl bg-brand text-white text-xs font-semibold hover:bg-brand-deep transition"
                          >
                            {full ? 'Join waitlist' : 'View class'}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* 1:1 Tutors tab */}
        {tab === 'tutors' && (
          <>
            <div className="text-sm text-muted-foreground">
              {loadingTutors ? 'Loading tutors…' : `${filteredTutors.length} tutor${filteredTutors.length === 1 ? '' : 's'}${totalPages > 1 ? ` · Page ${currentPage} of ${totalPages}` : ''}`}
            </div>

            {loadingTutors ? (
              <div className="flex justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
              </div>
            ) : pagedTutors.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">No tutors found. Try adjusting your search.</div>
            ) : (
              <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
                {/* Tutor list */}
                <div className="space-y-3 min-w-0">
                  {pagedTutors.map((tutor) => {
                    const stats = tutorStats[tutor.id];
                    const isVerified = (tutor.tutor_verification_status ?? '').toUpperCase() === 'VERIFIED';
                    const curricula = Array.from(new Set(tutor.subjects.map((s) => s.curriculum).filter(Boolean)));
                    const subjectNames = Array.from(new Set(tutor.subjects.map((s) => s.name)));
                    const minRate = tutor.subjects.length ? Math.min(...tutor.subjects.map((s) => s.price_per_hour_ttd ?? 0)) : 0;
                    const flag = countryToFlag(tutor.country);
                    return (
                      <div key={tutor.id} className="group rounded-2xl bg-background border border-border p-4 hover:shadow-card hover:border-brand/40 transition-all">
                        <div className="flex gap-4">
                          {/* Avatar (placeholder) */}
                          <div className="shrink-0 flex flex-col items-center gap-2">
                            <button
                              onClick={() => router.push(`/student/tutors/${tutor.id}/book`)}
                              className="size-20 rounded-2xl grid place-items-center text-2xl font-bold text-white bg-gradient-to-br from-brand to-brand-deep overflow-hidden"
                              aria-label={`View ${getDisplayName(tutor)}`}
                            >
                              {tutor.avatar_url
                                ? <img src={tutor.avatar_url} alt="" className="size-full object-cover" />
                                : getDisplayName(tutor).charAt(0).toUpperCase()}
                            </button>
                          </div>

                          {/* Main */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <button onClick={() => router.push(`/student/tutors/${tutor.id}/book`)} className="flex items-center gap-1.5 text-left max-w-full">
                                  <h3 className="font-bold text-ink text-lg truncate group-hover:text-brand-deep transition-colors">{getDisplayName(tutor)}</h3>
                                  {isVerified && <BadgeCheck className="size-4 shrink-0 text-brand-deep" />}
                                  {flag && <span className="text-sm shrink-0" title={tutor.country}>{flag}</span>}
                                </button>
                                <div className="flex items-center gap-2 mt-1 text-sm flex-wrap">
                                  {tutor.average_rating !== null ? (
                                    <span className="inline-flex items-center gap-1 font-bold text-ink tabular-nums">
                                      <Star className="size-3.5 fill-amber-400 text-amber-400" /> {tutor.average_rating.toFixed(2)}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-muted-foreground"><Star className="size-3.5" /> New</span>
                                  )}
                                  {tutor.total_reviews > 0 && <span className="text-muted-foreground">({tutor.total_reviews} review{tutor.total_reviews === 1 ? '' : 's'})</span>}
                                  {subjectNames.length > 0 && (
                                    <span className="text-muted-foreground truncate">· {subjectNames.slice(0, 3).join(', ')}{subjectNames.length > 3 ? ` +${subjectNames.length - 3}` : ''}</span>
                                  )}
                                </div>
                                {curricula.length > 0 && (
                                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                    {curricula.map((c) => (
                                      <span key={c} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-soft text-brand-deep">{c}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                {minRate > 0 ? (
                                  <>
                                    <div className="text-xl font-bold text-ink">TT${minRate}</div>
                                    <div className="text-[11px] text-muted-foreground">60-min lesson</div>
                                  </>
                                ) : (
                                  <div className="text-xs text-muted-foreground">Rate not set</div>
                                )}
                              </div>
                            </div>

                            {tutor.bio && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{tutor.bio}</p>}

                            {/* Real, tracked stats */}
                            <div className="flex items-center gap-6 mt-3">
                              <div>
                                <div className="text-sm font-bold text-ink tabular-nums">{stats?.studentsTaught ?? 0}</div>
                                <div className="text-[11px] text-muted-foreground">Students taught</div>
                              </div>
                              <div>
                                <div className="text-sm font-bold text-ink tabular-nums">{stats?.lessonsTaught ?? 0}</div>
                                <div className="text-[11px] text-muted-foreground">Lessons taught</div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border">
                              <div className="text-xs text-muted-foreground inline-flex items-center gap-1 min-w-0">
                                {stats && stats.recentBookings > 0 && (
                                  <><TrendingUp className="size-3.5 text-brand-deep shrink-0" /> <span className="truncate">Booked {stats.recentBookings} time{stats.recentBookings === 1 ? '' : 's'} recently</span></>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => router.push('/student/messages')}
                                  className="size-9 rounded-xl border border-border grid place-items-center hover:bg-muted transition"
                                  aria-label="Message tutor"
                                >
                                  <MessageSquare className="size-4 text-muted-foreground" />
                                </button>
                                <button
                                  onClick={() => router.push(`/student/tutors/${tutor.id}/book`)}
                                  className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep transition"
                                >
                                  Book a lesson
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Featured tutor panel (top-ranked). Video area is a placeholder. */}
                {filteredTutors[0] && (() => {
                  const f = filteredTutors[0];
                  const fname = getDisplayName(f).split(' ')[0];
                  const fsubjects = Array.from(new Set(f.subjects.map((s) => s.name))).slice(0, 2).join(' · ');
                  return (
                    <aside className="hidden lg:block sticky top-4 space-y-3">
                      <div className="rounded-2xl overflow-hidden border border-border">
                        <div className="relative aspect-[4/5] bg-gradient-to-br from-brand to-brand-deep grid place-items-center">
                          <button
                            onClick={() => router.push(`/student/tutors/${f.id}/book`)}
                            className="size-16 rounded-full bg-white/90 grid place-items-center hover:bg-white transition shadow-lg"
                            aria-label={`Book ${getDisplayName(f)}`}
                          >
                            <Play className="size-7 text-brand-deep fill-brand-deep translate-x-0.5" />
                          </button>
                          <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
                            <div className="font-bold text-white flex items-center gap-1.5">
                              {getDisplayName(f)}
                              {(f.tutor_verification_status ?? '').toUpperCase() === 'VERIFIED' && <BadgeCheck className="size-4 text-white" />}
                            </div>
                            {fsubjects && <div className="text-xs text-white/80">{fsubjects}</div>}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => router.push(`/student/tutors/${f.id}/book`)} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm font-semibold text-ink hover:bg-muted transition">
                        View full schedule
                      </button>
                      <button onClick={() => router.push(`/student/tutors/${f.id}`)} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm font-semibold text-ink hover:bg-muted transition">
                        See {fname}&apos;s profile
                      </button>
                    </aside>
                  );
                })()}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-4 py-2 rounded-xl border border-border text-sm font-medium disabled:opacity-40 hover:bg-muted transition">Previous</button>
                <span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</span>
                <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-4 py-2 rounded-xl border border-border text-sm font-medium disabled:opacity-40 hover:bg-muted transition">Next</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Join Lesson Modal */}
      {joinLesson && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setJoinLesson(null)}>
          <div className="bg-background w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className={`relative h-24 bg-gradient-to-br ${joinLesson.color}`}>
              <button onClick={() => setJoinLesson(null)} className="absolute top-3 right-3 size-8 rounded-full bg-white/90 grid place-items-center hover:bg-white">
                <X className="size-4 text-ink" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <h2 className="text-lg font-bold text-ink">{joinLesson.title}</h2>
                <p className="text-sm text-muted-foreground">by {joinLesson.tutor} · {joinLesson.subject} · {joinLesson.level}</p>
              </div>
              <div className="rounded-2xl border border-border p-4 space-y-2 text-sm">
                {[
                  { label: 'Day', value: joinLesson.day, show: !!joinLesson.day },
                  { label: 'Time', value: joinLesson.time, show: !!joinLesson.time },
                  { label: 'Session length', value: joinLesson.sessionLength ? formatDuration(joinLesson.sessionLength) : null, show: !!joinLesson.sessionLength },
                  { label: 'Enrolled', value: joinLesson.seats.total !== null ? `${joinLesson.seats.taken} / ${joinLesson.seats.total}` : `${joinLesson.seats.taken} students`, show: true },
                  { label: 'Price', value: joinLesson.monthlyPrice > 0
                    ? joinLesson.activePromotion
                      ? `${fmtTTD(Math.round(joinLesson.monthlyPrice * (1 - joinLesson.activePromotion.discount / 100)))}/month (${joinLesson.activePromotion.discount}% off)`
                      : `${fmtTTD(joinLesson.monthlyPrice)}/month`
                    : 'Free', show: true },
                ].filter(r => r.show && r.value).map(({ label, value }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-ink font-medium">{value}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                {joinLesson.tags.map((t) => (
                  <span key={t} className="px-2.5 py-1 rounded-full bg-brand-soft text-forest text-xs font-medium">{t}</span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">You'll be charged monthly. Cancel anytime before the next billing cycle.</p>
              {enrolledLessonIds.has(joinLesson.id) ? (
                <div className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-brand-soft text-forest font-semibold">
                  <Check className="size-4" /> Already enrolled
                </div>
              ) : (
                <button
                  onClick={handleJoinLesson}
                  disabled={joiningLesson}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-brand text-white font-semibold hover:bg-brand-deep transition disabled:opacity-60"
                >
                  <Check className="size-4" />
                  {joiningLesson ? 'Enrolling…' : joinLesson.monthlyPrice > 0
                    ? joinLesson.activePromotion
                      ? `Subscribe — ${fmtTTD(Math.round(joinLesson.monthlyPrice * (1 - joinLesson.activePromotion.discount / 100)))}/month`
                      : `Subscribe — ${fmtTTD(joinLesson.monthlyPrice)}/month`
                    : 'Join Free'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

