'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { formatDateTime } from '@/lib/utils/calendar';
import { getBookingStatusColor, getBookingStatusLabel } from '@/lib/types/booking';
import { getDisplayName } from '@/lib/utils/displayName';

type Booking = {
  id: string;
  status: string;
  created_at: string;
  requested_start_at: string;
  confirmed_start_at: string | null;
  duration_minutes: number;
  student_id: string;
  tutor_id: string;
  subject_id: string;
  price_ttd: number;
  student_notes: string | null;
  tutor_notes: string | null;
};

type EnrichedBooking = Booking & {
  tutor_name: string;
  subject_name: string;
};

export default function ChildBookingsPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const params = useParams();
  const childId = params.childId as string;

  const [child, setChild] = useState<any>(null);
  const [bookings, setBookings] = useState<EnrichedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'confirmed' | 'cancelled' | 'past'>('all');

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'parent') {
      router.push('/login');
      return;
    }

    verifyChildAccess();
    fetchBookings();
  }, [profile, profileLoading, router, childId]);

  async function verifyChildAccess() {
    const { data, error } = await supabase
      .from('parent_child_links')
      .select('*, child_profile:profiles!parent_child_links_child_id_fkey(*)')
      .eq('parent_id', profile?.id)
      .eq('child_id', childId)
      .single();

    if (error || !data) {
      router.push('/parent/dashboard');
      return;
    }

    setChild(data.child_profile);
  }

  async function fetchBookings() {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('student_id', childId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Enrich with tutor and subject names
      const enriched = await Promise.all(
        (data || []).map(async (booking) => {
          const [tutorRes, subjectRes] = await Promise.all([
            supabase.from('profiles').select('full_name, display_name, username').eq('id', booking.tutor_id).single(),
            supabase.from('subjects').select('name, label').eq('id', booking.subject_id).single()
          ]);

          return {
            ...booking,
            tutor_name: tutorRes.data?.display_name || tutorRes.data?.full_name || tutorRes.data?.username || 'Unknown',
            subject_name: subjectRes.data?.label || subjectRes.data?.name || 'Unknown'
          };
        })
      );

      setBookings(enriched);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  }

  const filterBookings = (bookings: EnrichedBooking[]) => {
    const now = new Date();
    
    switch (activeTab) {
      case 'pending':
        return bookings.filter(b => b.status === 'PENDING' || b.status === 'COUNTERED');
      case 'confirmed':
        return bookings.filter(b => b.status === 'CONFIRMED' && new Date(b.confirmed_start_at || b.requested_start_at) > now);
      case 'cancelled':
        return bookings.filter(b => b.status === 'CANCELLED' || b.status === 'DECLINED');
      case 'past':
        return bookings.filter(b => (b.status === 'CONFIRMED' && new Date(b.confirmed_start_at || b.requested_start_at) <= now) || b.status === 'COMPLETED');
      default:
        return bookings;
    }
  };

  const filteredBookings = filterBookings(bookings);
  const tabs = [
    { id: 'all' as const, label: 'All', count: bookings.length, color: 'text-gray-600 hover:text-gray-900 border-gray-300' },
    { id: 'pending' as const, label: 'Pending', count: bookings.filter(b => b.status === 'PENDING' || b.status === 'COUNTERED').length, color: 'text-yellow-600 hover:text-yellow-800 border-yellow-400' },
    { id: 'confirmed' as const, label: 'Confirmed', count: bookings.filter(b => b.status === 'CONFIRMED' && new Date(b.confirmed_start_at || b.requested_start_at) > new Date()).length, color: 'text-green-600 hover:text-green-800 border-green-400' },
    { id: 'cancelled' as const, label: 'Cancelled', count: bookings.filter(b => b.status === 'CANCELLED' || b.status === 'DECLINED').length, color: 'text-red-600 hover:text-red-800 border-red-400' },
    { id: 'past' as const, label: 'Past', count: bookings.filter(b => (b.status === 'CONFIRMED' && new Date(b.confirmed_start_at || b.requested_start_at) <= new Date()) || b.status === 'COMPLETED').length, color: 'text-blue-600 hover:text-blue-800 border-blue-400' }
  ];

  if (profileLoading || loading || !child) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <DashboardLayout role="parent" userName={getDisplayName(profile!)}>
      <div className="px-4 py-6 sm:px-0 max-w-6xl mx-auto">
        {/* Back button */}
        <Link
          href={`/parent/child/${childId}`}
          className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-700 mb-6 font-medium"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to {child.full_name}'s Dashboard
        </Link>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">{child.full_name}'s Bookings</h1>
          <p className="text-gray-600 mt-1">View and manage all booking requests and confirmed sessions</p>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-300">
          <div className="flex space-x-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  px-4 py-3 font-semibold transition-all relative
                  ${activeTab === tab.id ? `${tab.color} border-b-2` : 'text-gray-500 hover:text-gray-700'}
                `}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-700">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Bookings List */}
        {filteredBookings.length === 0 ? (
          <div className="bg-white border-2 border-gray-200 rounded-2xl shadow-lg p-12 text-center">
            <div className="bg-gray-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
              <svg className="h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No {activeTab !== 'all' ? activeTab : ''} bookings</h3>
            <p className="text-gray-600">Bookings will appear here once created</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBookings.map((booking) => {
              const displayTime = booking.confirmed_start_at || booking.requested_start_at;
              
              return (
                <div
                  key={booking.id}
                  className="bg-white border-2 border-gray-200 hover:border-purple-400 rounded-xl p-5 shadow-md hover:shadow-xl transition-all"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-900">{booking.subject_name}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getBookingStatusColor(booking.status)}`}>
                          {getBookingStatusLabel(booking.status)}
                        </span>
                      </div>
                      <p className="text-gray-600">with <span className="font-semibold text-purple-600">{booking.tutor_name}</span></p>
                    </div>
                    <Link
                      href={`/student/bookings/${booking.id}`}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition"
                    >
                      View Details
                    </Link>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center gap-2 text-gray-700">
                      <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <div>
                        <div className="font-medium">{formatDateTime(displayTime)}</div>
                        <div className="text-xs text-gray-500">{booking.status === 'CONFIRMED' ? 'Confirmed' : 'Requested'} time</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-gray-700">
                      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <div className="font-medium">{booking.duration_minutes} minutes</div>
                        <div className="text-xs text-gray-500">Session duration</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-gray-700">
                      <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <div className="font-medium">${booking.price_ttd} TTD</div>
                        <div className="text-xs text-gray-500">Price</div>
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






