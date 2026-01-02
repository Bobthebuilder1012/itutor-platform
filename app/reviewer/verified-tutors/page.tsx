'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { getDisplayName } from '@/lib/utils/displayName';
import VerifiedBadge from '@/components/VerifiedBadge';
import { format } from 'date-fns';

interface VerifiedTutor {
  id: string;
  full_name: string;
  display_name: string | null;
  username: string | null;
  email: string;
  avatar_url: string | null;
  school: string | null;
  country: string;
  tutor_verified_at: string;
  subject_count: number;
  total_bookings: number;
  average_rating: number | null;
}

export default function VerifiedTutorsPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [tutors, setTutors] = useState<VerifiedTutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (profileLoading) return;

    if (!profile || !profile.is_reviewer) {
      router.push('/login');
      return;
    }

    fetchVerifiedTutors();
  }, [profile, profileLoading, router]);

  async function fetchVerifiedTutors() {
    try {
      setLoading(true);

      // Fetch verified tutors
      const { data: tutorData, error: tutorError } = await supabase
        .from('profiles')
        .select('id, full_name, display_name, username, email, avatar_url, school, country, tutor_verified_at')
        .eq('role', 'tutor')
        .eq('tutor_verification_status', 'VERIFIED')
        .order('tutor_verified_at', { ascending: false });

      if (tutorError) throw tutorError;

      // Fetch subject counts
      const { data: subjectCounts, error: subjectError } = await supabase
        .from('tutor_subjects')
        .select('tutor_id');

      if (subjectError) throw subjectError;

      const subjectCountMap = new Map<string, number>();
      (subjectCounts || []).forEach(item => {
        subjectCountMap.set(item.tutor_id, (subjectCountMap.get(item.tutor_id) || 0) + 1);
      });

      // Fetch booking counts
      const { data: bookingCounts, error: bookingError } = await supabase
        .from('bookings')
        .select('tutor_id')
        .in('status', ['CONFIRMED', 'COMPLETED']);

      if (bookingError) throw bookingError;

      const bookingCountMap = new Map<string, number>();
      (bookingCounts || []).forEach(item => {
        bookingCountMap.set(item.tutor_id, (bookingCountMap.get(item.tutor_id) || 0) + 1);
      });

      // Fetch ratings
      const { data: ratings, error: ratingsError } = await supabase
        .from('ratings')
        .select('tutor_id, stars');

      if (ratingsError) throw ratingsError;

      const ratingsMap = new Map<string, number[]>();
      (ratings || []).forEach(item => {
        if (!ratingsMap.has(item.tutor_id)) {
          ratingsMap.set(item.tutor_id, []);
        }
        ratingsMap.get(item.tutor_id)!.push(item.stars);
      });

      const enrichedTutors: VerifiedTutor[] = (tutorData || []).map(tutor => {
        const tutorRatings = ratingsMap.get(tutor.id) || [];
        const avgRating = tutorRatings.length > 0
          ? tutorRatings.reduce((sum, r) => sum + r, 0) / tutorRatings.length
          : null;

        return {
          ...tutor,
          subject_count: subjectCountMap.get(tutor.id) || 0,
          total_bookings: bookingCountMap.get(tutor.id) || 0,
          average_rating: avgRating,
        };
      });

      setTutors(enrichedTutors);
    } catch (error) {
      console.error('Error fetching verified tutors:', error);
      alert('Failed to load verified tutors');
    } finally {
      setLoading(false);
    }
  }

  async function handleRevokeVerification(tutorId: string, tutorName: string) {
    const reason = prompt(
      `Revoke verification for ${tutorName}?\n\nPlease provide a reason:\n\n(This will:\n- Remove their verified badge\n- Hide all verified subjects\n- Notify the tutor\n- They can resubmit for verification)`
    );

    if (!reason || reason.trim().length === 0) {
      if (reason !== null) {
        alert('Reason is required to revoke verification');
      }
      return;
    }

    setRevoking(tutorId);

    try {
      const res = await fetch('/api/admin/verification/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutor_id: tutorId, reason: reason.trim() })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to revoke verification');
      }

      alert('Verification revoked successfully');
      await fetchVerifiedTutors(); // Refresh list
    } catch (error: any) {
      console.error('Error revoking verification:', error);
      alert(error.message || 'Failed to revoke verification');
    } finally {
      setRevoking(null);
    }
  }

  if (profileLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  const displayName = getDisplayName(profile);

  const filteredTutors = tutors.filter(tutor => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      getDisplayName(tutor).toLowerCase().includes(query) ||
      tutor.email.toLowerCase().includes(query) ||
      tutor.username?.toLowerCase().includes(query) ||
      tutor.school?.toLowerCase().includes(query)
    );
  });

  return (
    <DashboardLayout role="reviewer" userName={displayName}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Verified iTutors</h1>
            <p className="text-gray-600">Manage verified iTutor accounts</p>
          </div>
          <div className="bg-green-100 border-2 border-green-300 rounded-lg px-4 py-2">
            <p className="text-sm font-medium text-green-800">
              <span className="text-2xl font-bold">{tutors.length}</span> Verified iTutors
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white border-2 border-gray-200 rounded-xl p-4 shadow-lg">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, username, or school..."
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none"
          />
        </div>

        {/* Tutors List */}
        {filteredTutors.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center border-2 border-gray-200">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              {searchQuery ? 'No Results Found' : 'No Verified iTutors Yet'}
            </h3>
            <p className="text-gray-600">
              {searchQuery 
                ? 'Try adjusting your search query'
                : 'Verified iTutors will appear here once approved'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredTutors.map((tutor) => (
              <div
                key={tutor.id}
                className="bg-white border-2 border-gray-200 rounded-2xl shadow-lg hover:shadow-xl transition-all p-6"
              >
                <div className="flex items-start gap-4 mb-4">
                  {/* Avatar */}
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-itutor-green to-emerald-600 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                    {tutor.avatar_url ? (
                      <img src={tutor.avatar_url} alt={getDisplayName(tutor)} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      getDisplayName(tutor).charAt(0).toUpperCase()
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold text-gray-900 truncate">
                        {getDisplayName(tutor)}
                      </h3>
                      <VerifiedBadge size="sm" />
                    </div>
                    {tutor.username && (
                      <p className="text-sm text-gray-600 truncate">@{tutor.username}</p>
                    )}
                    <p className="text-sm text-gray-600 truncate">{tutor.email}</p>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-2 mb-4">
                  {tutor.school && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span className="truncate">{tutor.school}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{tutor.country}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <span>{tutor.subject_count} {tutor.subject_count === 1 ? 'subject' : 'subjects'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{tutor.total_bookings} {tutor.total_bookings === 1 ? 'booking' : 'bookings'}</span>
                  </div>
                  {tutor.average_rating && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <span className="text-yellow-400">★</span>
                      <span className="font-semibold">{tutor.average_rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>

                {/* Verified Date */}
                <div className="bg-green-50 border-2 border-green-200 rounded-lg p-3 mb-4">
                  <p className="text-xs text-green-700 font-medium">
                    Verified on {format(new Date(tutor.tutor_verified_at), 'MMM d, yyyy')}
                  </p>
                </div>

                {/* Actions */}
                <button
                  onClick={() => handleRevokeVerification(tutor.id, getDisplayName(tutor))}
                  disabled={revoking === tutor.id}
                  className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {revoking === tutor.id ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Revoking...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Revoke Verification
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}


