'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { formatDateTime } from '@/lib/utils/calendar';
import Link from 'next/link';
import { getBookingStatusColor, getBookingStatusLabel } from '@/lib/types/booking';

type Booking = {
  id: string;
  status: string;
  created_at: string;
  requested_start_at: string;
  confirmed_start_at: string | null;
  student_id: string;
  tutor_id: string;
  subject_id: string;
  price_ttd: number;
  student_name?: string;
  tutor_name?: string;
  subject_name?: string;
};

export default function ChildrenBookings({ childIds }: { childIds: string[] }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (childIds.length === 0) {
      setLoading(false);
      return;
    }
    fetchBookings();
  }, [childIds]);

  async function fetchBookings() {
    try {
      // Get recent bookings for all children
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .in('student_id', childIds)
        .in('status', ['PENDING', 'CONFIRMED'])
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      // Enrich with student, tutor, and subject names
      const enrichedBookings = await Promise.all(
        (data || []).map(async (booking) => {
          const [studentRes, tutorRes, subjectRes] = await Promise.all([
            supabase.from('profiles').select('full_name, display_name').eq('id', booking.student_id).single(),
            supabase.from('profiles').select('full_name, display_name, username').eq('id', booking.tutor_id).single(),
            supabase.from('subjects').select('name, label').eq('id', booking.subject_id).single()
          ]);

          return {
            ...booking,
            student_name: studentRes.data?.display_name || studentRes.data?.full_name || 'Unknown',
            tutor_name: tutorRes.data?.display_name || tutorRes.data?.full_name || tutorRes.data?.username || 'Unknown',
            subject_name: subjectRes.data?.label || subjectRes.data?.name || 'Unknown'
          };
        })
      );

      setBookings(enrichedBookings);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <p className="text-gray-600">Loading bookings...</p>;
  }

  if (bookings.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="bg-green-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
          <svg className="h-8 w-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-gray-600">No active booking requests</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {bookings.map((booking) => {
        const displayTime = booking.confirmed_start_at || booking.requested_start_at;
        
        return (
          <div
            key={booking.id}
            className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4 hover:border-green-400 hover:shadow-md transition-all"
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-gray-900">{booking.student_name}</span>
                  <span className="text-gray-500">→</span>
                  <span className="font-semibold text-green-600">{booking.tutor_name}</span>
                  <span className={`ml-2 px-2 py-1 rounded-full text-xs font-semibold ${getBookingStatusColor(booking.status)}`}>
                    {getBookingStatusLabel(booking.status)}
                  </span>
                </div>
                <p className="text-sm text-gray-700 mb-2">{booking.subject_name}</p>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {formatDateTime(displayTime)}
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    ${booking.price_ttd} TTD
                  </span>
                </div>
              </div>
              <Link
                href={`/parent/child/${booking.student_id}/bookings`}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-medium transition"
              >
                View
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}






