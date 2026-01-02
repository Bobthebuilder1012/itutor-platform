'use client';

import { useState, useEffect } from 'react';
import { getTutorPublicCalendar } from '@/lib/services/bookingService';
import { TutorPublicCalendar, CalendarSlot } from '@/lib/types/booking';
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

interface TutorCalendarWidgetProps {
  tutorId: string;
  onSlotSelect: (startAt: string, endAt: string) => void;
  maxWeeksAhead?: number;
}

export default function TutorCalendarWidget({
  tutorId,
  onSlotSelect,
  maxWeeksAhead = 4
}: TutorCalendarWidgetProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(new Date());
  const [calendarData, setCalendarData] = useState<TutorPublicCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);

  const weekDays = getWeekDays(currentWeekStart);

  useEffect(() => {
    loadCalendar();
  }, [tutorId, currentWeekStart]);

  async function loadCalendar() {
    setLoading(true);
    try {
      const rangeStart = toISOString(weekDays[0]);
      const rangeEnd = toISOString(new Date(weekDays[6].getTime() + 24 * 60 * 60 * 1000 - 1));
      
      const data = await getTutorPublicCalendar(tutorId, rangeStart, rangeEnd);
      setCalendarData(data);
    } catch (error) {
      console.error('Error loading calendar:', error);
      alert('Failed to load calendar');
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

  // Merge available slots and busy blocks
  const allSlots = mergeCalendarData(calendarData.available_slots, calendarData.busy_blocks);
  const slotsByDate = groupSlotsByDate(allSlots);

  const canGoPrev = currentWeekStart > new Date();
  const canGoNext = addWeeks(currentWeekStart, 1) <= addWeeks(new Date(), maxWeeksAhead);

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

      {/* Legend */}
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

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2">
        {/* Day Headers */}
        {weekDays.map((day, idx) => (
          <div key={idx} className="text-center pb-2 border-b-2 border-indigo-200">
            <div className="text-xs text-indigo-600 uppercase font-semibold">{getDayName(day, true)}</div>
            <div className="text-lg font-bold text-gray-900">
              {day.getDate()}
            </div>
          </div>
        ))}

        {/* Day Columns with Slots */}
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

      {/* Empty state if no slots at all */}
      {allSlots.length === 0 && (
        <div className="text-center py-12 bg-gradient-to-br from-gray-50 to-blue-50 rounded-xl border-2 border-gray-200 mt-4">
          <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-gray-700 font-semibold">No availability this week</p>
          <p className="text-sm text-gray-600 mt-2">Try another week</p>
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

