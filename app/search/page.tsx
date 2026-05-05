'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types/database';
import { getDisplayName } from '@/lib/utils/displayName';
import Link from 'next/link';

type ProfileWithRating = Profile & {
  average_rating?: number | null;
  total_reviews?: number;
  subject_price?: number | null;
  topComment?: {
    comment: string;
    stars: number;
    student_name: string;
  } | null;
};

const TUTORS_PER_PAGE = 10;

const glassPanel =
  'rounded-3xl border border-white/55 bg-gradient-to-br from-white/65 via-white/40 to-white/[0.22] shadow-[0_8px_32px_rgba(5,46,22,0.06),inset_0_1px_0_rgba(255,255,255,0.75),inset_0_-12px_24px_rgba(255,255,255,0.12)] ring-1 ring-inset ring-white/40 backdrop-blur-2xl backdrop-saturate-150';

const glassPanelHover =
  'transition-all duration-300 hover:border-white/75 hover:from-white/78 hover:via-white/52 hover:to-white/30 hover:shadow-[0_16px_48px_rgba(25,147,88,0.12),inset_0_1px_0_rgba(255,255,255,0.9)] hover:ring-white/55';

const glassInput =
  'rounded-lg border border-white/50 bg-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-md backdrop-saturate-150 ring-1 ring-inset ring-white/35 focus:border-itutor-green/50 focus:outline-none focus:ring-1 focus:ring-itutor-green/40';

const glassIconSm =
  'inline-flex shrink-0 items-center justify-center rounded-lg border border-white/55 bg-gradient-to-br from-white/55 via-white/30 to-white/[0.18] p-1 shadow-[0_4px_16px_rgba(5,46,22,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md ring-1 ring-inset ring-white/40';

