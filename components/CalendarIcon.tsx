'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

interface CalendarIconProps {
  userId: string;
  role: 'student' | 'tutor' | 'parent' | 'reviewer';
}

export default function CalendarIcon({ userId, role }: CalendarIconProps) {
  const router = useRouter();

  function handleClick() {
    if (role === 'tutor') {
      router.push('/tutor/calendar');
    } else if (role === 'student') {
      router.push('/student/sessions');
    }
  }

  return (
    <button
      onClick={handleClick}
      className="relative p-2 text-gray-400 hover:text-itutor-white transition-colors rounded-lg hover:bg-gray-800"
      title={role === 'tutor' ? 'Calendar' : 'My Sessions'}
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </button>
  );
}


