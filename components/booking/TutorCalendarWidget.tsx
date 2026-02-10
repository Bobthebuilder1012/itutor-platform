'use client';

import { useState, useEffect } from 'react';
import { getTutorPublicCalendar } from '@/lib/services/bookingService';
import { TutorPublicCalendar, CalendarSlot, AvailabilityWindow } from '@/lib/types/booking';
import { 
  getWeekDays, 
  formatDate, 
  formatTime, 
  addWeeks,
  getDayName,
  groupSlotsByDate,
  mergeCalendarData,
  toISOString
} from '@/lib/utils/calendar';
import FlexibleTimePicker from './FlexibleTimePicker';

interface TutorCalendarWidgetProps {
  tutorId: string;
  onSlotSelect: (startAt: string, endAt: string) => void;
  maxWeeksAhead?: number;
  sessionDurations?: { label: string; minutes: number }[];
}

export default function TutorCalendarWidget({
  tutorId,
  onSlotSelect,
  maxWeeksAhead = 4,
  sessionDurations = [
    { label: '30 minutes', minutes: 30 },
    { label: '1 hour', minutes: 60 },
    { label: '1.5 hours', minutes: 90 },
    { label: '2 hours', minutes: 120 },
  ]
}: TutorCalendarWidgetProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(new Date());
  const [calendarData, setCalendarData] = useState<TutorPublicCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<'calendar' | 'time-picker'>('calendar');

  const weekDays = getWeekDays(currentWeekStart);

  useEffect(() => {
    loadCalendar();
  }, [tutorId, currentWeekStart]);

  async function loadCalendar() {
    setLoading(true);
    try {
      const rangeStart = toISOString(weekDays[0]);
      const rangeEnd = toISOString(new Date(weekDays[6].getTime() + 24 * 60 * 60 * 1000 - 1));
      
      console.log('Loading calendar for tutor:', tutorId);
      console.log('Date range:', rangeStart, 'to', rangeEnd);
      
      const data = await getTutorPublicCalendar(tutorId, rangeStart, rangeEnd);
      
      console.log('Calendar data received:', data);
      console.log('Data structure:', {
        has_availability_windows: !!data?.availability_windows,
        has_available_slots: !!data?.available_slots,
        has_busy_blocks: !!data?.busy_blocks,
        allows_flexible: data?.allows_flexible_booking
      });
      
      // Ensure busy_blocks is always an array
      const normalizedData = {
        ...data,
        busy_blocks: data?.busy_blocks || [],
        available_slots: data?.available_slots || [],
        availability_windows: data?.availability_windows || []
      };
      
      setCalendarData(normalizedData);
    } catch (error) {
      console.error('Error loading calendar:', error);
      alert('Failed to load calendar: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }

  function handlePrevWeek() {
    const newStart = addWeeks(currentWeekStart, -1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (newStart >= today) {
      setCurrentWeekStart(newStart);
    }
  }

  function handleNextWeek() {
    const newStart = addWeeks(currentWeekStart, 1);
    const maxDate = addWeeks(new Date(), maxWeeksAhead);
    
    if (newStart <= maxDate) {
      setCurrentWeekStart(newStart);
    }
  }

  function handleSlotClick(slot: CalendarSlot) {
    if (!slot.isSelectable) return;
    
    setSelectedSlot({ start: slot.start_at, end: slot.end_at });
    onSlotSelect(slot.start_at, slot.end_at);
  }

  if (loading && !calendarData) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-itutor-green"></div>
        <span className="ml-3 text-gray-600">Loading calendar...</span>
      </div>
    );
  }

  if (!calendarData) {
    return (
      <div className="text-center py-12 text-gray-600">
        <p>Unable to load calendar</p>
      </div>
    );
  }

  // Check if tutor supports flexible booking
  const supportsFlexible = calendarData?.allows_flexible_booking || false;
  
  // Merge available slots and busy blocks (for legacy mode)
  const allSlots = supportsFlexible 
    ? []  // In flexible mode, we don't use fixed slots
    : mergeCalendarData(calendarData?.available_slots || [], calendarData?.busy_blocks || []);
  const slotsByDate = groupSlotsByDate(allSlots);

  const canGoPrev = currentWeekStart > new Date();
  const canGoNext = addWeeks(currentWeekStart, 1) <= addWeeks(new Date(), maxWeeksAhead);

  // Handle date selection (for flexible booking)
  function handleDateSelect(date: Date) {
    setSelectedDate(date);
    setViewMode('time-picker');
  }

  // Handle time selection from flexible picker
  function handleTimeSelection(startAt: string, endAt: string) {
    setSelectedSlot({ start: startAt, end: endAt });
    onSlotSelect(startAt, endAt);
  }

  // Get availability windows for selected date
  function getWindowsForDate(date: Date): AvailabilityWindow[] {
    if (!calendarData?.availability_windows) return [];
    
    return calendarData.availability_windows.filter(window => {
      const windowStart = new Date(window.start_at);
      return windowStart.toDateString() === date.toDateString();
    });
  }

  // Get busy blocks for selected date
  function getBusyBlocksForDate(date: Date) {
    if (!calendarData?.busy_blocks) return [];
    
    return calendarData.busy_blocks.filter(block => {
      const blockStart = new Date(block.start_at);
      return blockStart.toDateString() === date.toDateString();
    });
  }

  // Check if a date has availability
  function hasAvailability(date: Date): boolean {
    if (supportsFlexible) {
      return getWindowsForDate(date).length > 0;
    } else {
      const dateKey = date.toDateString();
      const daySlots = slotsByDate.get(dateKey) || [];
      return daySlots.some(slot => slot.status === 'available');
    }
  }

  return (
    <div className="bg-white border-2 border-pink-200 shadow-xl rounded-2xl p-6 hover:shadow-pink-300/50 transition-all duration-300">
      {/* Header with week navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={handlePrevWeek}
          disabled={!canGoPrev}
          className="p-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition shadow-md"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <h3 className="text-xl font-bold text-gray-900">
          {formatDate(weekDays[0])} - {formatDate(weekDays[6])}
        </h3>

        <button
          onClick={handleNextWeek}
          disabled={!canGoNext}
          className="p-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition shadow-md"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Flexible Booking Notice */}
      {supportsFlexible && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700 font-medium">
            <span className="font-bold">Flexible Booking:</span> Select a date below, then choose your preferred start time and session duration!
          </p>
        </div>
      )}

      {/* View toggle - only for flexible mode */}
      {supportsFlexible && viewMode === 'time-picker' && selectedDate && (
        <div className="mb-4">
          <button
            onClick={() => setViewMode('calendar')}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to calendar
          </button>
        </div>
      )}

      {viewMode === 'calendar' && (
        <>
          {/* Legend */}
          {!supportsFlexible && (
            <div className="flex flex-wrap gap-4 mb-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gradient-to-br from-itutor-green to-emerald-600 rounded shadow-sm"></div>
                <span className="text-gray-700 font-medium">Available</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gradient-to-br from-gray-400 to-gray-500 rounded shadow-sm"></div>
                <span className="text-gray-700 font-medium">Booked</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gradient-to-br from-red-500 to-red-600 rounded shadow-sm"></div>
                <span className="text-gray-700 font-medium">Unavailable</span>
              </div>
            </div>
          )}

          {/* Calendar Grid */}
          <div className="flex flex-col">
            {/* Day Headers - Fixed */}
            <div className="grid grid-cols-7 gap-2 mb-2">
              {weekDays.map((day, idx) => (
                <div key={idx} className="text-center pb-2 border-b-2 border-indigo-200">
                  <div className="text-xs text-indigo-600 uppercase font-semibold">{getDayName(day, true)}</div>
                  <div className="text-lg font-bold text-gray-900">
                    {day.getDate()}
                  </div>
                </div>
              ))}
            </div>

            {supportsFlexible ? (
              // Flexible mode: Show dates as selectable buttons
              <div className="grid grid-cols-7 gap-2">
                {weekDays.map((day, dayIdx) => {
                  const available = hasAvailability(day);
                  const isPast = day < new Date(new Date().setHours(0, 0, 0, 0));

                  return (
                    <button
                      key={dayIdx}
                      onClick={() => available && !isPast ? handleDateSelect(day) : null}
                      disabled={!available || isPast}
                      className={`
                        min-h-[80px] p-3 rounded-lg border-2 transition-all
                        ${available && !isPast 
                          ? 'bg-gradient-to-br from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green border-green-300 text-white cursor-pointer hover:scale-105 hover:shadow-md' 
                          : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                        }
                      `}
                    >
                      <div className="text-sm font-semibold">
                        {available && !isPast ? 'Available' : isPast ? 'Past' : 'No times'}
                      </div>
                      {available && !isPast && (
                        <div className="text-xs mt-1 opacity-90">Click to book</div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              // Legacy mode: Show fixed time slots
              <div className="overflow-y-auto max-h-[600px] scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400">
                <div className="grid grid-cols-7 gap-2">
                  {weekDays.map((day, dayIdx) => {
                    const dateKey = day.toDateString();
                    const daySlots = slotsByDate.get(dateKey) || [];

                    return (
                      <div key={dayIdx} className="min-h-[300px] flex flex-col gap-2 pt-2">
                        {daySlots.length === 0 ? (
                          <div className="flex-1 flex items-center justify-center text-xs text-gray-500 bg-gray-50 rounded-lg">
                            No times
                          </div>
                        ) : (
                          daySlots.map((slot, slotIdx) => {
                            const isSelected = selectedSlot?.start === slot.start_at;
                            
                            let bgColor = 'bg-gradient-to-br from-gray-400 to-gray-500';
                            let hoverColor = '';
                            let cursor = 'cursor-not-allowed';
                            let textColor = 'text-white';
                            let ringColor = '';

                            if (slot.status === 'available') {
                              bgColor = 'bg-gradient-to-br from-itutor-green to-emerald-600';
                              hoverColor = 'hover:from-emerald-600 hover:to-itutor-green hover:scale-105 hover:shadow-md';
                              cursor = 'cursor-pointer';
                              textColor = 'text-white';
                            } else if (slot.status === 'unavailable') {
                              bgColor = 'bg-gradient-to-br from-red-500 to-red-600';
                            }

                            if (isSelected) {
                              bgColor = 'bg-gradient-to-br from-blue-500 to-purple-600';
                              ringColor = 'ring-2 ring-blue-400 ring-offset-2';
                            }

                            return (
                              <button
                                key={slotIdx}
                                onClick={() => handleSlotClick(slot)}
                                disabled={!slot.isSelectable}
                                className={`
                                  ${bgColor} ${hoverColor} ${cursor} ${textColor} ${ringColor}
                                  p-2 rounded-lg text-xs font-semibold transition-all shadow-sm
                                  disabled:opacity-70
                                `}
                                title={
                                  slot.status === 'available' 
                                    ? 'Click to book'
                                    : slot.status === 'booked'
                                    ? 'Already booked'
                                    : 'Unavailable'
                                }
                              >
                                {formatTime(slot.start_at)}
                              </button>
                            );
                          })
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Empty state if no availability */}
          {supportsFlexible && !weekDays.some(hasAvailability) && (
            <div className="text-center py-12 bg-gradient-to-br from-gray-50 to-blue-50 rounded-xl border-2 border-gray-200 mt-4">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-700 font-semibold">No availability this week</p>
              <p className="text-sm text-gray-600 mt-2">Try another week</p>
            </div>
          )}
          {!supportsFlexible && allSlots.length === 0 && (
            <div className="text-center py-12 bg-gradient-to-br from-gray-50 to-blue-50 rounded-xl border-2 border-gray-200 mt-4">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-700 font-semibold">No availability this week</p>
              <p className="text-sm text-gray-600 mt-2">Try another week</p>
            </div>
          )}
        </>
      )}

      {/* Time Picker View - shown when a date is selected in flexible mode */}
      {viewMode === 'time-picker' && selectedDate && supportsFlexible && (
        <div className="mt-4">
          <h4 className="text-lg font-bold text-gray-900 mb-3">
            {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </h4>
          <FlexibleTimePicker
            date={selectedDate}
            availabilityWindows={getWindowsForDate(selectedDate)}
            busyBlocks={getBusyBlocksForDate(selectedDate)}
            onTimeSelect={handleTimeSelection}
            sessionDurations={sessionDurations}
          />
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-2xl">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-200 border-t-itutor-green"></div>
            <p className="text-sm text-gray-700 font-medium">Updating calendar...</p>
          </div>
        </div>
      )}
    </div>
  );
}

