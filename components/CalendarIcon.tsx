'use client';

import { useState } from 'react';
import ScheduleCalendarModal from '@/components/ScheduleCalendarModal';

interface CalendarIconProps {
  userId: string;
  role: 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin';
  variant?: 'dark' | 'light';
}

export default function CalendarIcon({ userId, role, variant = 'dark' }: CalendarIconProps) {
  const [open, setOpen] = useState(false);

  const btnCls =
    variant === 'light'
      ? 'relative w-9 h-9 flex items-center justify-center text-gray-500 hover:text-itutor-green hover:bg-gray-50 hover:border-itutor-green border border-gray-200 rounded-xl bg-gray-50 transition-colors'
      : 'relative p-1.5 sm:p-2 text-gray-400 hover:text-itutor-white transition-colors rounded-lg hover:bg-gray-800';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={btnCls}
        title="Calendar"
        aria-label="Open schedule calendar"
      >
        <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </button>
      <ScheduleCalendarModal open={open} onClose={() => setOpen(false)} userId={userId} role={role} />
    </>
  );
}
