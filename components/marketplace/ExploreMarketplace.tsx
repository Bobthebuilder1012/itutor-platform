// @ts-nocheck
'use client';

// THE marketplace — one Explore screen, rendered for students and for parents.
//
// It was the body of /student/find-tutors. The parent had a separate, thinner
// list of their own: no filters, no day/time narrowing, no promotions, no
// capacity language, a different card. Two descriptions of one catalogue, and
// the parent — the person buying who has never sat in a class — got the poorer
// one. Same reasoning as ClassDetailView: the parent sees what the student sees.
//
// The variant changes WHERE a card goes, never what a card says:
//   student   /student/explore/[id], and their own enrolments are badged
//   parent    /parent/classes/[id], where the child picker and the §5 checks
//             live — a parent never joins from a card, because a card cannot
//             ask which child it is for.

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/utils/displayName';
import VerifiedBadge from '@/components/VerifiedBadge';
import UserAvatar from '@/components/UserAvatar';
import { cn } from '@/lib/utils';
import { Search, Star, Heart, Calendar, Clock, Users, GraduationCap, Flame, X, Check, Video, Sparkles, ChevronDown, MapPin } from 'lucide-react';
import {
  matchesLocation,
  isLocationFilterActive,
  DEFAULT_LOCATION_FILTER,
  type LocationFilterState,
} from '@/lib/classes/locationFilter';
import LocationFilter from '@/components/marketplace/LocationFilter';
import ClassCard from '@/components/marketplace/ClassCard';
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
import { classCapacityDisplay, capacityLabel } from '@/lib/utils/classCapacity';
import {
  ANY_PRICE,
  PRICE_BANDS,
  RATING_OPTIONS,
  priceBandById,
  priceInBand,
} from '@/lib/utils/marketplaceFilters';

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
  /** Weekly booking windows, bucketed by /api/tutors/listed-ids. */
  availability?: { days: number[]; bands: TimeBand[] };
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
  tutorAvatar: string | null;
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
  /**
   * The rating of the tutor who runs the class — classes carry no rating of
   * their own yet, so this is what the Rating filter and the card badge use,
   * labelled as the tutor's so it can't be misread as the class's.
   */
  tutorRating: number | null;
  tutorReviews: number;
  tags: string[];
  color: string;
  description?: string | null;
  coverImage?: string | null;
  requireJoinRequests?: boolean;
  /** 'online' for every class before migration 242, and for most after it. */
  classFormat?: 'online' | 'physical' | 'hybrid';
  /** The venue's AREA, never its street address. */
  venueArea?: string | null;
  venueRegionId?: string | null;
  feedbackMode?: string | null;
  parentFeedbackPrice?: number | null;
  activePromotion?: { id: string; kind: string; discount: number; student_cap: number | null; duration_days: number | null } | null;
  /** Set when the class hasn't started and the tutor has opened preorders. */
  preorder?: { firstSession: string; releaseDate: string; shortClass: boolean } | null;
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

