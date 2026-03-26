'use client';

import { useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfMonth,
  subMonths,
} from 'date-fns';

export interface CalendarPreviewProps {
  sessionDates: Date[];
  timezone: string;
  onDateSelect?: (date: Date) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarPreview({ sessionDates, timezone, onDateSelect }: CalendarPreviewProps) {
  const [activeMonth, setActiveMonth] = useState<Date>(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const monthDays = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(activeMonth),
      end: endOfMonth(activeMonth),
    });
  }, [activeMonth]);

  const leadingBlanks = startOfMonth(activeMonth).getDay();
  const now = new Date();

  const hasSessionOnDate = (day: Date) => sessionDates.some((sessionDate) => isSameDay(sessionDate, day));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setActiveMonth((m) => subMonths(m, 1))}
          className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
        >
          Prev
        </button>
        <p className="text-sm font-semibold text-gray-900">{format(activeMonth, 'MMMM yyyy')}</p>
        <button
          type="button"
          onClick={() => setActiveMonth((m) => addMonths(m, 1))}
          className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
        >
          Next
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-gray-500">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-1">
            {day}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }).map((_, idx) => (
          <div key={`blank-${idx}`} className="h-10 rounded-md" />
        ))}

        {monthDays.map((day) => {
          const hasSession = hasSessionOnDate(day);
          const isToday = isSameDay(day, now);
          const isPast = isBefore(day, new Date(now.toDateString()));

          return (
            <button
              type="button"
              key={day.toISOString()}
              onClick={() => {
                if (!hasSession) return;
                setSelectedDate(day);
                onDateSelect?.(day);
              }}
              className={`relative h-10 rounded-md border text-xs transition ${
                isSameMonth(day, activeMonth) ? 'text-gray-700' : 'text-gray-300'
              } ${isToday ? 'border-blue-400' : 'border-gray-200'} ${
                hasSession ? 'bg-blue-50 hover:bg-blue-100' : 'bg-white'
              } ${isPast ? 'opacity-50' : ''}`}
            >
              {format(day, 'd')}
              {hasSession && <span className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-blue-600" />}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800">
          Session on {format(selectedDate, 'EEEE, MMM d')} at{' '}
          {selectedDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timezone })} {timezone}
        </div>
      )}
    </div>
  );
}

