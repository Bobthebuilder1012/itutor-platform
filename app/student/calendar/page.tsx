'use client';

import { CalendarView } from '@/components/student/CalendarPanel';
import { useEffect, useState } from 'react';

export default function StudentCalendarPage() {
  const [initial, setInitial] = useState<'day' | 'week'>('week');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches) {
      setInitial('day');
    }
  }, []);

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-7rem)] flex flex-col">
      <h1 className="text-xl sm:text-2xl font-bold text-ink mb-3 px-1">Calendar</h1>
      <div className="flex-1 rounded-2xl bg-background border border-border overflow-hidden">
        <CalendarView initialView={initial} />
      </div>
    </div>
  );
}
