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
import { Search, Star, Heart, Calendar, Clock, SlidersHorizontal, Users, GraduationCap, Flame, X, Check, Video } from 'lucide-react';

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
  day: string;
  time: string;
  monthlyPrice: number;
  seats: { taken: number; total: number | null };
  sessionLength: number | null;
  rating: number;
  tags: string[];
  color: string;
  emoji: string;
};

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

export default function FindTutorsPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [loadingTutors, setLoadingTutors] = useState(true);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedRating, setSelectedRating] = useState<string>('');
  const [selectedPrice, setSelectedPrice] = useState<string>('');
  const [selectedSchool, setSelectedSchool] = useState<string>('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<'relevance' | 'price_low' | 'rating_high'>('relevance');
  const [tab, setTab] = useState<'lessons' | 'tutors'>('lessons');
  const [activeChip, setActiveChip] = useState('All');
  const [savedItems, setSavedItems] = useState<Set<string>>(new Set());
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
        const res = await supabase.from('profiles').select(cols).eq('role', 'tutor');
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

      console.log('✅ Fetched tutor profiles:', tutorProfilesWithBanners?.length || 0);
      console.log('Tutor profiles data:', tutorProfilesWithBanners);

      const activeTutorProfiles = tutorProfilesWithBanners;
      const activeTutorIds = activeTutorProfiles.map((t) => t.id);

      console.log(`✅ Showing ${activeTutorProfiles.length} tutors (video provider filter disabled)`);

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
    } catch (error) {
      console.error('Error fetching tutors:', error);
    } finally {
      setLoadingTutors(false);
    }
  }

  const SUBJECT_STYLE: Record<string, { color: string; emoji: string }> = {
    math: { color: 'from-coral to-peach', emoji: '📐' },
    physics: { color: 'from-sky to-lavender', emoji: '⚛️' },
    chemistry: { color: 'from-brand-deep to-forest', emoji: '🧪' },
    biology: { color: 'from-brand to-brand-deep', emoji: '🧬' },
    english: { color: 'from-lavender to-brand-soft', emoji: '📚' },
    history: { color: 'from-peach to-coral', emoji: '📜' },
    economics: { color: 'from-peach to-coral', emoji: '📊' },
    information: { color: 'from-sky to-lavender', emoji: '💻' },
    spanish: { color: 'from-coral to-peach', emoji: '🇪🇸' },
    french: { color: 'from-sky to-lavender', emoji: '🇫🇷' },
    sea: { color: 'from-brand to-brand-deep', emoji: '✏️' },
    accounting: { color: 'from-peach to-coral', emoji: '📒' },
  };

  function getSubjectStyle(subject: string) {
    const lower = (subject || '').toLowerCase();
    for (const [key, val] of Object.entries(SUBJECT_STYLE)) {
      if (lower.includes(key)) return val;
    }
    return { color: 'from-brand to-brand-deep', emoji: '📖' };
  }

  async function fetchGroupLessons() {
    setLoadingGroupLessons(true);
    try {
      const res = await fetch('/api/groups?limit=50&sortBy=latest', { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok || payload?.success === false) { setGroupLessons([]); return; }

      const groups: any[] = payload?.data?.groups ?? [];

      // Mark already-enrolled groups using the current_user_membership field
      setEnrolledLessonIds(new Set(
        groups.filter((g: any) => g.current_user_membership !== null).map((g: any) => g.id)
      ));

      const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      const mapped: GroupLesson[] = groups.map((g: any) => {
        const next = g.next_occurrence?.scheduled_start_at;
        let day = '', time = '';
        if (next) {
          const d = new Date(next);
          day = DAY_NAMES[d.getDay()] + 's';
          time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
        const { color, emoji } = getSubjectStyle(g.subject || '');
        const price = Number(g.price_monthly ?? g.price_per_session ?? g.price_per_course ?? 0);
        return {
          id: g.id,
          title: g.name,
          tutor: g.tutor?.full_name || 'Unknown Tutor',
          tutorId: g.tutor_id,
          tutorHue: 145,
          subject: g.subject || 'General',
          level: g.form_level || g.difficulty || 'CSEC',
          day: day || 'Schedule TBD',
          time: time || '',
          monthlyPrice: price,
          seats: { taken: g.member_count ?? 0, total: g.max_students ?? null },
          sessionLength: g.session_length_minutes ?? null,
          rating: Number(g.tutor?.rating_average ?? 0),
          tags: [],
          color,
          emoji,
        };
      });
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
      router.push(`/student/groups/${joinLesson.id}`);
      return;
    }
    setJoiningLesson(true);
    try {
      const res = await fetch(`/api/groups/${joinLesson.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join lesson');
      setEnrolledLessonIds((s) => new Set([...s, joinLesson.id]));
      setJoinLesson(null);
      router.push(`/student/groups/${joinLesson.id}`);
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
    if (selectedRating) {
      const minRating = parseFloat(selectedRating);
      filtered = filtered.filter(tutor =>
        tutor.average_rating !== null && tutor.average_rating >= minRating
      );
    }

    // Filter by price
    if (selectedPrice) {
      if (selectedPrice === 'free') {
        // Only show tutors with at least one free subject
        filtered = filtered.filter(tutor =>
          tutor.subjects.some(s => s.price_per_hour_ttd === 0)
        );
      } else {
        const maxPrice = parseFloat(selectedPrice);
        filtered = filtered.filter(tutor =>
          tutor.subjects.some(s => s.price_per_hour_ttd <= maxPrice)
        );
      }
    }

    const minPrice = (t: Tutor) => {
      const prices = t.subjects.map((s) => s.price_per_hour_ttd);
      return prices.length ? Math.min(...prices) : Number.POSITIVE_INFINITY;
    };

    if (sortOrder === 'price_low') {
      filtered.sort((a, b) => minPrice(a) - minPrice(b));
    } else if (sortOrder === 'rating_high') {
      filtered.sort((a, b) => (b.average_rating ?? -1) - (a.average_rating ?? -1));
    } else if (profile?.subjects_of_study && profile.subjects_of_study.length > 0) {
      filtered.sort((a, b) => {
        const aMatchesSubjects = a.subjects.some((s) => profile.subjects_of_study?.includes(s.name));
        const bMatchesSubjects = b.subjects.some((s) => profile.subjects_of_study?.includes(s.name));

        if (aMatchesSubjects && !bMatchesSubjects) return -1;
        if (!aMatchesSubjects && bMatchesSubjects) return 1;

        const aRating = a.average_rating || 0;
        const bRating = b.average_rating || 0;
        return bRating - aRating;
      });
    } else {
      filtered.sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0));
    }

    return filtered;
  }, [tutors, searchQuery, selectedSubjects, selectedRating, selectedPrice, selectedSchool, profile, sortOrder]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, selectedSubjects, selectedRating, selectedPrice, selectedSchool, sortOrder]);

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

  const hasActiveFilters = searchQuery || selectedSubjects.length > 0 || selectedRating || selectedPrice || selectedSchool;

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedSubjects([]);
    setSelectedRating('');
    setSelectedPrice('');
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
    .filter((l) => !searchQuery || l.title.toLowerCase().includes(searchQuery.toLowerCase()) || l.tutor.toLowerCase().includes(searchQuery.toLowerCase()) || l.subject.toLowerCase().includes(searchQuery.toLowerCase()));

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
          <button className="hidden md:inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted rounded-xl">
            <SlidersHorizontal className="size-4" /> Filters
          </button>
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
              {loadingGroupLessons ? 'Loading lessons…' : `${filteredGroupLessons.length} lesson${filteredGroupLessons.length === 1 ? '' : 's'}`}
              {!loadingGroupLessons && searchQuery && <> matching &ldquo;<span className="text-ink font-medium">{searchQuery}</span>&rdquo;</>}
            </div>

            {loadingGroupLessons ? (
              <div className="flex justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
              </div>
            ) : filteredGroupLessons.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">
                <div className="text-3xl mb-3">📚</div>
                <p className="font-semibold text-ink">No group lessons yet</p>
                <p className="mt-1">Check back soon — tutors are adding new group classes.</p>
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
                    <div className={`relative h-24 bg-gradient-to-br ${l.color} flex items-end p-3`}>
                      {enrolledLessonIds.has(l.id) && (
                        <div className="absolute top-2.5 left-2.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand text-white">
                          Enrolled
                        </div>
                      )}
                      <button
                        onClick={() => toggleSave(l.id)}
                        className="absolute top-2.5 right-2.5 size-8 rounded-full bg-white/90 backdrop-blur grid place-items-center hover:bg-white"
                      >
                        <Heart className={cn('size-4', savedItems.has(l.id) ? 'fill-coral text-coral' : 'text-ink')} />
                      </button>
                      <div className="size-12 rounded-2xl bg-white grid place-items-center text-2xl shadow-md">{l.emoji}</div>
                    </div>
                    <div className="p-4 space-y-3 flex-1 flex flex-col">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-semibold text-ink leading-tight">{l.title}</h3>
                          <div className="flex items-center gap-1 text-sm shrink-0">
                            <Star className="size-3.5 fill-coral text-coral" />
                            <span className="font-semibold">{l.rating}</span>
                          </div>
                        </div>
                        <div className="mt-1.5 inline-flex items-center gap-2">
                          <TutorInitialAvatar name={l.tutor} size={22} />
                          <span className="text-sm text-muted-foreground">by {l.tutor}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{l.subject} · {l.level}</div>
                      </div>

                      {(lowStock || full) && (
                        <div className={cn('inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full self-start', full ? 'bg-muted text-muted-foreground' : 'bg-coral-soft text-coral')}>
                          <Flame className="size-3.5" />
                          {full ? 'Lesson full · join waitlist' : `Only ${remaining} spot${remaining === 1 ? '' : 's'} left!`}
                        </div>
                      )}

                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center gap-1.5 text-brand-deep font-medium">
                          <Calendar className="size-3.5" /> {l.day}
                        </div>
                        {l.time && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="size-3.5" /> {l.time}
                            {l.sessionLength && <span className="text-muted-foreground/70">· {formatDuration(l.sessionLength)}</span>}
                          </div>
                        )}
                        {!l.time && l.sessionLength && (
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
                            <>
                              <span className="text-lg font-bold text-ink">TT${l.monthlyPrice}</span>
                              <span className="text-xs text-muted-foreground">/month</span>
                            </>
                          ) : (
                            <span className="text-lg font-bold text-brand-deep">Free</span>
                          )}
                        </div>
                        {enrolledLessonIds.has(l.id) ? (
                          <Link
                            href={`/student/groups/${l.id}`}
                            className="px-3 py-1.5 rounded-xl bg-brand-soft text-forest text-xs font-semibold hover:bg-brand/20 transition"
                          >
                            View lesson →
                          </Link>
                        ) : (
                          <button
                            onClick={() => setJoinLesson(l)}
                            disabled={full}
                            className="px-3 py-1.5 rounded-xl bg-brand text-white text-xs font-semibold hover:bg-brand-deep transition disabled:opacity-50"
                          >
                            {full ? 'Waitlist' : 'Join lesson'}
                          </button>
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
              {loadingTutors ? 'Loading tutors…' : `${pagedTutors.length} tutor${pagedTutors.length === 1 ? '' : 's'} for 1:1 sessions`}
            </div>

            {loadingTutors ? (
              <div className="flex justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" />
              </div>
            ) : pagedTutors.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">No tutors found. Try adjusting your search.</div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {pagedTutors.map((tutor) => (
                  <div
                    key={tutor.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/student/tutors/${tutor.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/student/tutors/${tutor.id}`); } }}
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
                        <span className="inline-flex items-center gap-1 font-semibold text-ink">
                          <Star className="size-3 fill-coral text-coral" />
                          {tutor.average_rating !== null ? tutor.average_rating.toFixed(1) : '—'}
                        </span>
                        {tutor.total_reviews > 0 && <span className="text-muted-foreground">({tutor.total_reviews})</span>}
                      </div>

                      {tutor.bio && <p className="text-xs text-muted-foreground mt-2 line-clamp-1">{tutor.bio}</p>}

                      {tutor.institution_name && (
                        <div className="text-[11px] text-muted-foreground mt-1">{tutor.institution_name}</div>
                      )}

                      <div className="flex items-end justify-between mt-3 pt-3 border-t border-border">
                        <div>
                          {tutor.subjects.length > 0 && (
                            <>
                              <span className="text-base font-bold text-ink">TT${Math.min(...tutor.subjects.map((s) => s.price_per_hour_ttd))}</span>
                              <span className="text-[11px] text-muted-foreground">/hr</span>
                            </>
                          )}
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
            <div className={`relative h-24 bg-gradient-to-br ${joinLesson.color} flex items-end p-4`}>
              <button onClick={() => setJoinLesson(null)} className="absolute top-3 right-3 size-8 rounded-full bg-white/90 grid place-items-center hover:bg-white">
                <X className="size-4 text-ink" />
              </button>
              <div className="size-12 rounded-2xl bg-white grid place-items-center text-2xl shadow-md">{joinLesson.emoji}</div>
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
                  { label: 'Price', value: joinLesson.monthlyPrice > 0 ? `TT$${joinLesson.monthlyPrice}/month` : 'Free', show: true },
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
                  {joiningLesson ? 'Enrolling…' : `Confirm — TT$${joinLesson.monthlyPrice}/month`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

