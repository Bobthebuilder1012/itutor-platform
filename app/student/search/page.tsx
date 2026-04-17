'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types/database';
import { getDisplayName } from '@/lib/utils/displayName';
import { profileBannerDisplayUrl } from '@/lib/utils/profileBannerDisplayUrl';
import DashboardLayout from '@/components/DashboardLayout';
import UserAvatar from '@/components/UserAvatar';
import VerifiedBadge from '@/components/VerifiedBadge';

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

export default function StudentSearchResultsPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const subject = searchParams.get('subject');
  const mode = searchParams.get('mode') || 'tutor';

  const [results, setResults] = useState<ProfileWithRating[]>([]);
  const [loading, setLoading] = useState(true);
  const paidClassesEnabled = process.env.NEXT_PUBLIC_ENABLE_PAID_SESSIONS === 'true';
  const [filters, setFilters] = useState({
    minRating: 0,
    school: 'all',
    verifiedOnly: false,
    maxPrice: 0
  });
  const [availableSchools, setAvailableSchools] = useState<string[]>([]);

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'student') {
      router.push('/login');
      return;
    }

    if (subject && mode === 'subject') {
      performSearch();
      fetchSchools();
    }
  }, [profile, profileLoading, subject, mode, filters]);

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
      const { data: subjectsData } = await supabase
        .from('subjects')
        .select('id')
        .or(`name.ilike.%${subject}%,label.ilike.%${subject}%`);

      if (!subjectsData || subjectsData.length === 0) {
        setResults([]);
        setLoading(false);
        return;
      }

      const subjectIds = subjectsData.map(s => s.id);
      
      const { data: tutorSubjectsData } = await supabase
        .from('tutor_subjects')
        .select('tutor_id, subject_id, price_per_hour_ttd')
        .in('subject_id', subjectIds);

      if (!tutorSubjectsData || tutorSubjectsData.length === 0) {
        setResults([]);
        setLoading(false);
        return;
      }

      // Create a map of tutor_id -> price for the searched subject
      const tutorPriceMap = new Map<string, number>();
      tutorSubjectsData.forEach(ts => {
        if (!tutorPriceMap.has(ts.tutor_id)) {
          tutorPriceMap.set(ts.tutor_id, paidClassesEnabled ? ts.price_per_hour_ttd : 0);
        }
      });

      const tutorIds = [...new Set(tutorSubjectsData.map(ts => ts.tutor_id))];

      let queryBuilder = supabase
        .from('profiles')
        .select('*')
        .eq('role', 'tutor')
        .in('id', tutorIds);

      if (filters.school !== 'all') {
        queryBuilder = queryBuilder.eq('school', filters.school);
      }

      if (filters.verifiedOnly) {
        queryBuilder = queryBuilder.eq('tutor_verification_status', 'VERIFIED');
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;

      if (data && data.length > 0) {
        const { data: ratingsData } = await supabase
          .from('ratings')
          .select('tutor_id, stars')
          .in('tutor_id', data.map(p => p.id));

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

        let profilesWithRatings = data.map(profile => ({
          ...profile,
          average_rating: ratingsMap.get(profile.id)?.average || 0,
          total_reviews: ratingsMap.get(profile.id)?.count || 0,
          topComment: topCommentsMap.get(profile.id) || null,
          subject_price: tutorPriceMap.get(profile.id) || null
        }));

        console.log('Student search - Tutors:', profilesWithRatings.map(p => ({
          name: p.full_name,
          verified: p.tutor_verification_status
        })));

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

        profilesWithRatings.sort((a, b) => {
          const aVerified = a.tutor_verification_status === 'VERIFIED' ? 1 : 0;
          const bVerified = b.tutor_verification_status === 'VERIFIED' ? 1 : 0;
          if (aVerified !== bVerified) return bVerified - aVerified;

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

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  if (!subject || mode !== 'subject') {
    return (
      <DashboardLayout role="student" userName={getDisplayName(profile)}>
        <div className="text-center py-12">
          <p className="text-gray-600">No search query provided</p>
          <button
            onClick={() => router.back()}
            className="text-itutor-green hover:underline mt-2"
          >
            Go back
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="student" userName={getDisplayName(profile)}>
      <div className="px-4 py-6 sm:px-0 max-w-7xl mx-auto bg-gradient-to-br from-transparent via-green-50/20 to-blue-50/20 rounded-3xl">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="mb-6 text-itutor-green hover:text-emerald-600 flex items-center gap-2 transition-all font-semibold hover:gap-3 hover:scale-105"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>

        {/* Header */}
        <div className="mb-8 bg-gradient-to-r from-white via-green-50 to-white rounded-2xl p-8 shadow-lg border-2 border-green-100">
          <h1 className="text-5xl font-extrabold bg-gradient-to-r from-gray-900 via-itutor-green to-emerald-600 bg-clip-text text-transparent mb-3">
            iTutors teaching {subject}
          </h1>
          <div className="flex items-center gap-3 text-gray-700">
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-200">
              <svg className="w-5 h-5 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span className="font-bold text-gray-900">
                {loading ? 'Searching...' : `${results.length} ${results.length === 1 ? 'iTutor' : 'iTutors'} found`}
              </span>
            </div>
            {!loading && results.length > 0 && (
              <div className="flex items-center gap-2 bg-itutor-green/10 px-4 py-2 rounded-full border border-itutor-green/30">
                <svg className="w-4 h-4 text-itutor-green" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-semibold text-itutor-green">Verified iTutors shown first</span>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-xl p-8 mb-8 border-2 border-gray-100 hover:shadow-2xl transition-shadow">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gradient-to-br from-itutor-green to-emerald-600 rounded-lg shadow-md">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Filters</h2>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Rating</label>
              <select
                value={filters.minRating}
                onChange={(e) => setFilters({ ...filters, minRating: Number(e.target.value) })}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
              >
                <option value="0">Any Rating</option>
                <option value="3">3+ Stars</option>
                <option value="4">4+ Stars</option>
                <option value="4.5">4.5+ Stars</option>
                <option value="5">5 Stars Only</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Maximum Price</label>
              <select
                value={filters.maxPrice}
                onChange={(e) => setFilters({ ...filters, maxPrice: Number(e.target.value) })}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
              >
                <option value="0">Any Price</option>
                <option value="50">Up to $50/hr</option>
                <option value="100">Up to $100/hr</option>
                <option value="150">Up to $150/hr</option>
                <option value="200">Up to $200/hr</option>
                <option value="300">Up to $300/hr</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">School</label>
              <select
                value={filters.school}
                onChange={(e) => setFilters({ ...filters, school: e.target.value })}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
              >
                <option value="all">All Schools</option>
                {availableSchools.map(school => (
                  <option key={school} value={school}>{school}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Verification Status</label>
              <label className="flex items-center gap-3 px-4 py-2 border-2 border-gray-300 rounded-lg cursor-pointer hover:border-itutor-green transition">
                <input
                  type="checkbox"
                  checked={filters.verifiedOnly}
                  onChange={(e) => setFilters({ ...filters, verifiedOnly: e.target.checked })}
                  className="w-5 h-5 text-itutor-green rounded focus:ring-itutor-green"
                />
                <span className="text-gray-900 font-medium">Verified Only</span>
              </label>
            </div>
          </div>

          <button
            onClick={() => setFilters({ minRating: 0, school: 'all', verifiedOnly: false, maxPrice: 0 })}
            className="mt-4 text-sm text-gray-600 hover:text-itutor-green transition font-medium"
          >
            Clear all filters
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
            <p className="text-xl text-gray-600 mb-2">No iTutors found</p>
            <p className="text-gray-500">Try adjusting your filters or search for a different subject</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {results.map((tutor) => {
              const subjectTags =
                tutor.subjects_of_study && tutor.subjects_of_study.length > 0
                  ? tutor.subjects_of_study
                  : subject
                    ? [decodeURIComponent(subject)]
                    : [];
              return (
                <div
                  key={tutor.id}
                  className="flex flex-col overflow-hidden rounded-2xl border-2 border-gray-200 bg-white transition-all duration-300 hover:border-itutor-green hover:shadow-xl"
                >
                  <div className="relative h-24 shrink-0 sm:h-28">
                    <img
                      src={profileBannerDisplayUrl(tutor.profile_banner_url, tutor.updated_at)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <div className="mb-3 flex items-start gap-3">
                      <UserAvatar avatarUrl={tutor.avatar_url} name={getDisplayName(tutor)} size={56} />
                      <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="flex items-center gap-2 truncate text-base font-bold text-gray-900">
                            {getDisplayName(tutor)}
                            {tutor.tutor_verification_status === 'VERIFIED' && <VerifiedBadge size="sm" />}
                          </h3>
                          {tutor.username && (
                            <p className="truncate text-xs text-gray-500">@{tutor.username}</p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <span className="text-sm text-yellow-400">★</span>
                            <span className="text-xs font-bold text-gray-900">
                              {(tutor.average_rating || 0).toFixed(1)}
                            </span>
                            <span className="text-[11px] text-gray-600">
                              ({tutor.total_reviews || 0} {tutor.total_reviews === 1 ? 'review' : 'reviews'})
                            </span>
                          </div>
                          {tutor.subject_price !== null && tutor.subject_price !== undefined && (
                            <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                              ${tutor.subject_price.toFixed(2)}/hr
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => router.push(`/student/tutors/${tutor.id}`)}
                          aria-label={`Open ${getDisplayName(tutor)}'s profile`}
                          className="flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-full border border-itutor-green/55 bg-itutor-green/15 text-itutor-green shadow-sm transition hover:bg-itutor-green/25 hover:border-itutor-green"
                        >
                          <span className="text-[15px] font-extrabold leading-none" aria-hidden>
                            !
                          </span>
                        </button>
                      </div>
                    </div>

                    {tutor.bio && (
                      <p className="mb-2 line-clamp-2 text-xs text-gray-700">{tutor.bio}</p>
                    )}

                    {tutor.topComment && (
                      <div className="mb-2 rounded-lg border border-amber-200/80 bg-amber-50/80 p-2">
                        <div className="mb-0.5 flex items-center gap-1">
                          {[...Array(Math.min(tutor.topComment.stars, 5))].map((_, i) => (
                            <span key={i} className="text-xs text-yellow-500">
                              ★
                            </span>
                          ))}
                          <span className="text-[10px] text-gray-500">• {tutor.topComment.student_name}</span>
                        </div>
                        <p className="line-clamp-2 text-[11px] italic text-gray-700">&ldquo;{tutor.topComment.comment}&rdquo;</p>
                      </div>
                    )}

                    <div className="mt-auto flex-1">
                      <p className="mb-1.5 text-xs font-medium text-gray-500">Teaches:</p>
                      <div className="flex flex-wrap gap-1">
                        {subjectTags.slice(0, 4).map((name) => (
                          <span
                            key={name}
                            className="rounded border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-700"
                          >
                            {name}
                          </span>
                        ))}
                        {subjectTags.length > 4 && (
                          <span className="rounded border border-gray-300 bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                            +{subjectTags.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

