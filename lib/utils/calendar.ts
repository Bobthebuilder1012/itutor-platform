// =====================================================
// CALENDAR UTILITY FUNCTIONS
// Helper functions for calendar operations
// =====================================================

import { TimeSlot, BusyBlock, CalendarSlot } from '@/lib/types/booking';

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Format time for display (12-hour format)
 */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Format date and time together
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Format time range
 */
export function formatTimeRange(start: Date | string, end: Date | string): string {
  return `${formatTime(start)} - ${formatTime(end)}`;
}

/**
 * Get start of week (Sunday)
 */
export function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/**
 * Get end of week (Saturday 23:59:59)
 */
export function getEndOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  d.setDate(d.getDate() + (6 - d.getDay()));
  return d;
}

/**
 * Generate array of dates for a week
 */
export function getWeekDays(startDate: Date): Date[] {
  const days: Date[] = [];
  const start = getStartOfWeek(startDate);
  
  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    days.push(day);
  }
  
  return days;
}

/**
 * Check if two date ranges overlap
 */
export function timeRangesOverlap(
  start1: Date | string,
  end1: Date | string,
  start2: Date | string,
  end2: Date | string
): boolean {
  const s1 = typeof start1 === 'string' ? new Date(start1) : start1;
  const e1 = typeof end1 === 'string' ? new Date(end1) : end1;
  const s2 = typeof start2 === 'string' ? new Date(start2) : start2;
  const e2 = typeof end2 === 'string' ? new Date(end2) : end2;
  
  return s1 < e2 && e1 > s2;
}

/**
 * Check if a date is today
 */
export function isToday(date: Date): boolean {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

/**
 * Check if a date is in the past
 */
export function isPast(date: Date): boolean {
  return date < new Date();
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add weeks to a date
 */
export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

/**
 * Get day name (short)
 */
export function getDayName(date: Date, short: boolean = true): string {
  return date.toLocaleDateString('en-US', {
    weekday: short ? 'short' : 'long'
  });
}

/**
 * Convert TimeSlots and BusyBlocks to CalendarSlots
 */
export function mergeCalendarData(
  availableSlots: TimeSlot[],
  busyBlocks: BusyBlock[]
): CalendarSlot[] {
  const slots: CalendarSlot[] = [];
  
  // Add available slots
  availableSlots.forEach(slot => {
    slots.push({
      start_at: slot.start_at,
      end_at: slot.end_at,
      status: 'available',
      isSelectable: true
    });
  });
  
  // Add busy blocks
  busyBlocks.forEach(block => {
    slots.push({
      start_at: block.start_at,
      end_at: block.end_at,
      status: block.type === 'BOOKED' ? 'booked' : 'unavailable',
      isSelectable: false
    });
  });
  
  // Sort by start time
  slots.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  
  return slots;
}

/**
 * Group slots by date
 */
export function groupSlotsByDate(slots: CalendarSlot[]): Map<string, CalendarSlot[]> {
  const grouped = new Map<string, CalendarSlot[]>();
  
  slots.forEach(slot => {
    const date = new Date(slot.start_at).toDateString();
    if (!grouped.has(date)) {
      grouped.set(date, []);
    }
    grouped.get(date)!.push(slot);
  });
  
  return grouped;
}

/**
 * Get time grid (hours of day)
 */
export function getTimeGrid(startHour: number = 6, endHour: number = 22): string[] {
  const times: string[] = [];
  
  for (let hour = startHour; hour <= endHour; hour++) {
    const h = hour % 12 || 12;
    const ampm = hour < 12 ? 'AM' : 'PM';
    times.push(`${h}:00 ${ampm}`);
  }
  
  return times;
}

/**
 * Calculate slot position in a day view
 */
export function getSlotPosition(
  slotStart: Date | string,
  dayStart: number = 6, // 6 AM
  dayEnd: number = 22 // 10 PM
): { top: number; height: number } {
  const start = typeof slotStart === 'string' ? new Date(slotStart) : slotStart;
  const hour = start.getHours();
  const minute = start.getMinutes();
  
  const totalMinutesInDay = (dayEnd - dayStart) * 60;
  const minutesFromStart = (hour - dayStart) * 60 + minute;
  
  const top = (minutesFromStart / totalMinutesInDay) * 100;
  
  return { top, height: 8.33 }; // Default height (1 hour = ~8.33% of 12-hour day)
}

/**
 * Round time to nearest slot interval
 */
export function roundToSlotInterval(date: Date, intervalMinutes: number = 30): Date {
  const rounded = new Date(date);
  const minutes = rounded.getMinutes();
  const roundedMinutes = Math.round(minutes / intervalMinutes) * intervalMinutes;
  rounded.setMinutes(roundedMinutes);
  rounded.setSeconds(0);
  rounded.setMilliseconds(0);
  return rounded;
}

/**
 * Create ISO timestamp string (for API calls)
 */
export function toISOString(date: Date): string {
  return date.toISOString();
}

/**
 * Parse ISO timestamp to Date
 */
export function fromISOString(iso: string): Date {
  return new Date(iso);
}

/**
 * Get duration in minutes
 */
export function getDurationMinutes(start: Date | string, end: Date | string): number {
  const s = typeof start === 'string' ? new Date(start) : start;
  const e = typeof end === 'string' ? new Date(end) : end;
  return Math.round((e.getTime() - s.getTime()) / 60000);
}

/**
 * Format duration
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${mins}m`;
}

/**
 * Check if slot is within allowed booking window (max 30 days)
 */
export function isWithinBookingWindow(date: Date | string, maxDays: number = 30): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const maxDate = addDays(now, maxDays);
  return d >= now && d <= maxDate;
}

/**
 * Get relative time string (e.g., "in 2 hours", "tomorrow")
 */
export function getRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMinutes < 0) return 'Past';
  if (diffMinutes < 60) return `in ${diffMinutes}m`;
  if (diffHours < 24) return `in ${diffHours}h`;
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return `in ${diffDays}d`;
  return formatDate(d);
}





