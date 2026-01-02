'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { getStudentBookings } from '@/lib/services/bookingService';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { getDisplayName } from '@/lib/utils/displayName';
import { Booking, BookingStatus, BookingWithDetails } from '@/lib/types/booking';
import { formatDateTime, getRelativeTime } from '@/lib/utils/calendar';
import { getBookingStatusColor, getBookingStatusLabel } from '@/lib/types/booking';

type TabType = 'all' | 'pending' | 'confirmed' | 'cancelled' | 'past';

export default function StudentBookingsPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  
  const [bookings, setBookings] = useState<BookingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [selectedBookings, setSelectedBookings] = useState<Set<string>>(new Set());
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'student') {
      router.push('/login');
      return;
    }

    loadBookings();
  }, [profile, profileLoading, router]);

  async function loadBookings() {
    if (!profile) return;

    setLoading(true);
    try {
      const data = await getStudentBookings(profile.id);
      
      // Fetch tutor details and subject names
      const enrichedBookings = await Promise.all(
        data.map(async (booking) => {
          const [tutorRes, subjectRes] = await Promise.all([
            supabase
              .from('profiles')
              .select('username, display_name, full_name')
              .eq('id', booking.tutor_id)
              .single(),
            supabase
              .from('subjects')
              .select('name, label')
              .eq('id', booking.subject_id)
              .single()
          ]);

          return {
            ...booking,
            tutor_name: tutorRes.data ? getDisplayName(tutorRes.data) : 'Unknown Tutor',
            tutor_username: tutorRes.data?.username,
            subject_name: subjectRes.data?.label || subjectRes.data?.name || 'Unknown Subject'
          } as BookingWithDetails;
        })
      );

      setBookings(enrichedBookings);
    } catch (error) {
      console.error('Error loading bookings:', error);
    } finally {
      setLoading(false);
    }
  }

  function toggleBookingSelection(bookingId: string) {
    const newSelected = new Set(selectedBookings);
    if (newSelected.has(bookingId)) {
      newSelected.delete(bookingId);
    } else {
      newSelected.add(bookingId);
    }
    setSelectedBookings(newSelected);
  }

  function selectAll() {
    const confirmedIds = filteredBookings
      .filter(b => b.status === 'CONFIRMED')
      .map(b => b.id);
    setSelectedBookings(new Set(confirmedIds));
  }

  function deselectAll() {
    setSelectedBookings(new Set());
  }

  async function bulkCancelBookings() {
    if (selectedBookings.size === 0) {
      alert('Please select at least one booking to cancel');
      return;
    }

    if (!confirm(`Are you sure you want to cancel ${selectedBookings.size} booking(s)?`)) {
      return;
    }

    setCancelling(true);
    try {
      const bookingIds = Array.from(selectedBookings);
      
      // Cancel each booking
      const results = await Promise.allSettled(
        bookingIds.map(async (bookingId) => {
          const { error } = await supabase
            .from('bookings')
            .update({ status: 'CANCELLED' })
            .eq('id', bookingId)
            .eq('student_id', profile!.id);

          if (error) throw error;

          // Create notification for tutor
          const booking = bookings.find(b => b.id === bookingId);
          if (booking) {
            await supabase.from('notifications').insert({
              user_id: booking.tutor_id,
              type: 'BOOKING_CANCELLED',
              title: 'Booking Cancelled',
              message: `A student has cancelled their booking for ${booking.subject_name}`,
              link: `/tutor/bookings/${bookingId}`,
            });
          }
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (failed > 0) {
        alert(`Cancelled ${successful} booking(s). ${failed} failed.`);
      } else {
        alert(`Successfully cancelled ${successful} booking(s)!`);
      }

      setSelectedBookings(new Set());
      await loadBookings();
    } catch (error) {
      console.error('Error cancelling bookings:', error);
      alert('Failed to cancel bookings');
    } finally {
      setCancelling(false);
    }
  }

  // Clear selection when changing tabs
  useEffect(() => {
    setSelectedBookings(new Set());
  }, [activeTab]);

  const filteredBookings = bookings.filter(booking => {
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') {
      return booking.status === 'PENDING' || booking.status === 'COUNTER_PROPOSED';
    }
    if (activeTab === 'confirmed') {
      return booking.status === 'CONFIRMED';
    }
    if (activeTab === 'cancelled') {
      return booking.status === 'CANCELLED';
    }
    if (activeTab === 'past') {
      return booking.status === 'COMPLETED' || booking.status === 'DECLINED';
    }
    return true;
  });

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: bookings.length },
    { key: 'pending', label: 'Pending', count: bookings.filter(b => b.status === 'PENDING' || b.status === 'COUNTER_PROPOSED').length },
    { key: 'confirmed', label: 'Confirmed', count: bookings.filter(b => b.status === 'CONFIRMED').length },
    { key: 'cancelled', label: 'Cancelled', count: bookings.filter(b => b.status === 'CANCELLED').length },
    { key: 'past', label: 'Past', count: bookings.filter(b => b.status === 'COMPLETED' || b.status === 'DECLINED').length }
  ];

  function getTabColor(tabKey: TabType, isActive: boolean) {
    const baseColors = {
      all: 'text-gray-600',
      pending: 'text-yellow-600',
      confirmed: 'text-green-600',
      cancelled: 'text-red-600',
      past: 'text-blue-600'
    };
    const borderColors = {
      all: 'border-gray-600',
      pending: 'border-yellow-600',
      confirmed: 'border-green-600',
      cancelled: 'border-red-600',
      past: 'border-blue-600'
    };
    return `${baseColors[tabKey]} ${isActive ? `border-b-2 ${borderColors[tabKey]}` : ''}`;
  }

  function getTabBadgeColor(tabKey: TabType) {
    const colors = {
      all: 'bg-gray-100 text-gray-700',
      pending: 'bg-yellow-100 text-yellow-700',
      confirmed: 'bg-green-100 text-green-700',
      cancelled: 'bg-red-100 text-red-700',
      past: 'bg-blue-100 text-blue-700'
    };
    return colors[tabKey];
  }

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  return (
    <DashboardLayout role="student" userName={getDisplayName(profile)}>
      <div className="px-4 py-6 sm:px-0 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Bookings</h1>
          <p className="text-gray-600">View and manage your tutoring sessions</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-300 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                px-4 py-3 font-medium transition-all whitespace-nowrap
                ${getTabColor(tab.key, activeTab === tab.key)}
              `}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${getTabBadgeColor(tab.key)}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Bulk Actions (Confirmed Tab Only) */}
        {activeTab === 'confirmed' && filteredBookings.length > 0 && (
          <div className="bg-white border-2 border-gray-200 rounded-xl p-4 mb-6 shadow-lg">
            <div className="flex flex-wrap gap-4 items-center justify-between">
              <div className="flex gap-3">
                {selectedBookings.size === 0 ? (
                  <button
                    onClick={selectAll}
                    className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg font-medium hover:bg-gray-200 transition"
                  >
                    Select All
                  </button>
                ) : (
                  <>
                    <button
                      onClick={deselectAll}
                      className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg font-medium hover:bg-gray-200 transition"
                    >
                      Deselect All
                    </button>
                    <button
                      onClick={bulkCancelBookings}
                      disabled={cancelling}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {cancelling ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Cancelling...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Cancel Selected ({selectedBookings.size})
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
              {selectedBookings.size > 0 && (
                <div className="text-sm text-gray-600">
                  <span className="font-semibold">{selectedBookings.size}</span> of {filteredBookings.length} selected
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-itutor-green"></div>
            <span className="ml-3 text-gray-600">Loading bookings...</span>
          </div>
        ) : filteredBookings.length === 0 ? (
          // Empty State
          <div className="text-center py-12 bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-2xl">
            <svg className="w-16 h-16 text-blue-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-600 mb-4">No bookings found</p>
            <Link
              href="/student/find-tutors"
              className="inline-block bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white py-3 px-6 rounded-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-itutor-green/50"
            >
              Find a Tutor
            </Link>
          </div>
        ) : (
          // Bookings List
          <div className="space-y-4">
            {filteredBookings.map(booking => {
              const displayTime = booking.confirmed_start_at || booking.requested_start_at;
              const endTime = booking.confirmed_end_at || booking.requested_end_at;
              const isConfirmed = booking.status === 'CONFIRMED';
              const isSelected = selectedBookings.has(booking.id);
              
              const BookingCard = (
                <div
                  key={booking.id}
                  className={`bg-gradient-to-br from-blue-50 to-purple-50 border-2 rounded-2xl p-6 transition-all duration-300 ${
                    isConfirmed 
                      ? `cursor-pointer hover:shadow-xl hover:scale-[1.01] ${isSelected ? 'border-itutor-green bg-green-50' : 'border-blue-200 hover:border-blue-400'}`
                      : 'border-blue-200 hover:shadow-xl hover:border-blue-400 hover:scale-[1.01]'
                  }`}
                  onClick={(e) => {
                    if (isConfirmed && (e.target as HTMLElement).closest('input[type="checkbox"]')) {
                      return; // Let checkbox handle it
                    }
                    if (isConfirmed) {
                      toggleBookingSelection(booking.id);
                    } else {
                      router.push(`/student/bookings/${booking.id}`);
                    }
                  }}
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    {/* Left: Booking Info */}
                    <div className="flex-1 flex items-start gap-3">
                      {/* Checkbox (Confirmed Only) */}
                      {isConfirmed && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleBookingSelection(booking.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-5 h-5 mt-1 text-itutor-green rounded focus:ring-itutor-green flex-shrink-0 cursor-pointer"
                        />
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="bg-itutor-green/20 p-2 rounded-lg flex-shrink-0">
                            <svg className="w-6 h-6 text-itutor-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-bold text-gray-900 mb-1">
                              {booking.tutor_name}
                              {booking.tutor_username && (
                                <span className="text-sm text-gray-600 font-normal ml-2">
                                  @{booking.tutor_username}
                                </span>
                              )}
                            </h3>
                            <p className="text-gray-600 text-sm">{booking.subject_name}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-4 text-sm text-gray-700">
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {formatDateTime(displayTime)}
                          </span>
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {(() => {
                              const endTime = booking.confirmed_end_at || booking.requested_end_at;
                              if (displayTime && endTime) {
                                const durationMs = new Date(endTime).getTime() - new Date(displayTime).getTime();
                                const durationMinutes = Math.round(durationMs / 60000);
                                const hours = Math.floor(durationMinutes / 60);
                                const mins = durationMinutes % 60;
                                return hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
                              }
                              return '60 min';
                            })()}
                          </span>
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            ${booking.price_ttd} TTD
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Status & Action */}
                    <div className="flex items-center gap-4">
                      <span className={`
                        px-3 py-1.5 rounded-lg text-sm font-semibold border
                        ${getBookingStatusColor(booking.status)}
                      `}>
                        {getBookingStatusLabel(booking.status)}
                      </span>
                      
                      {!isConfirmed && (
                        <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              );

              // Wrap non-confirmed bookings in Link
              if (!isConfirmed) {
                return (
                  <Link key={booking.id} href={`/student/bookings/${booking.id}`}>
                    {BookingCard}
                  </Link>
                );
              }

              return BookingCard;
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

