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
  const [paidClassesEnabled, setPaidClassesEnabled] = useState<boolean>(false);

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'student') {
      router.push('/login');
      return;
    }

    fetchPaidClassesFlag();
    loadBookings();
  }, [profile, profileLoading, router]);

  async function fetchPaidClassesFlag() {
    try {
      const res = await fetch('/api/feature-flags', { cache: 'no-store' });
      const data = await res.json();
      setPaidClassesEnabled(Boolean(data?.paidClassesEnabled));
    } catch {
      setPaidClassesEnabled(false);
    }
  }

  async function loadBookings() {
    if (!profile) return;

    setLoading(true);
    try {
      const data = await getStudentBookings(profile.id);
      
      // Fetch tutor details, subject names, and session data
      const enrichedBookings = await Promise.all(
        data.map(async (booking) => {
          const [tutorRes, subjectRes, sessionRes] = await Promise.all([
            supabase
              .from('profiles')
              .select('username, display_name, full_name')
              .eq('id', booking.tutor_id)
              .single(),
            supabase
              .from('subjects')
              .select('name, label')
              .eq('id', booking.subject_id)
              .single(),
            supabase
              .from('sessions')
              .select('id, status, scheduled_start_at, scheduled_end_at, duration_minutes')
              .eq('booking_id', booking.id)
              .single()
          ]);

          return {
            ...booking,
            tutor_name: tutorRes.data ? getDisplayName(tutorRes.data) : 'Unknown Tutor',
            tutor_username: tutorRes.data?.username,
            subject_name: subjectRes.data?.label || subjectRes.data?.name || 'Unknown Subject',
            session: sessionRes.data || null
          } as BookingWithDetails & { session: any };
        })
      );

      setBookings(enrichedBookings);
    } catch (error) {
      console.error('Error loading bookings:', error);
    } finally {
      setLoading(false);
    }
  }


  const isBookingInProgress = (booking: any) => {
    if (booking.status === 'CONFIRMED' && booking.session) {
      const now = new Date();
      const session = booking.session;
      const sessionStart = new Date(session.scheduled_start_at);
      const sessionEnd = new Date(session.scheduled_end_at || new Date(sessionStart.getTime() + (session.duration_minutes || 60) * 60000));
      
      return now >= sessionStart && now <= sessionEnd;
    }
    return false;
  };

  const isBookingPast = (booking: any) => {
    if (booking.status === 'COMPLETED' || booking.status === 'DECLINED') return true;
    
    // Don't count in-progress sessions as past
    if (isBookingInProgress(booking)) return false;
    
    // Check if booking has an associated session
    if (booking.status === 'CONFIRMED' && booking.session) {
      const now = new Date();
      const session = booking.session;
      const sessionStart = new Date(session.scheduled_start_at);
      const sessionEnd = new Date(session.scheduled_end_at || new Date(sessionStart.getTime() + (session.duration_minutes || 60) * 60000));
      
      // Only consider it past if the session has ended
      return now > sessionEnd;
    }
    
    // Fallback for confirmed bookings without sessions
    if (booking.status === 'CONFIRMED') {
      const endTime = booking.confirmed_end_at || booking.requested_end_at;
      if (endTime) {
        return new Date(endTime) < new Date();
      }
    }
    
    return false;
  };

  const filteredBookings = bookings.filter(booking => {
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') {
      return booking.status === 'PENDING' || booking.status === 'COUNTER_PROPOSED';
    }
    if (activeTab === 'confirmed') {
      return booking.status === 'CONFIRMED' && !isBookingPast(booking);
    }
    if (activeTab === 'cancelled') {
      return booking.status === 'CANCELLED';
    }
    if (activeTab === 'past') {
      return isBookingPast(booking);
    }
    return true;
  });

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: bookings.length },
    { key: 'pending', label: 'Pending', count: bookings.filter(b => b.status === 'PENDING' || b.status === 'COUNTER_PROPOSED').length },
    { key: 'confirmed', label: 'Confirmed', count: bookings.filter(b => b.status === 'CONFIRMED' && !isBookingPast(b)).length },
    { key: 'cancelled', label: 'Cancelled', count: bookings.filter(b => b.status === 'CANCELLED').length },
    { key: 'past', label: 'Past', count: bookings.filter(b => isBookingPast(b)).length }
  ];

  function getTabColor(tabKey: TabType, isActive: boolean) {
    return `text-gray-600 ${isActive ? 'border-b-2 border-itutor-green' : ''}`;
  }

  function getTabBadgeColor(tabKey: TabType) {
    return 'bg-gray-200 text-gray-700';
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
              const now = new Date();
              
              // Determine display status
              let displayStatus = getBookingStatusLabel(booking.status);
              let statusColor = getBookingStatusColor(booking.status);
              
              // Override status for confirmed bookings with sessions
              if (booking.status === 'CONFIRMED' && (booking as any).session) {
                const session = (booking as any).session;
                const sessionStart = new Date(session.scheduled_start_at);
                const sessionEnd = new Date(session.scheduled_end_at || new Date(sessionStart.getTime() + (session.duration_minutes || 60) * 60000));
                
                // Check if session is in progress
                if (now >= sessionStart && now <= sessionEnd) {
                  displayStatus = 'In Progress';
                  statusColor = 'bg-purple-100 text-purple-700 border-purple-300';
                }
                // Check if session has ended
                else if (now > sessionEnd) {
                  // Show appropriate status based on session status
                  if (session.status === 'COMPLETED_ASSUMED' || session.status === 'COMPLETED') {
                    displayStatus = 'Completed';
                    statusColor = 'bg-green-100 text-green-700 border-green-300';
                  } else if (session.status === 'NO_SHOW_STUDENT') {
                    displayStatus = 'No Show';
                    statusColor = 'bg-orange-100 text-orange-700 border-orange-300';
                  } else if (session.status === 'CANCELLED') {
                    displayStatus = 'Cancelled';
                    statusColor = 'bg-red-100 text-red-700 border-red-300';
                  } else {
                    displayStatus = 'Past (Not Completed)';
                    statusColor = 'bg-gray-100 text-gray-700 border-gray-300';
                  }
                }
              }
              // For confirmed bookings without sessions that have passed
              else if (booking.status === 'CONFIRMED' && displayTime && new Date(displayTime) < now) {
                displayStatus = 'Past (Not Completed)';
                statusColor = 'bg-gray-100 text-gray-700 border-gray-300';
              }
              
              return (
                <Link
                  key={booking.id}
                  href={`/student/bookings/${booking.id}`}
                  className="block bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-2xl p-6 hover:shadow-xl hover:border-blue-400 hover:scale-[1.01] transition-all duration-300"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    {/* Left: Booking Info */}
                    <div className="flex-1">
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
                              if (hours > 0) {
                                return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
                              }
                              return `${mins} min`;
                            }
                            return '60 min';
                          })()}
                        </span>
                        {paidClassesEnabled && (
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            ${booking.price_ttd} TTD
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Status & Arrow */}
                    <div className="flex items-center gap-4">
                      <span className={`
                        px-3 py-1.5 rounded-lg text-sm font-semibold border
                        ${statusColor}
                      `}>
                        {displayStatus}
                      </span>
                      
                      <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

