// =====================================================
// BOOKING SYSTEM TYPES
// =====================================================

export type BookingStatus = 
  | 'PENDING'
  | 'COUNTER_PROPOSED'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'NO_SHOW';

export type MessageType = 'text' | 'time_proposal' | 'system';

export type LastActionBy = 'student' | 'tutor';

// Tutor Availability Rule (recurring teaching hours)
export interface TutorAvailabilityRule {
  id: string;
  tutor_id: string;
  day_of_week: number; // 0-6 (Sunday-Saturday)
  start_time: string; // HH:MM:SS
  end_time: string;
  slot_minutes: number;
  buffer_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Tutor Unavailability Block (override availability)
export interface TutorUnavailabilityBlock {
  id: string;
  tutor_id: string;
  start_at: string; // ISO timestamp
  end_at: string;
  is_recurring: boolean;
  rrule?: string | null;
  reason_private?: string | null; // Only visible to tutor
  created_at: string;
  updated_at: string;
}

// Session Type (duration/pricing template)
export interface SessionType {
  id: string;
  tutor_id: string;
  subject_id: string;
  name: string; // e.g., "Standard Session", "Trial Session"
  duration_minutes: number;
  price_ttd: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Main Booking
export interface Booking {
  id: string;
  student_id: string;
  tutor_id: string;
  subject_id: string;
  session_type_id: string;
  
  // Requested time
  requested_start_at: string;
  requested_end_at: string;
  
  // Confirmed time (null until confirmed)
  confirmed_start_at: string | null;
  confirmed_end_at: string | null;
  
  // Status
  status: BookingStatus;
  last_action_by: LastActionBy | null;
  
  // Pricing
  price_ttd: number;
  
  // Notes
  student_notes: string | null;
  tutor_notes: string | null;
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

// Booking with related data
export interface BookingWithDetails extends Booking {
  student_name?: string;
  student_username?: string;
  tutor_name?: string;
  tutor_username?: string;
  subject_name?: string;
  session_type_name?: string;
  unread_count?: number;
}

// Booking Message
export interface BookingMessage {
  id: string;
  booking_id: string;
  sender_id: string;
  message_type: MessageType;
  body: string | null;
  
  // For time proposals
  proposed_start_at: string | null;
  proposed_end_at: string | null;
  
  created_at: string;
}

// Booking Message with sender info
export interface BookingMessageWithSender extends BookingMessage {
  sender_name: string;
  sender_username?: string;
  sender_role?: 'student' | 'tutor';
  is_own_message: boolean;
}

// Tutor Response Metrics
export interface TutorResponseMetrics {
  tutor_id: string;
  avg_first_response_seconds_30d: number | null;
  total_bookings_30d: number;
  total_confirmed_30d: number;
  updated_at: string;
}

// Public Calendar Data (returned by get_tutor_public_calendar RPC)
export interface TutorPublicCalendar {
  available_slots: TimeSlot[];
  busy_blocks: BusyBlock[];
}

export interface TimeSlot {
  start_at: string; // ISO timestamp
  end_at: string;
}

export interface BusyBlock {
  start_at: string;
  end_at: string;
  type: 'BOOKED' | 'UNAVAILABLE';
}

// Availability Summary (for tutor profile display)
export interface TutorAvailabilitySummary {
  has_availability: boolean;
  days_with_hours: number[]; // Array of day numbers (0-6)
  earliest_available: string | null; // ISO timestamp
}

// UI-specific types
export interface CalendarSlot extends TimeSlot {
  status: 'available' | 'booked' | 'unavailable';
  isSelectable: boolean;
}

export interface BookingRequestData {
  tutor_id: string;
  subject_id: string;
  session_type_id: string;
  requested_start_at: string;
  requested_end_at: string;
  student_notes?: string;
}

export interface CounterOfferData {
  booking_id: string;
  proposed_start_at: string;
  proposed_end_at: string;
  message?: string;
}

// RPC function parameters
export interface GetTutorCalendarParams {
  p_tutor_id: string;
  p_range_start: string;
  p_range_end: string;
}

export interface CreateBookingRequestParams {
  p_student_id: string;
  p_tutor_id: string;
  p_subject_id: string;
  p_session_type_id: string;
  p_requested_start_at: string;
  p_requested_end_at: string;
  p_student_notes?: string;
}

export interface TutorConfirmBookingParams {
  p_booking_id: string;
}

export interface TutorDeclineBookingParams {
  p_booking_id: string;
  p_message?: string;
}

export interface TutorCounterOfferParams {
  p_booking_id: string;
  p_proposed_start_at: string;
  p_proposed_end_at: string;
  p_message?: string;
}

export interface StudentAcceptCounterParams {
  p_booking_id: string;
  p_message_id: string;
}

export interface StudentCancelBookingParams {
  p_booking_id: string;
  p_reason?: string;
}

export interface AddBookingMessageParams {
  p_booking_id: string;
  p_message: string;
}

// Day of week helpers
export const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
] as const;

export const DAYS_OF_WEEK_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// Time utilities
export function formatAvgResponseTime(seconds: number | null): string {
  if (!seconds) return 'N/A';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `~${days}d`;
  }
  if (hours > 0) {
    return `~${hours}h`;
  }
  if (minutes > 0) {
    return `~${minutes}m`;
  }
  return '< 1m';
}

// Booking status helpers
export function getBookingStatusColor(status: BookingStatus): string {
  switch (status) {
    case 'PENDING':
      return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30';
    case 'COUNTER_PROPOSED':
      return 'text-blue-400 bg-blue-400/10 border-blue-400/30';
    case 'CONFIRMED':
      return 'text-green-400 bg-green-400/10 border-green-400/30';
    case 'DECLINED':
      return 'text-red-400 bg-red-400/10 border-red-400/30';
    case 'CANCELLED':
      return 'text-red-400 bg-red-400/10 border-red-400/30';
    case 'COMPLETED':
      return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30';
    case 'NO_SHOW':
      return 'text-orange-400 bg-orange-400/10 border-orange-400/30';
    default:
      return 'text-gray-400 bg-gray-400/10 border-gray-400/30';
  }
}

export function getBookingStatusLabel(status: BookingStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Pending';
    case 'COUNTER_PROPOSED':
      return 'Counter Offer';
    case 'CONFIRMED':
      return 'Confirmed';
    case 'DECLINED':
      return 'Declined';
    case 'CANCELLED':
      return 'Cancelled';
    case 'COMPLETED':
      return 'Completed';
    case 'NO_SHOW':
      return 'No Show';
    default:
      return status;
  }
}


