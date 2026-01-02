// =====================================================
// LESSON OFFERS TYPES
// =====================================================

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'countered' | 'expired';

export type LastActionBy = 'tutor' | 'student';

export interface LessonOffer {
  id: string;
  tutor_id: string;
  student_id: string;
  subject_id: string; // UUID reference to subjects table
  proposed_start_at: string; // ISO timestamp
  duration_minutes: number;
  tutor_note: string | null;
  status: OfferStatus;
  counter_proposed_start_at: string | null; // ISO timestamp
  counter_tutor_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface LessonOfferWithDetails extends LessonOffer {
  tutor_name?: string;
  tutor_username?: string;
  tutor_avatar_url?: string | null;
  student_name?: string;
  student_username?: string;
  student_avatar_url?: string | null;
  student_school?: string | null;
}

export interface CreateOfferPayload {
  student_id: string;
  subject_id: string; // UUID
  proposed_start_at: string;
  duration_minutes: number;
  tutor_note?: string;
}

export interface CounterOfferPayload {
  counter_proposed_start_at: string;
  counter_tutor_note?: string;
}

// Helper functions
export function getOfferStatusColor(status: OfferStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
    case 'accepted':
      return 'bg-green-500/20 text-green-400 border-green-500/50';
    case 'declined':
      return 'bg-red-500/20 text-red-400 border-red-500/50';
    case 'countered':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    case 'expired':
      return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
  }
}

export function getOfferStatusLabel(status: OfferStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'accepted':
      return 'Accepted';
    case 'declined':
      return 'Declined';
    case 'countered':
      return 'Counter-Offered';
    case 'expired':
      return 'Expired';
    default:
      return status;
  }
}

export function formatOfferDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

export function formatOfferDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export function formatOfferTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${remainingMinutes} min`;
}