export default function SearchResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subject = searchParams.get('subject');
  const mode = searchParams.get('mode') || 'tutor';
  const isBrowseAll = !subject || mode !== 'subject';

  const [results, setResults] = useState<ProfileWithRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    minRating: 0,
    school: 'all',
    verifiedOnly: false,
    maxPrice: 0
  });
  const [availableSchools, setAvailableSchools] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [filters, subject, mode]);

  useEffect(() => {
    const max = Math.max(1, Math.ceil(results.length / TUTORS_PER_PAGE));
    setPage((p) => Math.min(p, max));
  }, [results.length]);

  useEffect(() => {
    fetchSchools();
    if (subject && mode === 'subject') performSearch();
    else fetchAllTutors();
  }, [subject, mode, filters]);

  const totalPages = Math.max(1, Math.ceil(results.length / TUTORS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const paginatedResults = results.slice(
    (currentPage - 1) * TUTORS_PER_PAGE,
    currentPage * TUTORS_PER_PAGE
  );

  async function fetchSchools() {
    try {
      const { data: tutors } = await supabase
        .from('profiles')
        .select('school')
        .eq('role', 'tutor');

      if (tutors) {
        const schools = new Set<string>();
        tutors.forEach(t => {
          if (t.school) schools.add(t.school);
        });
        setAvailableSchools(Array.from(schools).sort());
      }
    } catch (err) {
      console.error('Error fetching schools:', err);
    }
  }

  async function performSearch() {
    setLoading(true);
    try {
      // Find subject IDs matching the search
      const { data: subjectsData, error: subjectsError } = await supabase
        .from('subjects')
        .select('id, name, label')
        .ilike('name', `%${subject}%`);

      console.log('🔍 Searching for subject:', subject);
      console.log('📚 Found subjects:', subjectsData);

      if (subjectsError) {
        console.error('❌ Error fetching subjects:', subjectsError);
      }

      if (!subjectsData || subjectsData.length === 0) {
        console.log('⚠️ No subjects found matching:', subject);
        setResults([]);
        setLoading(false);
        return;
      }

      const subjectIds = subjectsData.map(s => s.id);
      
      // Find tutors teaching these subjects
      const { data: tutorSubjectsData, error: tutorSubjectsError } = await supabase
        .from('tutor_subjects')
        .select('tutor_id, subject_id, price_per_hour_ttd')
        .in('subject_id', subjectIds);

      console.log('👨‍🏫 Found tutor_subjects entries:', tutorSubjectsData?.length || 0);

      if (tutorSubjectsError) {
        console.error('❌ Error fetching tutor_subjects:', tutorSubjectsError);
      }

      if (!tutorSubjectsData || tutorSubjectsData.length === 0) {
        console.log('⚠️ No tutors found teaching these subjects. This might mean:');
        console.log('   - Test tutors need entries in tutor_subjects table');
        console.log('   - Or no tutors have been set up to teach', subjectsData.map(s => s.label).join(', '));
        setResults([]);
        setLoading(false);
        return;
      }

      // Create a map of tutor_id -> price for the searched subject
      const tutorPriceMap = new Map<string, number>();
      tutorSubjectsData.forEach(ts => {
        if (!tutorPriceMap.has(ts.tutor_id)) {
          tutorPriceMap.set(ts.tutor_id, ts.price_per_hour_ttd);
        }
      });

      const tutorIds = [...new Set(tutorSubjectsData.map(ts => ts.tutor_id))];

      // Build tutor query
      let queryBuilder = supabase
        .from('profiles')
        .select('*')
        .eq('role', 'tutor')
        .in('id', tutorIds);

      // Apply filters
      if (filters.school !== 'all') {
        queryBuilder = queryBuilder.eq('school', filters.school);
      }

      if (filters.verifiedOnly) {
        queryBuilder = queryBuilder.eq('tutor_verification_status', 'VERIFIED');
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;

      // Fetch ratings for all tutors
      if (data && data.length > 0) {
        const { data: ratingsData } = await supabase
          .from('ratings')
          .select('tutor_id, stars')
          .in('tutor_id', data.map(p => p.id));

        // Calculate average ratings
        const ratingsMap = new Map<string, { average: number; count: number }>();
        if (ratingsData) {
          ratingsData.forEach(rating => {
            const existing = ratingsMap.get(rating.tutor_id);
            if (existing) {
              existing.average = (existing.average * existing.count + rating.stars) / (existing.count + 1);
              existing.count += 1;
            } else {
              ratingsMap.set(rating.tutor_id, { average: rating.stars, count: 1 });
            }
          });
        }

        // Fetch top-rated comments (sorted by popularity)
        const { data: commentsData } = await supabase
          .from('ratings')
          .select(`
            tutor_id,
            stars,
            comment,
            helpful_count,
            student:student_id (
              display_name,
              full_name,
              username
            )
          `)
          .in('tutor_id', data.map(p => p.id))
          .not('comment', 'is', null)
          .order('helpful_count', { ascending: false, nullsFirst: false })
          .order('stars', { ascending: false });

        const topCommentsMap = new Map();
        if (commentsData) {
          commentsData.forEach(comment => {
            if (!topCommentsMap.has(comment.tutor_id)) {
              const student = comment.student as any;
              topCommentsMap.set(comment.tutor_id, {
                comment: comment.comment,
                stars: comment.stars,
                student_name: student?.display_name || student?.full_name || student?.username || 'Anonymous'
              });
            }
          });
        }

        // Attach ratings and top comments to profiles
        let profilesWithRatings = data.map(profile => ({
          ...profile,
          average_rating: ratingsMap.get(profile.id)?.average || 0,
          total_reviews: ratingsMap.get(profile.id)?.count || 0,
          topComment: topCommentsMap.get(profile.id) || null,
          subject_price: tutorPriceMap.get(profile.id) || null
        }));

        // Debug: Log verification status
        console.log('Tutors with verification status:', profilesWithRatings.map(p => ({
          name: p.full_name,
          verified: p.tutor_verification_status
        })));

        // Filter by minimum rating
        if (filters.minRating > 0) {
          profilesWithRatings = profilesWithRatings.filter(
            p => p.average_rating !== null && p.average_rating >= filters.minRating
          );
        }

        if (filters.maxPrice > 0) {
          profilesWithRatings = profilesWithRatings.filter(
            p => p.subject_price !== null && p.subject_price <= filters.maxPrice
          );
        }

        // Sort: verified first, then by rating (high to low)
        profilesWithRatings.sort((a, b) => {
          // Verified tutors first
          const aVerified = a.tutor_verification_status === 'VERIFIED' ? 1 : 0;
          const bVerified = b.tutor_verification_status === 'VERIFIED' ? 1 : 0;
          if (aVerified !== bVerified) return bVerified - aVerified;

          // Then by rating (highest first)
          const aRating = a.average_rating || 0;
          const bRating = b.average_rating || 0;
          return bRating - aRating;
        });

        setResults(profilesWithRatings);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllTutors() {
    setLoading(true);
    try {
      let queryBuilder = supabase.from('profiles').select('*').eq('role', 'tutor');

      if (filters.school !== 'all') {
        queryBuilder = queryBuilder.eq('school', filters.school);
      }

      if (filters.verifiedOnly) {
        queryBuilder = queryBuilder.eq('tutor_verification_status', 'VERIFIED');
      }

      const { data, error } = await queryBuilder;
      if (error) throw error;

      if (!data || data.length === 0) {
        setResults([]);
        return;
      }

      const tutorIds = data.map((p) => p.id);

      // Get min price per tutor (used for browse-all sorting/filtering)
      const { data: tutorSubjects, error: tutorSubjectsError } = await supabase
        .from('tutor_subjects')
        .select('tutor_id, price_per_hour_ttd')
        .in('tutor_id', tutorIds);

      if (tutorSubjectsError) {
        console.error('Error fetching tutor_subjects:', tutorSubjectsError);
      }

      const minPriceByTutor = new Map<string, number>();
      for (const ts of tutorSubjects || []) {
        const tid = ts.tutor_id as string;
        const price = Number(ts.price_per_hour_ttd);
        if (!Number.isFinite(price)) continue;
        const existing = minPriceByTutor.get(tid);
        if (existing === undefined || price < existing) minPriceByTutor.set(tid, price);
      }

      // Ratings summary (server-side, bypasses RLS)
      const ratingsSummaryRes = await fetch('/api/public/tutors/ratings-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorIds }),
      });
      const ratingsSummaryJson = await ratingsSummaryRes.json().catch(() => ({}));
      const ratingsByTutorId = (ratingsSummaryJson?.byTutorId || {}) as Record<
        string,
        { ratingCount: number; averageRating: number | null }
      >;

      let profilesWithRatings = data.map((profile) => {
        const summary = ratingsByTutorId[profile.id];
        const count = Number(summary?.ratingCount || 0);
        const avgRating = count > 0 && summary?.averageRating != null ? Number(summary.averageRating) : null;
        const price = minPriceByTutor.get(profile.id);

        return {
          ...profile,
          average_rating: avgRating,
          total_reviews: count,
          topComment: null,
          subject_price: price ?? null,
        };
      });

      if (filters.minRating > 0) {
        profilesWithRatings = profilesWithRatings.filter(
          (p) => p.average_rating !== null && p.average_rating >= filters.minRating
        );
      }

      if (filters.maxPrice > 0) {
        profilesWithRatings = profilesWithRatings.filter(
          (p) => p.subject_price !== null && p.subject_price <= filters.maxPrice
        );
      }

      profilesWithRatings.sort((a, b) => {
        const aVerified = a.tutor_verification_status === 'VERIFIED' ? 1 : 0;
        const bVerified = b.tutor_verification_status === 'VERIFIED' ? 1 : 0;
        if (aVerified !== bVerified) return bVerified - aVerified;

        const aRating = a.average_rating || 0;
        const bRating = b.average_rating || 0;
        return bRating - aRating;
      });

      setResults(profilesWithRatings);
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-zinc-100">
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-zinc-100"
        aria-hidden
        style={{
          backgroundImage: `
            linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(250,250,250,0.95) 50%, rgba(255,255,255,0.9) 100%),
            linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px),
            linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 32px 32px, 32px 32px',
        }}
      />
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-black bg-black shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex-shrink-0">
              <img
                src="/assets/logo/itutor-logo-dark.png"
                alt="iTutor"
                className="h-12 w-auto"
              />
            </Link>
            <div className="flex items-center gap-3">
              <Link
                href="/signup"
                className="px-4 py-2 text-sm font-semibold text-white hover:text-itutor-green transition-colors"
              >
                Sign Up
              </Link>
              <Link
                href="/login"
                className="px-4 py-2 text-sm font-semibold text-gray-900 bg-itutor-green hover:bg-emerald-500 rounded-lg transition-colors"
              >
                Log In
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <button
          type="button"
          onClick={() => router.back()}
          className={`mb-6 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-itutor-green ${glassPanel} ${glassPanelHover} hover:gap-3`}
        >
          <span className={glassIconSm}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </span>
          Back
        </button>

        {/* Header Section */}
        <div className={`mb-8 p-4 sm:p-8 ${glassPanel} ${glassPanelHover}`}>
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold bg-gradient-to-r from-gray-900 via-itutor-green to-emerald-600 bg-clip-text text-transparent mb-3 break-words">
            {isBrowseAll ? 'Browse iTutors' : `iTutors teaching ${subject}`}
          </h1>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm sm:text-base sm:px-4 ${glassPanel} ring-white/50`}
            >
              <span className={glassIconSm}>
                <svg className="h-4 w-4 text-itutor-green sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </span>
              <span className="font-bold text-gray-900 whitespace-nowrap">
                {loading
                  ? 'Searching...'
                  : isBrowseAll && results.length > 0
                    ? '100+ iTutors found'
                    : `${results.length} ${results.length === 1 ? 'iTutor' : 'iTutors'} found`}
              </span>
            </div>
            {!loading && results.length > 0 && (
              <div
                className={`flex items-center gap-2 rounded-full border border-emerald-300/35 bg-gradient-to-br from-white/70 via-emerald-50/40 to-white/[0.22] px-3 py-2 shadow-[0_8px_24px_rgba(25,147,88,0.08),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-xl backdrop-saturate-150 ring-1 ring-inset ring-white/45 sm:px-4`}
              >
                <span className={glassIconSm}>
                  <svg className="h-3 w-3 text-itutor-green sm:h-4 sm:w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
                <span className="text-xs font-semibold text-emerald-900 sm:text-sm whitespace-nowrap">Verified iTutors shown first</span>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className={`mb-8 p-4 sm:p-5 ${glassPanel} ${glassPanelHover}`}>
          <div className="mb-3 flex items-center gap-2">
            <span className={`${glassIconSm} rounded-xl p-2`}>
              <svg className="h-4 w-4 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </span>
            <h2 className="text-lg font-bold text-gray-900 sm:text-xl">Filters</h2>
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end lg:flex-nowrap lg:gap-3">
            {/* Rating */}
            <div className="min-w-0 flex-1 sm:min-w-[8.5rem] lg:min-w-0">
              <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                <span className={`${glassIconSm} !p-1`}>
                  <svg className="h-3 w-3 shrink-0 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </span>
                Rating
              </label>
              <select
                value={filters.minRating}
                onChange={(e) => setFilters({ ...filters, minRating: Number(e.target.value) })}
                className={`h-9 w-full min-w-0 px-2 py-1 text-sm font-medium text-gray-800 ${glassInput}`}
              >
                <option value="0">Any</option>
                <option value="3">3+ stars</option>
                <option value="4">4+ stars</option>
                <option value="4.5">4.5+ stars</option>
                <option value="5">5 stars</option>
              </select>
            </div>
            {/* Price */}
            <div className="min-w-0 flex-1 sm:min-w-[8.5rem] lg:min-w-0">
              <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                <span className={`${glassIconSm} !p-1 text-xs leading-none`} aria-hidden>
                  💰
                </span>
                Max price
              </label>
              <select
                value={filters.maxPrice}
                onChange={(e) => setFilters({ ...filters, maxPrice: Number(e.target.value) })}
                className={`h-9 w-full min-w-0 px-2 py-1 text-sm font-medium text-gray-800 ${glassInput}`}
              >
                <option value="0">Any</option>
                <option value="50">≤ $50/hr</option>
                <option value="100">≤ $100/hr</option>
                <option value="150">≤ $150/hr</option>
                <option value="200">≤ $200/hr</option>
                <option value="300">≤ $300/hr</option>
              </select>
            </div>
            {/* School */}
            <div className="min-w-0 flex-[1.15] sm:min-w-[10rem] lg:min-w-0 lg:flex-1">
              <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                <span className={`${glassIconSm} !p-1`}>
                  <svg className="h-3 w-3 shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </span>
                School
              </label>
              <select
                value={filters.school}
                onChange={(e) => setFilters({ ...filters, school: e.target.value })}
                className={`h-9 w-full min-w-0 px-2 py-1 text-sm font-medium text-gray-800 ${glassInput}`}
              >
                <option value="all">All schools</option>
                {availableSchools.map((school) => (
                  <option key={school} value={school}>
                    {school}
                  </option>
                ))}
              </select>
            </div>
            {/* Verified */}
            <div className="flex min-w-0 flex-1 flex-col justify-end sm:min-w-[11rem] lg:shrink-0 lg:grow-0">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                <span className={`${glassIconSm} !p-1`}>
                  <svg className="h-3 w-3 shrink-0 text-itutor-green" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
                Verified
              </div>
              <label className={`flex h-9 cursor-pointer items-center gap-2 px-2.5 transition-colors hover:border-itutor-green/45 ${glassInput}`}>
                <input
                  type="checkbox"
                  checked={filters.verifiedOnly}
                  onChange={(e) => setFilters({ ...filters, verifiedOnly: e.target.checked })}
                  className="h-3.5 w-3.5 shrink-0 rounded border-gray-300 text-itutor-green focus:ring-itutor-green"
                />
                <span className="truncate text-xs font-semibold text-gray-800">Verified only</span>
              </label>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setFilters({ minRating: 0, school: 'all', verifiedOnly: false, maxPrice: 0 })}
            className="mt-3 text-xs font-semibold text-gray-600 transition-colors hover:text-itutor-green"
          >
            ✕ Clear all filters
          </button>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-20">
            <svg className="w-20 h-20 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xl text-gray-600 mb-2">There are no iTutors teaching this subject yet</p>
            <p className="text-gray-500">Try adjusting your filters or search for a different subject</p>
          </div>
        ) : (
          <div className="space-y-6">
            {paginatedResults.map((tutor) => (
              <Link
                key={tutor.id}
                href={`/tutors/${tutor.id}`}
                className={`group block ${glassPanel} ${glassPanelHover} hover:scale-[1.01]`}
              >
                <div className="p-4 sm:p-6 md:p-8">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0 mx-auto sm:mx-0">
                      <img
                        src={tutor.avatar_url || '/default-avatar.png'}
                        alt={getDisplayName(tutor)}
                        className="h-20 w-20 rounded-full object-cover sm:h-24 sm:w-24"
                      />
                      {tutor.tutor_verification_status === 'VERIFIED' && (
                        <div className="absolute -bottom-2 -right-2 rounded-full border border-white/50 bg-gradient-to-br from-itutor-green/90 to-emerald-700/85 p-2 shadow-[0_6px_20px_rgba(25,147,88,0.35),inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-md ring-2 ring-white/70">
                          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 w-full">
                      {/* Name and Rating */}
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mb-4">
                        <h3 className="font-extrabold text-xl sm:text-2xl md:text-3xl text-gray-900 truncate max-w-full">{getDisplayName(tutor)}</h3>
                        <div className="flex items-center gap-2 bg-gradient-to-r from-yellow-50 to-orange-50 px-3 sm:px-4 py-2 rounded-full border-2 border-yellow-200 shadow-sm flex-shrink-0">
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map(star => (
                              <svg
                                key={star}
                                className={`w-4 h-4 sm:w-5 sm:h-5 ${star <= Math.round(tutor.average_rating || 0) ? 'text-yellow-400 drop-shadow-sm' : 'text-gray-300'}`}
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                            ))}
                          </div>
                          <span className="text-lg sm:text-xl font-extrabold text-gray-900">{(tutor.average_rating || 0).toFixed(1)}</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-600 whitespace-nowrap">
                            ({tutor.total_reviews || 0})
                          </span>
                        </div>
                      </div>

                      {/* Bio */}
                      {tutor.bio && (
                        <p className="text-xs sm:text-sm text-gray-700 mb-3 sm:mb-4 line-clamp-2 text-center sm:text-left">
                          {tutor.bio}
                        </p>
                      )}

                      {/* Top Comment */}
                      {tutor.topComment && (
                        <div className="mb-3 sm:mb-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg p-3 sm:p-4 border-2 border-yellow-200 shadow-sm">
                          <div className="flex items-center gap-1 mb-2 flex-wrap">
                            {[...Array(tutor.topComment.stars)].map((_, i) => (
                              <span key={i} className="text-yellow-400 text-sm sm:text-base">★</span>
                            ))}
                            <span className="text-xs sm:text-sm text-gray-600 ml-2 font-semibold">• {tutor.topComment.student_name}</span>
                          </div>
                          <p className="text-xs sm:text-sm text-gray-800 italic line-clamp-2 font-medium">
                            "{tutor.topComment.comment}"
                          </p>
                        </div>
                      )}

                      {/* School and Country */}
                      <div className="flex flex-wrap gap-2 sm:gap-3 mb-3 sm:mb-4 justify-center sm:justify-start">
                        {tutor.school && (
                          <span className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 font-semibold rounded-full text-xs sm:text-sm border border-blue-200 shadow-sm max-w-full">
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            <span className="truncate">{tutor.school}</span>
                          </span>
                        )}
                        {tutor.country && (
                          <span className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 font-semibold rounded-full text-xs sm:text-sm border border-green-200 shadow-sm flex-shrink-0">
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {tutor.country}
                          </span>
                        )}
                      </div>

                    </div>

                    {/* Arrow - Hidden on mobile, shown on desktop */}
                    <div className="hidden sm:flex flex-shrink-0 bg-gradient-to-br from-itutor-green to-emerald-600 rounded-full p-3 shadow-lg group-hover:scale-110 transition-transform">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </Link>
            ))}

            <nav
              className="flex flex-col items-center gap-3 border-t border-emerald-200/30 pt-8 sm:flex-row sm:justify-center sm:gap-4"
              aria-label="Tutor results pages"
            >
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => {
                  setPage((p) => Math.max(1, p - 1));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/55 bg-gradient-to-br from-white/65 via-white/40 to-white/[0.22] text-itutor-green shadow-[0_8px_32px_rgba(5,46,22,0.06),inset_0_1px_0_rgba(255,255,255,0.75),inset_0_-12px_24px_rgba(255,255,255,0.12)] ring-1 ring-inset ring-white/40 backdrop-blur-2xl backdrop-saturate-150 transition-all duration-300 hover:scale-[1.05] hover:border-white/75 hover:from-white/78 hover:via-white/52 hover:to-white/30 hover:shadow-[0_16px_48px_rgba(25,147,88,0.14),inset_0_1px_0_rgba(255,255,255,0.9)] hover:ring-white/55 disabled:pointer-events-none disabled:opacity-40 disabled:hover:scale-100"
                aria-label="Previous page"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <p className="inline-flex flex-col items-center gap-0.5 rounded-2xl border border-white/55 bg-gradient-to-br from-white/65 via-white/40 to-white/[0.22] px-5 py-3 text-center shadow-[0_8px_32px_rgba(5,46,22,0.06),inset_0_1px_0_rgba(255,255,255,0.75),inset_0_-12px_24px_rgba(255,255,255,0.12)] ring-1 ring-inset ring-white/40 backdrop-blur-2xl backdrop-saturate-150 sm:flex-row sm:gap-2 sm:py-2.5">
                <span className="text-sm font-bold tabular-nums text-gray-900">
                  Page {currentPage} of {totalPages}
                </span>
                <span className="text-xs font-medium tabular-nums text-gray-600 sm:text-sm">
                  {results.length} {results.length === 1 ? 'iTutor' : 'iTutors'}
                </span>
              </p>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => {
                  setPage((p) => Math.min(totalPages, p + 1));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/55 bg-gradient-to-br from-white/65 via-white/40 to-white/[0.22] text-itutor-green shadow-[0_8px_32px_rgba(5,46,22,0.06),inset_0_1px_0_rgba(255,255,255,0.75),inset_0_-12px_24px_rgba(255,255,255,0.12)] ring-1 ring-inset ring-white/40 backdrop-blur-2xl backdrop-saturate-150 transition-all duration-300 hover:scale-[1.05] hover:border-white/75 hover:from-white/78 hover:via-white/52 hover:to-white/30 hover:shadow-[0_16px_48px_rgba(25,147,88,0.14),inset_0_1px_0_rgba(255,255,255,0.9)] hover:ring-white/55 disabled:pointer-events-none disabled:opacity-40 disabled:hover:scale-100"
                aria-label="Next page"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}

