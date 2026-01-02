'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { formatDateTime } from '@/lib/utils/calendar';
import { getDisplayName } from '@/lib/utils/displayName';
import SuggestTimeModal from '@/components/parent/SuggestTimeModal';
import DeclineBookingModal from '@/components/parent/DeclineBookingModal';

type PendingBooking = {
  id: string;
  student_id: string;
  tutor_id: string;
  subject_id: string;
  requested_start_at: string;
  duration_minutes: number;
  price_ttd: number;
  student_notes: string | null;
  created_at: string;
  student_name?: string;
  tutor_name?: string;
  subject_name?: string;
  child_color?: string;
};

export default function ParentApproveBookingsPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [pendingBookings, setPendingBookings] = useState<PendingBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [suggestTimeModalOpen, setSuggestTimeModalOpen] = useState(false);
  const [selectedBookingForSuggest, setSelectedBookingForSuggest] = useState<PendingBooking | null>(null);
  const [declineModalOpen, setDeclineModalOpen] = useState(false);
  const [selectedBookingForDecline, setSelectedBookingForDecline] = useState<PendingBooking | null>(null);

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'parent') {
      router.push('/login');
      return;
    }

    fetchPendingBookings();
  }, [profile, profileLoading, router]);

  async function fetchPendingBookings() {
    if (!profile) return;

    try {
      console.log('🔍 Fetching pending bookings for parent:', profile.id);
      
      // Get all children with colors
      const { data: children, error: childrenError } = await supabase
        .from('parent_child_links')
        .select('child_id, child_color')
        .eq('parent_id', profile.id);

      console.log('👶 Children found:', children);
      if (childrenError) {
        console.error('❌ Error fetching children:', childrenError);
        throw childrenError;
      }

      const childIds = (children || []).map(c => c.child_id);
      const childColorMap = new Map((children || []).map(c => [c.child_id, c.child_color || '#9333EA']));
      console.log('📋 Child IDs:', childIds);
      console.log('🎨 Child colors:', Object.fromEntries(childColorMap));

      if (childIds.length === 0) {
        console.log('⚠️ No children linked to parent');
        setLoading(false);
        return;
      }

      // Get pending bookings for all children
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .in('student_id', childIds)
        .eq('status', 'PENDING_PARENT_APPROVAL')
        .order('created_at', { ascending: false });

      console.log('📚 Bookings found:', bookings);
      console.log('📚 Number of pending bookings:', bookings?.length || 0);
      
      if (bookingsError) {
        console.error('❌ Error fetching bookings:', bookingsError);
        throw bookingsError;
      }

      // Enrich with names and colors
      const enriched = await Promise.all(
        (bookings || []).map(async (booking) => {
          const [studentRes, tutorRes, subjectRes] = await Promise.all([
            supabase.from('profiles').select('full_name, display_name').eq('id', booking.student_id).single(),
            supabase.from('profiles').select('full_name, display_name, username').eq('id', booking.tutor_id).single(),
            supabase.from('subjects').select('name, label').eq('id', booking.subject_id).single()
          ]);

          return {
            ...booking,
            student_name: studentRes.data ? getDisplayName(studentRes.data) : 'Unknown',
            tutor_name: tutorRes.data ? getDisplayName(tutorRes.data) : 'Unknown',
            subject_name: subjectRes.data?.label || subjectRes.data?.name || 'Unknown',
            child_color: childColorMap.get(booking.student_id) || '#9333EA'
          };
        })
      );

      console.log('✅ Enriched bookings with colors:', enriched);
      setPendingBookings(enriched);
    } catch (error) {
      console.error('Error fetching pending bookings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(bookingId: string) {
    if (processing) return;
    
    setProcessing(bookingId);

    try {
      const { data, error } = await supabase.rpc('parent_approve_booking', {
        p_booking_id: bookingId,
        p_parent_notes: null
      });

      if (error) throw error;

      // Redirect to payment page
      router.push(`/payments/checkout?bookingId=${bookingId}`);
    } catch (error: any) {
      console.error('Error approving booking:', error);
      alert(error.message || 'Failed to approve booking');
      setProcessing(null);
    }
  }

  async function handleReject(bookingId: string, reason: string) {
    if (processing) return;
    
    setProcessing(bookingId);

    try {
      const { data, error } = await supabase.rpc('parent_reject_booking', {
        p_booking_id: bookingId,
        p_parent_notes: reason || null
      });

      if (error) throw error;

      alert('Booking request declined.');
      
      // Refresh list
      await fetchPendingBookings();
      setDeclineModalOpen(false);
      setSelectedBookingForDecline(null);
    } catch (error: any) {
      console.error('Error rejecting booking:', error);
      alert(error.message || 'Failed to reject booking');
    } finally {
      setProcessing(null);
    }
  }

  if (profileLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <DashboardLayout role="parent" userName={getDisplayName(profile!)}>
      <div className="px-4 py-6 sm:px-0 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/parent/dashboard"
            className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-700 mb-4 font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Approve Booking Requests</h1>
          <p className="text-gray-600 mt-1">Review and approve tutoring sessions requested by your children</p>
        </div>

        {/* Pending Bookings */}
        {pendingBookings.length === 0 ? (
          <div className="bg-white border-2 border-gray-200 rounded-2xl shadow-lg p-12 text-center">
            <div className="bg-gray-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
              <svg className="h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No pending approvals</h3>
            <p className="text-gray-600">When your children request sessions, they'll appear here for your approval</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingBookings.map((booking) => (
              <div
                key={booking.id}
                className="bg-white rounded-xl p-6 shadow-md hover:shadow-lg transition-all relative overflow-hidden"
                style={{ 
                  borderLeft: `6px solid ${booking.child_color}`,
                  borderTop: `2px solid ${booking.child_color}20`,
                  borderRight: `2px solid ${booking.child_color}20`,
                  borderBottom: `2px solid ${booking.child_color}20`
                }}
              >
                {/* Color indicator circle */}
                <div 
                  className="absolute top-4 right-4 w-8 h-8 rounded-full border-4 border-white shadow-lg"
                  style={{ backgroundColor: booking.child_color }}
                  title={`${booking.student_name}'s color`}
                />

                <div className="flex items-start justify-between mb-4 pr-12">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span 
                        className="px-3 py-1 text-xs font-bold rounded-full text-white"
                        style={{ backgroundColor: booking.child_color }}
                      >
                        NEEDS APPROVAL
                      </span>
                      <span className="text-sm text-gray-600">
                        Requested {new Date(booking.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                      {booking.student_name} wants to book {booking.subject_name}
                    </h3>
                    <p className="text-gray-700 mb-4">
                      with{' '}
                      <Link 
                        href={`/parent/tutors/${booking.tutor_id}`}
                        className="font-semibold hover:underline cursor-pointer"
                        style={{ color: booking.child_color }}
                      >
                        {booking.tutor_name}
                      </Link>
                    </p>
                  </div>
                </div>

                {/* Booking Details */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 p-4 bg-white/60 rounded-lg border border-amber-200">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 font-medium">Date & Time</p>
                      <p className="text-sm text-gray-900 font-semibold">{formatDateTime(booking.requested_start_at)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 font-medium">Duration</p>
                      <p className="text-sm text-gray-900 font-semibold">{booking.duration_minutes} minutes</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 font-medium">Cost</p>
                      <p className="text-sm text-gray-900 font-semibold">${booking.price_ttd} TTD</p>
                    </div>
                  </div>
                </div>

                {/* Student Notes */}
                {booking.student_notes && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs text-blue-700 font-semibold mb-1">Student's Note:</p>
                    <p className="text-sm text-gray-800">{booking.student_notes}</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button
                    onClick={() => handleApprove(booking.id)}
                    disabled={processing === booking.id}
                    className="bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white px-6 py-3 rounded-lg font-semibold shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {processing === booking.id ? 'Processing...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => {
                      setSelectedBookingForSuggest(booking);
                      setSuggestTimeModalOpen(true);
                    }}
                    disabled={processing === booking.id}
                    className="bg-white hover:bg-blue-50 border-2 px-6 py-3 rounded-lg font-semibold hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ 
                      borderColor: booking.child_color,
                      color: booking.child_color
                    }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Suggest Time
                  </button>
                  <button
                    onClick={() => {
                      setSelectedBookingForDecline(booking);
                      setDeclineModalOpen(true);
                    }}
                    disabled={processing === booking.id}
                    className="bg-white hover:bg-red-50 border-2 border-red-300 text-red-600 px-6 py-3 rounded-lg font-semibold hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Suggest Time Modal */}
        {selectedBookingForSuggest && (
          <SuggestTimeModal
            isOpen={suggestTimeModalOpen}
            onClose={() => {
              setSuggestTimeModalOpen(false);
              setSelectedBookingForSuggest(null);
            }}
            bookingId={selectedBookingForSuggest.id}
            tutorId={selectedBookingForSuggest.tutor_id}
            tutorName={selectedBookingForSuggest.tutor_name || 'Unknown'}
            studentName={selectedBookingForSuggest.student_name || 'Unknown'}
            childColor={selectedBookingForSuggest.child_color || '#9333EA'}
            onSuccess={() => {
              fetchPendingBookings();
            }}
          />
        )}

        {/* Decline Booking Modal */}
        {selectedBookingForDecline && (
          <DeclineBookingModal
            isOpen={declineModalOpen}
            onClose={() => {
              setDeclineModalOpen(false);
              setSelectedBookingForDecline(null);
            }}
            onConfirm={(reason) => handleReject(selectedBookingForDecline.id, reason)}
            studentName={selectedBookingForDecline.student_name || 'Unknown'}
            tutorName={selectedBookingForDecline.tutor_name || 'Unknown'}
            childColor={selectedBookingForDecline.child_color || '#9333EA'}
            submitting={processing === selectedBookingForDecline.id}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

