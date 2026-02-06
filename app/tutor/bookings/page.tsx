'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { getTutorBookings } from '@/lib/services/bookingService';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { getDisplayName } from '@/lib/utils/displayName';
import { Booking, BookingStatus, BookingWithDetails } from '@/lib/types/booking';
import { formatDateTime, getRelativeTime } from '@/lib/utils/calendar';
import { getBookingStatusColor, getBookingStatusLabel } from '@/lib/types/booking';

type TabType = 'all' | 'pending' | 'confirmed' | 'cancelled' | 'past';

export default function TutorBookingsPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  
  const [bookings, setBookings] = useState<BookingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [paidClassesEnabled, setPaidClassesEnabled] = useState<boolean>(false);

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }

    loadBookings();
  }, [profile, profileLoading, router]);

  async function loadBookings() {
    if (!profile) return;

    setLoading(true);
    try {
      const data = await getTutorBookings(profile.id);
      
      // Fetch student details, subject names, and session data
      const enrichedBookings = await Promise.all(
        data.map(async (booking) => {
          const [studentRes, subjectRes, sessionRes] = await Promise.all([
            supabase
              .from('profiles')
              .select('username, display_name, full_name')
              .eq('id', booking.student_id)
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
            student_name: studentRes.data ? getDisplayName(studentRes.data) : 'Unknown Student',
            student_username: studentRes.data?.username,
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
    if (booking.status === 'COMPLETED') return true;
    
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
      return booking.status === 'CANCELLED' || booking.status === 'DECLINED';
    }
    if (activeTab === 'past') {
      return isBookingPast(booking);
    }
    return true;
  });

  const tabs: { key: TabType; label: string; count: number; badge?: boolean }[] = [
    { key: 'all', label: 'All', count: bookings.length },
    { 
      key: 'pending', 
      label: 'Pending', 
      count: bookings.filter(b => b.status === 'PENDING' || b.status === 'COUNTER_PROPOSED').length,
      badge: true
    },
    { key: 'confirmed', label: 'Confirmed', count: bookings.filter(b => b.status === 'CONFIRMED' && !isBookingPast(b)).length },
    { key: 'cancelled', label: 'Cancelled', count: bookings.filter(b => b.status === 'CANCELLED' || b.status === 'DECLINED').length },
    { key: 'past', label: 'Past', count: bookings.filter(b => isBookingPast(b)).length }
  ];

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  const pendingCount = bookings.filter(b => b.status === 'PENDING' || b.status === 'COUNTER_PROPOSED').length;

  return (
    <DashboardLayout role="tutor" userName={getDisplayName(profile)}>
      <div className="px-4 py-6 sm:px-0 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Booking Requests
            {pendingCount > 0 && (
              <span className="ml-3 px-3 py-1 bg-yellow-100 text-yellow-700 text-lg rounded-full">
                {pendingCount}
              </span>
            )}
          </h1>
          <p className="text-gray-600">Manage your tutoring session requests</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-300 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                px-4 py-3 font-medium transition-all whitespace-nowrap relative
                ${activeTab === tab.key
                  ? 'text-itutor-green border-b-2 border-itutor-green'
                  : 'text-gray-600 hover:text-gray-900'
                }
              `}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.key 
                    ? 'bg-itutor-green/20 text-itutor-green' 
                    : tab.badge && tab.count > 0
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-200 text-gray-700'
                }`}>
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
          /* Empty State */
          <div className="text-center py-12 bg-gradient-to-br from-green-50 to-blue-50 border-2 border-green-200 rounded-2xl">
            <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-600 mb-4">No {activeTab !== 'all' && activeTab} bookings found</p>
            {activeTab === 'pending' && (
              <p className="text-sm text-gray-500">New requests will appear here</p>
            )}
          </div>
        ) : (
          /* Bookings List */
          <div className="space-y-4">
            {filteredBookings.map(booking => {
              const displayTime = booking.confirmed_start_at || booking.requested_start_at;
              const isPending = booking.status === 'PENDING' || booking.status === 'COUNTER_PROPOSED';
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
                  href={`/tutor/bookings/${booking.id}`}
                  className={`
                    block bg-gray-50 border-2 rounded-2xl p-6 
                    hover:shadow-xl transition-all duration-300 hover:scale-[1.01]
                    ${isPending ? 'border-yellow-300 hover:shadow-yellow-200/50' : 'border-gray-200 hover:shadow-itutor-green/20'}
                  `}
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    {/* Left: Booking Info */}
                    <div className="flex-1">
                      <div className="flex items-start gap-3 mb-3">
                        <div className={`p-2 rounded-lg flex-shrink-0 ${
                          isPending ? 'bg-yellow-100' : 'bg-green-100'
                        }`}>
                          <svg className={`w-6 h-6 ${isPending ? 'text-yellow-600' : 'text-green-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-bold text-gray-900">
                              {booking.student_name}
                            </h3>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                router.push(`/tutor/students/${booking.student_id}`);
                              }}
                              className="text-xs text-itutor-green hover:text-emerald-600 flex items-center gap-1 transition-colors font-medium"
                            >
                              View Profile
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </button>
                          </div>
                          {booking.student_username && (
                            <p className="text-sm text-gray-600 mb-1">
                              @{booking.student_username}
                            </p>
                          )}
                          <p className="text-gray-700 text-sm font-medium">{booking.subject_name}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-4 text-sm text-gray-700">
                        <span className="flex items-center gap-1 font-medium">
                          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          {formatDateTime(displayTime)}
                        </span>
                        <span className="flex items-center gap-1 font-medium">
                          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {getRelativeTime(displayTime)}
                        </span>
                        {booking.duration_minutes && (
                          <span className="flex items-center gap-1 font-medium text-gray-700">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {booking.duration_minutes >= 60 
                              ? `${Math.floor(booking.duration_minutes / 60)}h ${booking.duration_minutes % 60 > 0 ? `${booking.duration_minutes % 60}m` : ''}`
                              : `${booking.duration_minutes}m`
                            }
                          </span>
                        )}
                        <span className="flex items-center gap-1 font-semibold text-green-600">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          ${paidClassesEnabled ? booking.price_ttd : 0} TTD
                        </span>
                      </div>

                      {booking.student_notes && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-sm text-gray-700 italic">"{booking.student_notes}"</p>
                        </div>
                      )}
                    </div>

                    {/* Right: Status & Action */}
                    <div className="flex items-center gap-4">
                      <span className={`
                        px-3 py-1.5 rounded-lg text-sm font-semibold border
                        ${statusColor}
                      `}>
                        {displayStatus}
                      </span>
                      
                      <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