// Square frame, matching the card's rounded-rect language. Shows the tutor's
// picture when they have one and falls back to initials when they don't.
function TutorAvatar({ avatarUrl, name, size = 40 }: { avatarUrl?: string | null; name: string; size?: number }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className="rounded-md object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = name.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '').split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      className="inline-flex items-center justify-center rounded-md font-semibold shrink-0 bg-brand-soft text-forest"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

/**
 * One filter, as a pill that opens a popover.
 *
 * Replaces a full-width panel that pushed the results down the page whenever it
 * was open, and that had no Apply — every keystroke in the price box re-filtered
 * the grid underneath, so a half-typed "2" of "250" briefly filtered to TT$2+.
 *
 * The popover is absolutely positioned, so opening one covers the results rather
 * than displacing them, and edits are held in a DRAFT until Apply. The pill
 * shows the applied value, so the active filters are readable without opening
 * anything.
 */
function FilterMenu({
  label,
  summary,
  onOpen,
  onApply,
  onClear,
  children,
  widthClass = 'w-72',
}: {
  label: string;
  /** The applied value, shown in place of the label. null = not filtering. */
  summary?: string | null;
  /** Seed the draft from what is currently applied. */
  onOpen?: () => void;
  onApply: () => void;
  onClear: () => void;
  children: React.ReactNode;
  widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = !!summary;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          // Discarding a half-finished edit is the point of Apply: reopening
          // reseeds from what is actually applied.
          if (!open) onOpen?.();
          setOpen((o) => !o);
        }}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition whitespace-nowrap',
          active
            ? 'border-brand bg-brand-soft text-forest'
            : 'border-border bg-background text-muted-foreground hover:border-ink/30 hover:text-ink'
        )}
      >
        {active ? summary : label}
        <ChevronDown className={cn('size-3.5 transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className={cn(
            'absolute left-0 z-30 mt-2 rounded-2xl border border-border bg-background p-4 shadow-lg',
            widthClass
          )}
        >
          {children}
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => { onClear(); setOpen(false); }}
              className="text-xs font-semibold text-muted-foreground hover:text-ink"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => { onApply(); setOpen(false); }}
              className="rounded-xl bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-deep"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExploreMarketplace({ variant = 'student' }: { variant?: 'student' | 'parent' }) {
  const isParent = variant === 'parent';
  // The only thing the variant decides. Everything below is shared.
  const classHref = (id) => (isParent ? `/parent/classes/${id}` : `/student/explore/${id}`);
  const enrolledClassHref = (id) => (isParent ? `/parent/classes/${id}` : `/student/classes/${id}`);
  const tutorHref = (id) => (isParent ? `/parent/tutors/${id}` : `/student/tutors/${id}/book`);
  const { profile, loading } = useProfile();
  const router = useRouter();
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [loadingTutors, setLoadingTutors] = useState(true);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  // Where a class meets. See lib/classes/locationFilter.ts — the rule is
  // "what can I attend from here", not "what has a venue here", and the
  // difference is a silent bug rather than a visible one.
  const [locationFilter, setLocationFilter] = useState<LocationFilterState>(DEFAULT_LOCATION_FILTER);
  const [regions, setRegions] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/regions', { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setRegions(j?.regions ?? []); })
      .catch(() => { /* filter renders with Anywhere only */ });
    return () => { cancelled = true; };
  }, []);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [priceBand, setPriceBand] = useState<string>(ANY_PRICE);
  const [selectedSchool, setSelectedSchool] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<'relevance' | 'price_low' | 'rating_high'>('relevance');
  const [tab, setTab] = useState<'lessons' | 'tutors'>('lessons');
  const [activeChip, setActiveChip] = useState('All');
  // Day / time-of-day narrowing. Both multi-select; a lesson matches when one of
  // its recurring sessions satisfies every active filter, and a tutor matches
  // when one of their weekly availability windows does.
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [selectedBands, setSelectedBands] = useState<TimeBand[]>([]);
  const [savedItems, setSavedItems] = useState<Set<string>>(new Set());

  // Draft values, edited inside a popover and copied onto the committed state
  // above by Apply. Held separately so the grid does not re-filter on every
  // keystroke, and so closing without applying discards the edit.
  const [draftPriceBand, setDraftPriceBand] = useState(ANY_PRICE);
  const [draftRating, setDraftRating] = useState<number | null>(null);
  const [draftSchool, setDraftSchool] = useState('');
  const [draftDays, setDraftDays] = useState<number[]>([]);
  const [draftBands, setDraftBands] = useState<TimeBand[]>([]);
  const [groupLessons, setGroupLessons] = useState<GroupLesson[]>([]);
  const [loadingGroupLessons, setLoadingGroupLessons] = useState(true);
  const [enrolledLessonIds, setEnrolledLessonIds] = useState<Set<string>>(new Set());
  const [joiningLesson, setJoiningLesson] = useState(false);
  const [joinLesson, setJoinLesson] = useState<GroupLesson | null>(null);
  const TUTORS_PER_PAGE = 12;

  useEffect(() => {
    if (loading) return;
    
    // The role this screen belongs to depends on who is rendering it. Left as
    // "student only", the parent's Explore bounced every parent to /login.
    const allowedRole = isParent ? 'parent' : 'student';
    if (!profile || profile.role !== allowedRole) {
      router.push('/login');
      return;
    }

    fetchTutors();
    fetchGroupLessons();
  }, [profile, loading, router, isParent]);

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

      const verificationRank: Record<string, number> = {
        VERIFIED: 0,
        PENDING: 1,
        PROCESSING: 2,
        UNVERIFIED: 3,
        REJECTED: 4,
      };
      tutorProfiles.sort(
        (a, b) =>
          (verificationRank[String(a.tutor_verification_status ?? 'UNVERIFIED')] ?? 9) -
          (verificationRank[String(b.tutor_verification_status ?? 'UNVERIFIED')] ?? 9)
      );

      const tutorProfilesWithBanners = tutorProfiles as Array<Record<string, unknown> & { id: string }>;

      // Fetch listed tutor IDs from server API (bypasses RLS on protected tables)
      const listedRes = await fetch('/api/tutors/listed-ids', { cache: 'no-store' });
      const listedJson = listedRes.ok ? await listedRes.json() : { ids: [] };
      const listedSet = new Set<string>(listedJson.ids ?? []);
      // Same response carries each tutor's weekly availability windows —
      // tutor_availability_rules is unreadable from the browser (RLS).
      const availabilityByTutor: Record<string, { days: number[]; bands: TimeBand[] }> =
        listedJson.availability ?? {};

      const activeTutorProfiles = tutorProfilesWithBanners.filter(t => listedSet.has(t.id));
      const activeTutorIds = activeTutorProfiles.map((t) => t.id);

      // Marketplace ordering (mig 190): pinned tutors first in pin order,
      // then everyone else by ranking_score desc. This is what the admin
      // Promotion & Ranking page controls — without it, boost/pin have no
      // effect on what students see. Falls back to verification-status order
      // if the ranking view isn't present.
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
        activeTutorProfiles.sort(
          (a, b) =>
            (verificationRank[String(a.tutor_verification_status ?? 'UNVERIFIED')] ?? 9) -
            (verificationRank[String(b.tutor_verification_status ?? 'UNVERIFIED')] ?? 9)
        );
      }

      console.log(`✅ Showing ${activeTutorProfiles.length} listed tutors (of ${tutorProfilesWithBanners.length} total)`);

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
          availability: availabilityByTutor[tutor.id],
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

      // The limit has to clear the whole catalogue, because it is applied by
      // created_at BEFORE the marketplace ranking is (below). At 50 a pinned
      // class older than the 50 newest would be cut before ordering ever saw
      // it — pinned to position 1 in admin, absent here.
      const CATALOGUE_LIMIT = 200;

      const { data: g1, error: e1 } = await supabase
        .from('groups')
        .select('*')
        .is('archived_at', null)
        .or('visibility.neq.private,visibility.is.null')
        .order('created_at', { ascending: false })
        .limit(CATALOGUE_LIMIT);

      if (!e1) {
        groups = g1;
      } else {
        // Fallback: visibility column may not exist — fetch all non-archived
        const { data: g2, error: e2 } = await supabase
          .from('groups')
          .select('*')
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .limit(CATALOGUE_LIMIT);
        if (e2) throw e2;
        groups = g2;
      }

      if (!groups?.length) { setGroupLessons([]); return; }

      const groupIds = groups.map((g: any) => g.id);
      const tutorIds = [...new Set<string>(groups.map((g: any) => g.tutor_id).filter(Boolean))];

      // Fetch tutor names, tutor ratings, enrollment status, server-side member
      // counts and the marketplace ranking in parallel
      const [{ data: tutorProfiles }, { data: tutorRatingRows }, { data: memberRows }, { data: subEnrollments }, countsRes, { data: rankRows }] = await Promise.all([
        tutorIds.length
          ? supabase.from('profiles').select('id, full_name, display_name, avatar_url, is_dev_account').in('id', tutorIds)
          : Promise.resolve({ data: [] as any[] }),
        // The Rating filter has to mean something on this tab too. Classes have
        // no rating of their own yet, so it goes on the tutor who runs them.
        tutorIds.length
          ? supabase.from('ratings').select('tutor_id, stars').in('tutor_id', tutorIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from('group_members').select('group_id, user_id, status').in('group_id', groupIds),
        supabase
          .from('group_enrollments')
          .select('group_id')
          .eq('student_id', profile.id)
          .in('group_id', groupIds)
          // PENDING_PAYMENT is an abandoned checkout, not an enrolment —
          // including it made the card read "Enrolled" for a class the
          // student had no access to, which opening the class then denied.
          .in('status', ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED']),
        fetch(`/api/groups/member-counts?ids=${groupIds.join(',')}`).then((r) => r.json()).catch(() => ({ counts: {} })),
        // Granted to authenticated in mig 215. If the view is missing (an older
        // database), this errors, data is null, and the order below falls back
        // to newest-first exactly as before.
        supabase
          .from('group_marketplace_rankings')
          .select('group_id, pin_rank, tutor_pin_rank, ranking_score')
          .in('group_id', groupIds),
      ]);

      // Remove groups owned by dev-account tutors — but dev-account viewers
      // (test/QA students) still see them, mirroring the viewer is_dev_account
      // gates in /api/groups, /api/tutors/listed-ids and the tutor profile page.
      const viewerIsDev = profile?.is_dev_account === true;
      const devTutorIdSet = new Set((tutorProfiles ?? []).filter((p: any) => p.is_dev_account).map((p: any) => p.id));
      if (!viewerIsDev && devTutorIdSet.size > 0) groups = groups.filter((g: any) => !devTutorIdSet.has(g.tutor_id));

      const tutorMap = new Map((tutorProfiles ?? []).map((p: any) => [p.id, p]));

      // Average stars per class tutor.
      const ratingTally = new Map<string, { sum: number; n: number }>();
      (tutorRatingRows ?? []).forEach((r: any) => {
        const t = ratingTally.get(r.tutor_id) ?? { sum: 0, n: 0 };
        t.sum += r.stars;
        t.n += 1;
        ratingTally.set(r.tutor_id, t);
      });

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
        // Allowlist, not a denylist: `!== 'denied'` also counted 'pending',
        // 'suspended', 'banned' and 'removed' members as enrolled. The three
        // allowed values match viewer_membership on /api/groups/[groupId], so
        // the card and the class page cannot disagree about who is in.
        if (m.user_id === profile.id && ['approved', 'active', 'invited'].includes(m.status)) enrolledSet.add(m.group_id);
        // Only fall back to group_members count when server didn't return a count
        if (!(m.group_id in serverCounts)) {
          memberCountMap.set(m.group_id, (memberCountMap.get(m.group_id) ?? 0) + 1);
        }
      });

      // Also mark subscription-enrolled groups
      (subEnrollments ?? []).forEach((e: any) => enrolledSet.add(e.group_id));

      setEnrolledLessonIds(enrolledSet);

      // Order the cards the way the admin's Class Promotion page says they are
      // ordered (mig 215): classes pinned by hand, then classes whose TUTOR is
      // pinned, then the class ranking score, then newest.
      //
      // This page reads `groups` straight from the table rather than going
      // through /api/groups, so it never inherited that ordering — an admin
      // could pin a class to position 1 and this page would still show it
      // wherever created_at put it.
      const rankMap = new Map<string, { pin: number | null; tutorPin: number | null; score: number }>(
        (rankRows ?? []).map((r: any) => [
          r.group_id as string,
          {
            pin: r.pin_rank ?? null,
            tutorPin: r.tutor_pin_rank ?? null,
            score: Number(r.ranking_score ?? 0),
          },
        ])
      );

      if (rankMap.size > 0) {
        // Unpinned always sorts after pinned; two pins compare by position.
        // null means "these two are tied on this key, try the next one".
        const byPin = (a: number | null, b: number | null): number | null => {
          if (a == null && b == null) return null;
          if (a == null) return 1;
          if (b == null) return -1;
          return a === b ? null : a - b;
        };
        const fallback = { pin: null, tutorPin: null, score: 0 };
        groups = [...groups].sort((a: any, b: any) => {
          const ra = rankMap.get(a.id) ?? fallback;
          const rb = rankMap.get(b.id) ?? fallback;
          return (
            byPin(ra.pin, rb.pin) ??
            byPin(ra.tutorPin, rb.tutorPin) ??
            (rb.score - ra.score ||
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          );
        });
      }

      const mapped: GroupLesson[] = groups.map((g: any) => {
        const tutor = tutorMap.get(g.tutor_id);
        const { color } = getSubjectStyle(g.subject || '');
        return {
          id: g.id,
          title: g.name,
          tutor: tutor?.display_name || tutor?.full_name || 'Unknown Tutor',
          tutorId: g.tutor_id,
          // The profiles row can be absent (RLS, deleted tutor), so guard.
          tutorAvatar: tutor?.avatar_url ?? null,
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
          ...(() => {
            const tally = ratingTally.get(g.tutor_id);
            return { tutorRating: tally ? tally.sum / tally.n : null, tutorReviews: tally?.n ?? 0 };
          })(),
          tags: [],
          color,
          description: g.description ?? null,
          coverImage: g.cover_image ?? null,
          // In person (migration 242). `venueArea` is the AREA only — the list
          // API deliberately never selects the street address, because it has no
          // per-viewer entitlement check to gate one with.
          classFormat: (g.class_format ?? 'online') as 'online' | 'physical' | 'hybrid',
          venueArea: g.venue?.region?.name ?? null,
          // The filter matches on the ID, the card shows the name. Matching on
          // the name would work until two regions share one, and would break
          // silently the day a second country is seeded.
          venueRegionId: g.venue?.region?.id ?? null,
          requireJoinRequests: g.require_join_requests ?? false,
          feedbackMode: g.feedback_mode ?? g.parent_feedback_mode ?? null,
          parentFeedbackPrice: g.parent_feedback_price ?? null,
          activePromotion: null,
        };
      });

      // Fetch active promotions + usage counts for all groups
      try {
        const [{ data: promos }, { data: usageRows }] = await Promise.all([
          // Class-level promotions only. RLS would also let this viewer read
          // their own personal coupon (migration 231), but this list badges
          // classes generically — a coupon belongs on the campaign surfaces.
          supabase
            .from('group_promotions')
            .select('id, group_id, kind, discount, student_cap, duration_days, created_at')
            .in('group_id', groupIds)
            .eq('active', true)
            .is('user_id', null)
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
      // occurrences are RLS-scoped (group_sessions' policy subqueries
      // group_members, whose own policy self-references, so a non-member's
      // browser read dies with 42P17) — and that's exactly the student who
      // needs to see the schedule before joining.
      //
      // One call now carries both: the resolved weekly pattern AND whether the
      // class can be preordered. Asked for EVERY class, not just those missing a
      // schedule line — a class with a hand-written schedule still needs to know
      // whether it takes reservations.
      try {
        const groupIds = mapped.map((l) => l.id);
        if (!groupIds.length) { setGroupLessons(mapped); return; }

        const schedRes = await fetch(`/api/groups/schedules?ids=${groupIds.join(',')}`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        const schedules: Record<string, {
          entries?: ScheduleEntry[];
          display: string | null;
          sessionLength: number | null;
          preorder?: { eligible: boolean; firstSession?: string; releaseDate?: string; shortClass?: boolean };
        }> = schedRes?.schedules ?? {};

        setGroupLessons(mapped.map((l) => {
          const s = schedules[l.id];
          if (!s) return l;

          const p = s.preorder;
          const preorder =
            p?.eligible && p.firstSession && p.releaseDate
              ? { firstSession: p.firstSession, releaseDate: p.releaseDate, shortClass: !!p.shortClass }
              : null;

          // Structured entries win: they drive the day / time-of-day filters and
          // produce the compact one-line schedule. `display` is the fallback for
          // classes whose pattern could not be resolved into entries.
          const entries = s.entries ?? [];
          const compact = entries.length ? scheduleToCompact(entries) : null;

          if (compact) {
            return {
              ...l,
              day: compact,
              // The compact line already carries the time range.
              time: '',
              hasCompactSchedule: true,
              scheduleEntries: entries,
              preorder,
            };
          }

          return {
            ...l,
            scheduleEntries: entries,
            // Only fill the schedule line if the card hasn't got one already —
            // a tutor's hand-written schedule still wins.
            ...(s.display && !l.day
              ? { day: s.display, time: '', sessionLength: s.sessionLength ?? l.sessionLength }
              : {}),
            preorder,
          };
        }));
        return;
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
        // 202: the student's parent has to approve first. The request was raised
        // server-side; nothing was joined and nothing was charged.
        if (data.parent_approval_required) {
          setJoinLesson(null);
          alert(
            data.already_pending
              ? 'Your parent already has this request — it is still waiting on them.'
              : 'Sent to your parent for approval. You are not in the class yet, and no place is being held.'
          );
          return;
        }
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

    // Filter by price band — a tutor matches when any subject they teach is
    // priced inside it, since that's a rate the student could actually book.
    const band = priceBandById(priceBand);
    if (band.min !== null || band.max !== null) {
      filtered = filtered.filter(tutor =>
        tutor.subjects.some(s => priceInBand(s.price_per_hour_ttd, band))
      );
    }

    // Filter by when the tutor takes bookings. A tutor whose windows we don't
    // have is kept rather than hidden — they're still bookable.
    if (selectedDays.length > 0 || selectedBands.length > 0) {
      filtered = filtered.filter((tutor) => {
        const days = tutor.availability?.days ?? [];
        const bands = tutor.availability?.bands ?? [];
        if (!days.length && !bands.length) return true;
        if (selectedDays.length > 0 && days.length > 0 && !selectedDays.some((d) => days.includes(d))) return false;
        if (selectedBands.length > 0 && bands.length > 0 && !selectedBands.some((b) => bands.includes(b))) return false;
        return true;
      });
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
    // disagree with the admin Promotion & Ranking page (e.g. a new, unrated
    // tutor who happened to match the viewer's subjects jumped above a
    // higher-scored one).

    return filtered;
  }, [tutors, searchQuery, selectedSubjects, selectedRating, priceBand, selectedSchool, selectedDays, selectedBands, profile, sortOrder]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, selectedSubjects, selectedRating, priceBand, selectedSchool, selectedDays, selectedBands, sortOrder]);

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

  const hasActiveFilters =
    !!searchQuery ||
    selectedSubjects.length > 0 ||
    selectedRating !== null ||
    priceBand !== ANY_PRICE ||
    !!selectedSchool ||
    selectedDays.length > 0 ||
    selectedBands.length > 0;

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedSubjects([]);
    setSelectedRating(null);
    setPriceBand(ANY_PRICE);
    setSelectedSchool('');
    setSelectedDays([]);
    setSelectedBands([]);
    setDraftPriceBand(ANY_PRICE);
    setDraftRating(null); setDraftSchool('');
    setDraftDays([]); setDraftBands([]);
    // Or a region quietly keeps narrowing the list after "Clear all" — the
    // hardest kind of filter bug to spot, because the count looks deliberate.
    setLocationFilter(DEFAULT_LOCATION_FILTER);
  };

  // What each pill reads when a filter is applied. null keeps the plain label.
  const priceSummary = priceBand === ANY_PRICE ? null : priceBandById(priceBand).label;
  const ratingSummary =
    selectedRating !== null
      ? (RATING_OPTIONS.find((o) => o.value === selectedRating)?.label ?? `${selectedRating}+ stars`)
      : null;
  const schoolSummary = selectedSchool
    ? (institutions.find((i) => i.id === selectedSchool)?.name ?? 'School')
    : null;
  const daysSummary = selectedDays.length
    ? selectedDays.length <= 3
      ? selectedDays
          .slice()
          .sort((a, b) => a - b)
          .map((d) => DAY_FILTER_OPTIONS.find((o) => o.value === d)?.short)
          .filter(Boolean)
          .join(', ')
      : `${selectedDays.length} days`
    : null;
  const bandsSummary = selectedBands.length
    ? selectedBands.length === 1
      ? (TIME_BANDS.find((b) => b.value === selectedBands[0])?.label ?? 'Time')
      : `${selectedBands.length} times`
    : null;

  const anyFilterApplied =
    !!priceSummary || !!ratingSummary || !!schoolSummary || !!daysSummary || !!bandsSummary ||
    isLocationFilterActive(locationFilter);

  const toggleDraftDay = (d: number) =>
    setDraftDays((prev) => (prev.includes(d) ? prev.filter((v) => v !== d) : [...prev, d]));
  const toggleDraftBand = (b: TimeBand) =>
    setDraftBands((prev) => (prev.includes(b) ? prev.filter((v) => v !== b) : [...prev, b]));

  const matchChip = (subject: string) => {
    if (activeChip === 'All') return true;
    const s = subject.toLowerCase();
    if (activeChip === 'Maths') return s.includes('math');
    if (activeChip === 'SEA') return s.includes('sea');
    return s.includes(activeChip.toLowerCase());
  };

  // Price and rating apply here too. They used to be wired to the 1:1 grid
  // only, so setting either one on this tab changed nothing at all — which is
  // most of why the pills read as having no effect.
  const classPriceBand = priceBandById(priceBand);
  const filteredGroupLessons = groupLessons
    .filter((l) => matchChip(l.subject))
    .filter((l) => scheduleMatchesDayTime(l.scheduleEntries, selectedDays, selectedBands))
    // Free classes sit at 0, so they appear under "Under TT$100" and "Any
    // price" and are correctly absent from every band starting at 100+.
    .filter((l) => priceInBand(l.monthlyPrice, classPriceBand))
    .filter((l) => selectedRating === null || (l.tutorRating !== null && l.tutorRating >= selectedRating))
    .filter((l) => matchesLocation({ classFormat: l.classFormat, venueRegionId: l.venueRegionId }, locationFilter))
    .filter((l) => !searchQuery || l.title.toLowerCase().includes(searchQuery.toLowerCase()) || l.tutor.toLowerCase().includes(searchQuery.toLowerCase()) || l.subject.toLowerCase().includes(searchQuery.toLowerCase()));

  // Still used by the empty state. The day/time toggles now edit the DRAFT
  // inside their popover (toggleDraftDay / toggleDraftBand) rather than
  // committing on every click.
  const scheduleFilterActive = selectedDays.length > 0 || selectedBands.length > 0;
  const toggleSave = (id: string) => setSavedItems((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

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
            // School is a 1:1-only filter, so drop it on the way out instead of
            // leaving it counted in "Clear all" while narrowing nothing.
            onClick={() => { setTab('lessons'); setSelectedSchool(''); setDraftSchool(''); }}
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
        </div>

        {/* Filter row — one pill per filter, each opening a popover with its own
            Apply. Replaces a full-width panel that pushed the results down and
            filtered live as you typed. */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterMenu
            label="Price"
            summary={priceSummary}
            onOpen={() => setDraftPriceBand(priceBand)}
            onApply={() => setPriceBand(draftPriceBand)}
            onClear={() => { setPriceBand(ANY_PRICE); setDraftPriceBand(ANY_PRICE); }}
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Price {tab === 'lessons' ? 'per month' : 'per hour'}
            </div>
            <div className="mt-2 space-y-0.5">
              {PRICE_BANDS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setDraftPriceBand(b.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition',
                    draftPriceBand === b.id
                      ? 'bg-brand-soft font-semibold text-forest'
                      : 'text-ink hover:bg-muted'
                  )}
                >
                  <span>{b.label}</span>
                  {draftPriceBand === b.id && <Check className="size-4 shrink-0" />}
                </button>
              ))}
            </div>
          </FilterMenu>

          <FilterMenu
            label="Rating"
            summary={ratingSummary}
            onOpen={() => setDraftRating(selectedRating)}
            onApply={() => setSelectedRating(draftRating)}
            onClear={() => { setSelectedRating(null); setDraftRating(null); }}
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Rating
            </div>
            <div className="mt-2 space-y-0.5">
              {RATING_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setDraftRating(opt.value)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition',
                    draftRating === opt.value
                      ? 'bg-brand-soft font-semibold text-forest'
                      : 'text-ink hover:bg-muted'
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {opt.value !== null && <Star className="size-3.5 fill-amber-500 text-amber-500" />}
                    {opt.label}
                  </span>
                  {draftRating === opt.value && <Check className="size-4 shrink-0" />}
                </button>
              ))}
            </div>
            {tab === 'lessons' && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                Classes are matched on their tutor&apos;s rating.
              </p>
            )}
          </FilterMenu>

          {/* Days / Time on both tabs: for classes it reads the recurring
              schedule, for tutors their weekly availability windows. */}
          <>
              <FilterMenu
                label="Days"
                summary={daysSummary}
                widthClass="w-80"
                onOpen={() => setDraftDays(selectedDays)}
                onApply={() => setSelectedDays(draftDays)}
                onClear={() => { setSelectedDays([]); setDraftDays([]); }}
              >
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Meets on
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {DAY_FILTER_OPTIONS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      aria-pressed={draftDays.includes(d.value)}
                      aria-label={d.label}
                      onClick={() => toggleDraftDay(d.value)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                        draftDays.includes(d.value)
                          ? 'border-brand bg-brand text-white'
                          : 'border-border bg-background text-muted-foreground hover:border-brand/40'
                      )}
                    >
                      {d.short}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  {tab === 'lessons'
                    ? 'One-off classes are hidden while a day filter is on.'
                    : 'Days the tutor takes 1:1 bookings.'}
                </p>
              </FilterMenu>

              <FilterMenu
                label="Time"
                summary={bandsSummary}
                onOpen={() => setDraftBands(selectedBands)}
                onApply={() => setSelectedBands(draftBands)}
                onClear={() => { setSelectedBands([]); setDraftBands([]); }}
              >
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Time of day
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {TIME_BANDS.map((b) => (
                    <button
                      key={b.value}
                      type="button"
                      aria-pressed={draftBands.includes(b.value)}
                      onClick={() => toggleDraftBand(b.value)}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                        draftBands.includes(b.value)
                          ? 'border-brand bg-brand text-white'
                          : 'border-border bg-background text-muted-foreground hover:border-brand/40'
                      )}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Times are in AST (Trinidad &amp; Tobago).
                </p>
              </FilterMenu>
          </>

          {tab === 'tutors' && institutions.length > 0 && (
            <FilterMenu
              label="School"
              summary={schoolSummary}
              widthClass="w-80"
              onOpen={() => setDraftSchool(selectedSchool)}
              onApply={() => setSelectedSchool(draftSchool)}
              onClear={() => { setSelectedSchool(''); setDraftSchool(''); }}
            >
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                School / institution
              </div>
              <select
                value={draftSchool}
                onChange={(e) => setDraftSchool(e.target.value)}
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">All schools</option>
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>{inst.name}</option>
                ))}
              </select>
            </FilterMenu>
          )}

          {/* Where a class meets. Lessons only — a 1:1 tutor has no venue, so
              on the tutors tab this would narrow nothing while looking as if it
              should. */}
          {tab === 'lessons' && (
            <LocationFilter value={locationFilter} onChange={setLocationFilter} regions={regions} />
          )}

          {anyFilterApplied && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-1 text-xs font-semibold text-brand-deep hover:underline"
            >
              Clear all
            </button>
          )}
        </div>

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
              {filteredGroupLessons.map((l) => (
                <ClassCard
                  key={l.id}
                  l={l}
                  enrolled={enrolledLessonIds.has(l.id)}
                  href={classHref(l.id)}
                  enrolledHref={enrolledClassHref(l.id)}
                />
              ))}
            </div>
          </>
        )}

        {/* 1:1 Tutors tab */}
        {tab === 'tutors' && (
          <>
            <div className="text-sm text-muted-foreground">
              {/* The full match count, not the page's — `pagedTutors.length`
                  read "12 tutors" on every page of a longer list. */}
              {loadingTutors ? 'Loading tutors…' : `${filteredTutors.length} tutor${filteredTutors.length === 1 ? '' : 's'} for 1:1 sessions`}
            </div>

            {loadingTutors ? (
              <div className="flex justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
              </div>
            ) : pagedTutors.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">
                <p className="font-semibold text-ink">No tutors match those filters</p>
                <p className="mt-1">
                  {hasActiveFilters
                    ? 'Try widening the price band, rating or availability.'
                    : 'Check back soon — new tutors are being listed.'}
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-3 px-4 py-2 rounded-xl bg-brand text-white text-xs font-semibold hover:bg-brand-deep transition"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {pagedTutors.map((tutor) => (
                  // This is the 1:1 marketplace, so the card opens the
                  // dedicated 1:1 booking route — NOT the class-led profile at
                  // /student/tutors/[id], which leads with "<tutor>'s classes"
                  // and Join-class buttons and is the wrong destination for
                  // someone shopping for a one-to-one lesson.
                  <div
                    key={tutor.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(tutorHref(tutor.id))}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(tutorHref(tutor.id)); } }}
                    className="group rounded-2xl bg-background border border-border p-4 hover:shadow-card hover:border-brand/40 transition-all flex gap-3 items-start cursor-pointer w-full min-w-0"
                  >
                    <UserAvatar avatarUrl={tutor.avatar_url} name={getDisplayName(tutor)} size={56} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-semibold text-ink truncate">{getDisplayName(tutor)}</h3>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {tutor.subjects.slice(0, 3).map((s) => s.name).join(' · ')}
                            {tutor.subjects.length > 3 && ` +${tutor.subjects.length - 3}`}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleSave(tutor.id); }}
                          className="size-8 rounded-full hover:bg-muted grid place-items-center shrink-0"
                        >
                          <Heart className={cn('size-4', savedItems.has(tutor.id) ? 'fill-coral text-coral' : 'text-muted-foreground')} />
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mt-1.5 text-xs">
                        {tutor.average_rating !== null ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold tabular-nums">
                            <Star className="size-3 fill-amber-500 text-amber-500" />
                            {tutor.average_rating.toFixed(1)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground font-semibold">
                            <Star className="size-3 text-muted-foreground" /> —
                          </span>
                        )}
                        {tutor.total_reviews > 0 && <span className="text-muted-foreground">({tutor.total_reviews} reviews)</span>}
                      </div>

                      {tutor.bio && <p className="text-xs text-muted-foreground mt-2 line-clamp-1">{tutor.bio}</p>}

                      {tutor.institution_name && (
                        <div className="text-[11px] text-muted-foreground mt-1">{tutor.institution_name}</div>
                      )}

                      <div className="flex items-end justify-between mt-3 pt-3 border-t border-border">
                        <div>
                          {tutor.subjects.length > 0 && (() => {
                            const minRate = Math.min(...tutor.subjects.map((s) => s.price_per_hour_ttd ?? 0));
                            return minRate > 0 ? (
                              <>
                                <span className="text-base font-bold text-ink">TT${minRate}</span>
                                <span className="text-[11px] text-muted-foreground">/hr</span>
                              </>
                            ) : (
                              <span className="text-sm text-muted-foreground">Rate not set</span>
                            );
                          })()}
                        </div>
                        <span className="text-xs font-semibold text-brand-deep group-hover:underline">View profile →</span>
                      </div>
                    </div>
                  </div>
                ))}
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
                  // Same rule as the card: the roster count is withheld until
                  // it argues for joining. The row disappears entirely rather
                  // than reading "Enrolled —".
                  {
                    label: 'Availability',
                    value: capacityLabel(joinLesson.seats.taken, joinLesson.seats.total),
                    show: capacityLabel(joinLesson.seats.taken, joinLesson.seats.total) !== null,
                  },
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

