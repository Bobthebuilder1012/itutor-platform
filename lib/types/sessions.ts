// =====================================================
// SESSIONS TYPES
// =====================================================

export type VideoProvider = 'google_meet' | 'zoom';

export type ConnectionStatus = 'connected' | 'needs_reauth' | 'disconnected';

export type SessionStatus =
  | 'SCHEDULED'
  | 'JOIN_OPEN'
  | 'COMPLETED_ASSUMED'
  | 'NO_SHOW_STUDENT'
  | 'EARLY_END_SHORT'
  | 'CANCELLED';

export interface TutorVideoConnection {
  id: string;
  tutor_id: string;
  provider: VideoProvider;
  is_active: boolean;
  connection_status: ConnectionStatus;
  provider_account_email: string | null;
  provider_account_name: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  booking_id: string;
  tutor_id: string;
  student_id: string;
  provider: VideoProvider;
  meeting_external_id: string | null;
  join_url: string | null;
  scheduled_start_at: string;
  scheduled_end_at: string;
  duration_minutes: number;
  no_show_wait_minutes: number;
  min_payable_minutes: number;
  meeting_created_at: string | null;
  meeting_started_at: string | null;
  meeting_ended_at: string | null;
  tutor_marked_no_show_at: string | null;
  status: SessionStatus;
  charge_scheduled_at: string;
  charged_at: string | null;
  charge_amount_ttd: number;
  payout_amount_ttd: number;
  platform_fee_ttd: number;
  notes: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface SessionEvent {
  id: string;
  session_id: string;
  provider: VideoProvider;
  event_type: string;
  payload: Record<string, any>;
  received_at: string;
}

export interface SessionRules {
  no_show_wait_minutes: number;
  min_payable_minutes: number;
}

export interface MeetingInfo {
  meeting_external_id: string;
  join_url: string;
  meeting_created_at: string;
}

export interface MeetingState {
  meeting_started_at?: string;
  meeting_ended_at?: string;
}

// Helper functions
export function calculateSessionRules(durationMinutes: number): SessionRules {
  return {
    no_show_wait_minutes: Math.floor(durationMinutes * 0.33),
    min_payable_minutes: Math.floor(durationMinutes * 0.66)
  };
}

export function canMarkNoShow(
  session: Session,
  currentTime: Date = new Date()
): boolean {
  const scheduledStart = new Date(session.scheduled_start_at);
  const noShowDeadline = new Date(
    scheduledStart.getTime() + session.no_show_wait_minutes * 60000
  );
  
  return (
    currentTime >= noShowDeadline &&
    (session.status === 'SCHEDULED' || session.status === 'JOIN_OPEN')
  );
}

export function isJoinWindowOpen(
  scheduledStart: string,
  currentTime: Date = new Date()
): boolean {
  // TESTING MODE: Always allow joining
  return true;
  
  // PRODUCTION: Uncomment below to enforce 5-minute rule
  // const start = new Date(scheduledStart);
  // const joinOpenTime = new Date(start.getTime() - 5 * 60000); // 5 minutes before
  // return currentTime >= joinOpenTime;
}

export function getSessionStatusColor(status: SessionStatus): string {
  switch (status) {
    case 'SCHEDULED':
      return 'bg-blue-100 text-blue-800';
    case 'JOIN_OPEN':
      return 'bg-green-100 text-green-800';
    case 'COMPLETED_ASSUMED':
      return 'bg-gray-100 text-gray-800';
    case 'NO_SHOW_STUDENT':
      return 'bg-red-100 text-red-800';
    case 'EARLY_END_SHORT':
      return 'bg-yellow-100 text-yellow-800';
    case 'CANCELLED':
      return 'bg-gray-100 text-gray-600';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function getSessionStatusLabel(status: SessionStatus): string {
  switch (status) {
    case 'SCHEDULED':
      return 'Scheduled';
    case 'JOIN_OPEN':
      return 'Ready to Join';
    case 'COMPLETED_ASSUMED':
      return 'Completed';
    case 'NO_SHOW_STUDENT':
      return 'Student No-Show';
    case 'EARLY_END_SHORT':
      return 'Ended Early';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

