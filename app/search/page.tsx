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

export default function SearchResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subject = searchParams.get('subject');
  const mode = searchParams.get('mode') || 'tutor';

  const [results, setResults] = useState<ProfileWithRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    minRating: 0,
    school: 'all',
    verifiedOnly: false,
    maxPrice: 0
  });
  const [availableSchools, setAvailableSchools] = useState<string[]>([]);

  useEffect(() => {
    if (subject && mode === 'subject') {
      performSearch();
      fetchSchools();
    }
  }, [subject, mode, filters]);

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

  if (!subject || mode !== 'subject') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">No search query provided</p>
          <Link href="/" className="text-itutor-green hover:underline mt-2 inline-block">
            Go back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-green-50/30 to-blue-50/30">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-40 shadow-lg">
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        {/* Header Section */}
        <div className="mb-8 bg-gradient-to-r from-white via-green-50 to-white rounded-2xl p-4 sm:p-8 shadow-lg border-2 border-green-100">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold bg-gradient-to-r from-gray-900 via-itutor-green to-emerald-600 bg-clip-text text-transparent mb-3 break-words">
            iTutors teaching {subject}
          </h1>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-gray-700">
            <div className="flex items-center gap-2 bg-white px-3 sm:px-4 py-2 rounded-full shadow-sm border border-gray-200 text-sm sm:text-base">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-itutor-green flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span className="font-bold text-gray-900 whitespace-nowrap">
                {loading ? 'Searching...' : `${results.length} ${results.length === 1 ? 'iTutor' : 'iTutors'} found`}
              </span>
            </div>
            {!loading && results.length > 0 && (
              <div className="flex items-center gap-2 bg-itutor-green/10 px-3 sm:px-4 py-2 rounded-full border border-itutor-green/30">
                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-itutor-green flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="text-xs sm:text-sm font-semibold text-itutor-green whitespace-nowrap">Verified iTutors shown first</span>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Rating Filter */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                Minimum Rating
              </label>
              <select
                value={filters.minRating}
                onChange={(e) => setFilters({ ...filters, minRating: Number(e.target.value) })}
                className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green transition-all shadow-sm hover:shadow-md font-medium text-gray-700"
              >
                <option value="0">⭐ Any Rating</option>
                <option value="3">⭐⭐⭐ 3+ Stars</option>
                <option value="4">⭐⭐⭐⭐ 4+ Stars</option>
                <option value="4.5">⭐⭐⭐⭐ 4.5+ Stars</option>
                <option value="5">⭐⭐⭐⭐⭐ 5 Stars Only</option>
              </select>
            </div>

            {/* Price Filter */}
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                <span className="text-lg">💰</span>
                Maximum Price
              </label>
              <select
                value={filters.maxPrice}
                onChange={(e) => setFilters({ ...filters, maxPrice: Number(e.target.value) })}
                className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green transition-all shadow-sm hover:shadow-md font-medium text-gray-700"
              >
                <option value="0">💵 Any Price</option>
                <option value="50">💵 Up to $50/hr</option>
                <option value="100">💵 Up to $100/hr</option>
                <option value="150">💵 Up to $150/hr</option>
                <option value="200">💵 Up to $200/hr</option>
                <option value="300">💵 Up to $300/hr</option>
              </select>
            </div>

            {/* School Filter */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                School
              </label>
              <select
                value={filters.school}
                onChange={(e) => setFilters({ ...filters, school: e.target.value })}
                className="w-full px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-itutor-green focus:border-itutor-green transition-all shadow-sm hover:shadow-md font-medium text-gray-700"
              >
                <option value="all">🏫 All Schools</option>
                {availableSchools.map(school => (
                  <option key={school} value={school}>{school}</option>
                ))}
              </select>
            </div>

            {/* Verified Only */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                <svg className="w-4 h-4 text-itutor-green" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Verification Status
              </label>
              <label className="flex items-center gap-3 px-4 py-3 bg-white border-2 border-gray-300 rounded-xl cursor-pointer hover:border-itutor-green hover:bg-green-50 transition-all shadow-sm hover:shadow-md">
                <input
                  type="checkbox"
                  checked={filters.verifiedOnly}
                  onChange={(e) => setFilters({ ...filters, verifiedOnly: e.target.checked })}
                  className="w-5 h-5 text-itutor-green rounded focus:ring-itutor-green focus:ring-2"
                />
                <span className="text-gray-900 font-semibold">✓ Verified iTutors Only</span>
              </label>
            </div>
          </div>

          <button
            onClick={() => setFilters({ minRating: 0, school: 'all', verifiedOnly: false, maxPrice: 0 })}
            className="mt-6 px-4 py-2 text-sm text-gray-600 hover:text-itutor-green transition-all font-semibold hover:bg-gray-100 rounded-lg"
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
            {results.map((tutor) => (
              <Link
                key={tutor.id}
                href={`/tutors/${tutor.id}`}
                className="group block bg-gradient-to-br from-white via-white to-gray-50/30 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 border-2 border-gray-100 hover:border-itutor-green hover:scale-[1.02] transform"
              >
                <div className="p-4 sm:p-6 md:p-8">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0 mx-auto sm:mx-0">
                      {tutor.avatar_url ? (
                        <img
                          src={tutor.avatar_url}
                          alt={getDisplayName(tutor)}
                          className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover ring-4 ring-gray-100 shadow-lg"
                        />
                      ) : (
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-itutor-green via-emerald-500 to-emerald-600 flex items-center justify-center text-white font-bold text-2xl sm:text-3xl shadow-lg ring-4 ring-gray-100">
                          {getDisplayName(tutor).charAt(0)}
                        </div>
                      )}
                      {tutor.tutor_verification_status === 'VERIFIED' && (
                        <div className="absolute -bottom-2 -right-2 bg-gradient-to-br from-itutor-green to-emerald-600 rounded-full p-2 border-4 border-white shadow-lg animate-pulse">
                          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 w-full">
                      {/* Name and Verified Badge */}
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3 mb-3">
                        <h3 className="font-extrabold text-xl sm:text-2xl md:text-3xl text-gray-900 truncate max-w-full">{getDisplayName(tutor)}</h3>
                        {tutor.tutor_verification_status === 'VERIFIED' && (
                          <span className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-1 sm:py-1.5 bg-gradient-to-r from-itutor-green to-emerald-600 text-white text-xs sm:text-sm font-bold rounded-full shadow-lg animate-pulse flex-shrink-0">
                            <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            VERIFIED
                          </span>
                        )}
                      </div>

                      {/* Rating - Mobile optimized */}
                      <div className="flex items-center gap-2 mb-4 bg-gradient-to-r from-yellow-50 to-orange-50 px-3 sm:px-4 py-2 rounded-full border-2 border-yellow-200 w-fit mx-auto sm:mx-0 shadow-sm">
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

                      {/* Price */}
                      <div className="flex justify-center sm:justify-start">
                        {tutor.subject_price !== null && tutor.subject_price !== undefined && (
                          tutor.subject_price === 0 ? (
                            <div className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-3 bg-gradient-to-r from-blue-400 to-purple-500 text-white font-extrabold rounded-full border-2 border-blue-600 shadow-lg hover:shadow-xl transition-all text-sm sm:text-base">
                              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                              <span className="text-sm sm:text-lg">FREE SESSION</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-3 bg-gradient-to-r from-emerald-400 to-green-500 text-white font-extrabold rounded-full border-2 border-emerald-600 shadow-lg hover:shadow-xl transition-all text-sm sm:text-base">
                              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="text-sm sm:text-lg">${tutor.subject_price.toFixed(2)}/hr</span>
                            </div>
                          )
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
          </div>
        )}
      </div>
    </div>
  );
}

