'use client';

import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth } from 'date-fns';

export default function CalendarPreview({
  events,
  monthDate = new Date(),
}: {
  events: Array<{ id: string; scheduledAt: string }>;
  monthDate?: Date;
}) {
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  const days = eachDayOfInterval({ start, end });
  const monthLabel = format(monthDate, 'MMMM yyyy');

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 text-sm font-semibold text-gray-900">{monthLabel}</div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: start.getDay() }).map((_, i) => (
          <div key={`pad-${i}`} className="h-9 rounded-md bg-transparent" />
        ))}
        {days.map((day) => {
          const hasEvent = events.some((e) => isSameDay(new Date(e.scheduledAt), day));
          return (
            <div
              key={day.toISOString()}
              className={`h-9 rounded-md border text-xs flex items-center justify-center ${
                isSameMonth(day, monthDate) ? 'border-gray-200 text-gray-700' : 'border-transparent text-gray-300'
              } ${hasEvent ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold' : 'bg-white'}`}
            >
              {format(day, 'd')}
            </div>
          );
        })}
      </div>
    </div>
  );
}

