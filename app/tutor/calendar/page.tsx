'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { getDisplayName } from '@/lib/utils/displayName';
import { formatDateTime, formatTime } from '@/lib/utils/calendar';

type CalendarEvent = {
  id: string;
  type: 'booking' | 'availability' | 'unavailable';
  title: string;
  start: string;
  end: string;
  color: string;
  student_name?: string;
  subject_name?: string;
  status?: string;
  day_of_week?: number;
  reason?: string;
};

export default function TutorCalendarPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }

    loadCalendarData();
  }, [profile, profileLoading, router, selectedDate]);

  async function loadCalendarData() {
    if (!profile) return;

    setLoading(true);
    try {
      // Calculate date range (current week)
      const startOfWeek = new Date(selectedDate);
      startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);

      const allEvents: CalendarEvent[] = [];

      // 1. Fetch confirmed bookings
      const { data: bookings } = await supabase
        .from('bookings')
        .select(`
          id,
          confirmed_start_at,
          confirmed_end_at,
          status,
          student_id,
          subject_id
        `)
        .eq('tutor_id', profile.id)
        .eq('status', 'CONFIRMED')
        .gte('confirmed_start_at', startOfWeek.toISOString())
        .lte('confirmed_start_at', endOfWeek.toISOString())
        .order('confirmed_start_at');

      if (bookings) {
        for (const booking of bookings) {
          // Fetch student name
          const { data: student } = await supabase
            .from('profiles')
            .select('username, display_name, full_name')
            .eq('id', booking.student_id)
            .single();

          // Fetch subject name
          const { data: subject } = await supabase
            .from('subjects')
            .select('name, label')
            .eq('id', booking.subject_id)
            .single();

          allEvents.push({
            id: booking.id,
            type: 'booking',
            title: `Session with ${student ? getDisplayName(student) : 'Student'}`,
            start: booking.confirmed_start_at!,
            end: booking.confirmed_end_at!,
            color: 'bg-green-500/20 border-green-500',
            student_name: student ? getDisplayName(student) : 'Unknown',
            subject_name: subject?.label || subject?.name || 'Unknown Subject',
            status: booking.status
          });
        }
      }

      // 2. Fetch unavailability blocks
      const { data: blocks } = await supabase
        .from('tutor_unavailability_blocks')
        .select('*')
        .eq('tutor_id', profile.id)
        .gte('start_at', startOfWeek.toISOString())
        .lte('start_at', endOfWeek.toISOString())
        .order('start_at');

      if (blocks) {
        blocks.forEach(block => {
          allEvents.push({
            id: block.id,
            type: 'unavailable',
            title: 'Unavailable',
            start: block.start_at,
            end: block.end_at,
            color: 'bg-red-500/20 border-red-500',
            reason: block.reason_private
          });
        });
      }

      // 3. Fetch availability rules (for display)
      const { data: rules } = await supabase
        .from('tutor_availability_rules')
        .select('*')
        .eq('tutor_id', profile.id)
        .eq('is_active', true);

      if (rules) {
        rules.forEach(rule => {
          allEvents.push({
            id: rule.id,
            type: 'availability',
            title: 'Teaching Hours',
            start: rule.start_time,
            end: rule.end_time,
            color: 'bg-blue-500/10 border-blue-500 border-dashed',
            day_of_week: rule.day_of_week
          });
        });
      }

      setEvents(allEvents);
    } catch (error) {
      console.error('Error loading calendar:', error);
    } finally {
      setLoading(false);
    }
  }

  function previousWeek() {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 7);
    setSelectedDate(newDate);
  }

  function nextWeek() {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 7);
    setSelectedDate(newDate);
  }

  function goToToday() {
    setSelectedDate(new Date());
  }

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  const startOfWeek = new Date(selectedDate);
  startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay());

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <DashboardLayout role="tutor" userName={getDisplayName(profile)}>
      <div className="px-4 py-6 sm:px-0 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">My Calendar</h1>
            <p className="text-gray-600">View and manage your teaching schedule</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={goToToday}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-itutor-white rounded-lg font-medium transition"
            >
              Today
            </button>
            <button
              onClick={() => router.push('/tutor/availability')}
              className="px-4 py-2 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white rounded-lg font-semibold transition"
            >
              Manage Availability
            </button>
          </div>
        </div>

        {/* Week Navigation */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-2xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <button
              onClick={previousWeek}
              className="p-2 hover:bg-gray-700 rounded-lg transition"
            >
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <h2 className="text-xl font-bold text-gray-900">
              {startOfWeek.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} - {' '}
              {new Date(startOfWeek.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
            </h2>

            <button
              onClick={nextWeek}
              className="p-2 hover:bg-gray-700 rounded-lg transition"
            >
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Calendar View */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-itutor-green"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500/20 border border-green-500 rounded"></div>
                <span className="text-gray-700 font-medium">Confirmed Sessions</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500/20 border border-red-500 rounded"></div>
                <span className="text-gray-700 font-medium">Unavailable</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500/10 border border-blue-500 border-dashed rounded"></div>
                <span className="text-gray-700 font-medium">Teaching Hours</span>
              </div>
            </div>

            {/* Week View */}
            <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
              {daysOfWeek.map((day, index) => {
                const currentDay = new Date(startOfWeek);
                currentDay.setDate(startOfWeek.getDate() + index);
                
                const dayEvents = events.filter(event => {
                  if (event.type === 'availability') {
                    return event.day_of_week === index;
                  }
                  const eventDate = new Date(event.start);
                  return eventDate.toDateString() === currentDay.toDateString();
                });

                const isToday = currentDay.toDateString() === new Date().toDateString();

                return (
                  <div
                    key={index}
                    className={`bg-gradient-to-br from-gray-800 to-gray-900 border rounded-xl p-4 min-h-[300px] ${
                      isToday ? 'border-itutor-green' : 'border-gray-700'
                    }`}
                  >
                    <div className="mb-3">
                      <h3 className={`font-bold ${isToday ? 'text-itutor-green' : 'text-itutor-white'}`}>
                        {day}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {currentDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>

                    <div className="space-y-2">
                      {dayEvents.length === 0 ? (
                        <p className="text-xs text-gray-500 text-center py-4">No events</p>
                      ) : (
                        dayEvents.map((event, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              if (event.type === 'booking') {
                                router.push(`/tutor/bookings/${event.id}`);
                              } else if (event.type === 'unavailable') {
                                router.push('/tutor/availability');
                              }
                            }}
                            className={`w-full text-left p-2 rounded-lg border ${event.color} hover:opacity-80 transition`}
                          >
                            <p className="text-xs font-semibold text-itutor-white truncate">
                              {event.title}
                            </p>
                            {event.type !== 'availability' && (
                              <p className="text-xs text-gray-400">
                                {formatTime(event.start)} - {formatTime(event.end)}
                              </p>
                            )}
                            {event.student_name && (
                              <p className="text-xs text-gray-500 truncate">{event.student_name}</p>
                            )}
                            {event.subject_name && (
                              <p className="text-xs text-gray-500 truncate">{event.subject_name}</p>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Upcoming Sessions List */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-2xl p-6">
              <h2 className="text-2xl font-bold text-itutor-white mb-4">Upcoming Sessions This Week</h2>
              
              {events.filter(e => e.type === 'booking').length === 0 ? (
                <p className="text-gray-400 text-center py-8">No confirmed sessions this week</p>
              ) : (
                <div className="space-y-3">
                  {events
                    .filter(e => e.type === 'booking')
                    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
                    .map(event => (
                      <button
                        key={event.id}
                        onClick={() => router.push(`/tutor/bookings/${event.id}`)}
                        className="w-full text-left p-4 bg-gray-800/50 border border-gray-700 hover:border-itutor-green rounded-lg transition"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-itutor-white mb-1">{event.title}</h3>
                            <p className="text-sm text-gray-400">{event.subject_name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-itutor-white">{formatDateTime(event.start)}</p>
                            <p className="text-xs text-gray-500">{formatTime(event.start)} - {formatTime(event.end)}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}





