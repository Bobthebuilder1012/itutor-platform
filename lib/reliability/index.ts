// =====================================================
// RELIABILITY POLICY HELPERS
// =====================================================
// Pure functions + DB helpers consumed by the cancel /
// no-show routes. Keep all magic numbers here so the
// modal previews, server checks, and admin queue agree.
// =====================================================

import type { SupabaseClient } from '@supabase/supabase-js';

type AnyClient = SupabaseClient<any, 'public', 'public', any, any>;

// Late-cancellation cutoff per the mockups + decisions.
export const LATE_CANCEL_WINDOW_HOURS = 12;
// Tutor super-late cancel — applies the 2-star system rating.
export const TUTOR_SUPER_LATE_CANCEL_WINDOW_MINUTES = 15;
// Rolling windows.
export const STUDENT_CANCEL_WINDOW_DAYS = 30;
export const TUTOR_STRIKE_WINDOW_DAYS = 90;
// Thresholds that auto-flag a warning candidate for admin review.
export const STUDENT_CANCEL_WARNING_THRESHOLD = 3;
export const TUTOR_STRIKE_WARNING_THRESHOLD = 3;
export const TUTOR_STRIKE_SUSPENSION_THRESHOLD = 5;
// Student late-cancel retention (split via commissionCalculator on the retained share).
export const STUDENT_LATE_CANCEL_RETENTION_PCT = 0.5;
// No-show dispute response window.
export const NOSHOW_RESPONSE_WINDOW_HOURS = 12;
// Maximum age of a session for a no-show claim to be filable.
export const NOSHOW_CLAIM_FILING_WINDOW_HOURS = 24;

export interface CancelTimingInfo {
  hoursBefore: number;
  isLate: boolean;
  isSuperLate: boolean;
}

export function classifyCancelTiming(scheduledStartAt: string | Date): CancelTimingInfo {
  const start = new Date(scheduledStartAt).getTime();
  const now = Date.now();
  const ms = start - now;
  const hoursBefore = +(ms / 3_600_000).toFixed(2);
  const isLate = ms < LATE_CANCEL_WINDOW_HOURS * 3_600_000;
  const isSuperLate = ms < TUTOR_SUPER_LATE_CANCEL_WINDOW_MINUTES * 60_000;
  return { hoursBefore, isLate, isSuperLate };
}

export interface StudentCancelState {
  count_30d: number;
  is_warned: boolean;
  warning_issued_at: string | null;
  late_cancel_fee_applies: boolean;
}

export async function getStudentCancelState(
  admin: AnyClient,
  studentId: string
): Promise<StudentCancelState> {
  const { data, error } = await admin.rpc('current_student_cancel_state', {
    p_student_id: studentId,
  });
  if (error || !data) {
    return { count_30d: 0, is_warned: false, warning_issued_at: null, late_cancel_fee_applies: false };
  }
  return data as StudentCancelState;
}

export interface TutorStrikeState {
  active_strikes: number;
  warning_threshold: number;
  suspension_threshold: number;
  is_warned_candidate: boolean;
  is_suspension_candidate: boolean;
}

export async function getTutorStrikeState(
  admin: AnyClient,
  tutorId: string
): Promise<TutorStrikeState> {
  const { data, error } = await admin.rpc('current_tutor_strike_state', {
    p_tutor_id: tutorId,
  });
  if (error || !data) {
    return {
      active_strikes: 0,
      warning_threshold: TUTOR_STRIKE_WARNING_THRESHOLD,
      suspension_threshold: TUTOR_STRIKE_SUSPENSION_THRESHOLD,
      is_warned_candidate: false,
      is_suspension_candidate: false,
    };
  }
  return data as TutorStrikeState;
}

export type StrikeReason = 'tutor_cancelled' | 'tutor_super_late_cancel' | 'tutor_noshow' | 'admin_manual';
export type StudentStrikeReason = 'student_noshow' | 'admin_manual';

export interface StudentStrikeState {
  active_strikes: number;
  warning_threshold: number;
  suspension_threshold: number;
  is_warned_candidate: boolean;
  is_suspension_candidate: boolean;
}

export async function getStudentStrikeState(
  admin: AnyClient,
  studentId: string
): Promise<StudentStrikeState> {
  const { data, error } = await admin.rpc('current_student_strike_state', {
    p_student_id: studentId,
  });
  if (error || !data) {
    return {
      active_strikes: 0,
      warning_threshold: TUTOR_STRIKE_WARNING_THRESHOLD,
      suspension_threshold: TUTOR_STRIKE_SUSPENSION_THRESHOLD,
      is_warned_candidate: false,
      is_suspension_candidate: false,
    };
  }
  return data as StudentStrikeState;
}

export async function writeStudentStrike(
  admin: AnyClient,
  args: {
    studentId: string;
    reason: StudentStrikeReason;
    bookingId?: string | null;
    sessionId?: string | null;
    notes?: string | null;
  }
): Promise<string | null> {
  const { data, error } = await admin
    .from('student_strikes')
    .insert({
      student_id: args.studentId,
      reason: args.reason,
      booking_id: args.bookingId ?? null,
      session_id: args.sessionId ?? null,
      notes: args.notes ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[reliability] writeStudentStrike failed:', error.message);
    return null;
  }

  const state = await getStudentStrikeState(admin, args.studentId);
  if (state.is_suspension_candidate) {
    await flagWarning(admin, args.studentId, 'student', 'student_noshow_repeat', state.active_strikes);
  } else if (state.is_warned_candidate) {
    await flagWarning(admin, args.studentId, 'student', 'student_noshow_repeat', state.active_strikes);
  }

  return (data as any)?.id ?? null;
}

export async function writeTutorStrike(
  admin: AnyClient,
  args: {
    tutorId: string;
    reason: StrikeReason;
    bookingId?: string | null;
    sessionId?: string | null;
    notes?: string | null;
  }
): Promise<string | null> {
  const { data, error } = await admin
    .from('tutor_strikes')
    .insert({
      tutor_id: args.tutorId,
      reason: args.reason,
      booking_id: args.bookingId ?? null,
      session_id: args.sessionId ?? null,
      notes: args.notes ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[reliability] writeTutorStrike failed:', error.message);
    return null;
  }

  // Auto-flag warning / suspension candidates.
  const state = await getTutorStrikeState(admin, args.tutorId);
  if (state.is_suspension_candidate) {
    await flagWarning(admin, args.tutorId, 'tutor', 'tutor_suspension_threshold', state.active_strikes);
  } else if (state.is_warned_candidate) {
    await flagWarning(admin, args.tutorId, 'tutor', 'tutor_strike_threshold', state.active_strikes);
  }

  return (data as any)?.id ?? null;
}

export async function writeCancellationEvent(
  admin: AnyClient,
  args: {
    studentId: string;
    tutorId: string;
    bookingId: string | null;
    sessionId?: string | null;
    scheduledStartAt?: string | null;
    hoursBefore?: number | null;
    wasLate: boolean;
    feeApplied: boolean;
    feeAmountTtd?: number;
    reason?: string | null;
    source?: 'student_cancel' | 'counter_offer_rejected';
  }
): Promise<void> {
  const { error } = await admin.from('cancellation_events').insert({
    student_id: args.studentId,
    tutor_id: args.tutorId,
    booking_id: args.bookingId,
    session_id: args.sessionId ?? null,
    scheduled_start_at: args.scheduledStartAt ?? null,
    hours_before: args.hoursBefore ?? null,
    was_late: args.wasLate,
    fee_applied: args.feeApplied,
    fee_amount_ttd: args.feeAmountTtd ?? 0,
    reason: args.reason ?? null,
    source: args.source ?? 'student_cancel',
  });

  if (error) {
    console.warn('[reliability] writeCancellationEvent failed:', error.message);
    return;
  }

  const state = await getStudentCancelState(admin, args.studentId);
  if (state.count_30d >= STUDENT_CANCEL_WARNING_THRESHOLD && !state.is_warned) {
    await flagWarning(
      admin,
      args.studentId,
      'student',
      'student_cancellation_threshold',
      state.count_30d
    );
  }
}

async function flagWarning(
  admin: AnyClient,
  userId: string,
  userRole: 'student' | 'tutor',
  flagReason: string,
  triggerCount: number
) {
  const { error } = await admin.rpc('flag_reliability_warning', {
    p_user_id: userId,
    p_user_role: userRole,
    p_flag_reason: flagReason,
    p_trigger_count: triggerCount,
  });
  if (error) console.warn('[reliability] flag_reliability_warning failed:', error.message);
}

// =====================================================
// System rating (1-star tutor no-show, 2-star super-late cancel)
// =====================================================

export type SystemRatingReason = 'tutor_noshow' | 'tutor_super_late_cancel';

export async function writeSystemRating(
  admin: AnyClient,
  args: {
    tutorId: string;
    studentId: string;
    sessionId: string;
    reason: SystemRatingReason;
  }
): Promise<void> {
  const stars = args.reason === 'tutor_super_late_cancel' ? 2 : 1;

  // unique_session_rating prevents two ratings for the same session;
  // skip silently if one already exists.
  const { data: existing } = await admin
    .from('ratings')
    .select('id')
    .eq('session_id', args.sessionId)
    .maybeSingle();
  if (existing) return;

  const { error } = await admin.from('ratings').insert({
    session_id: args.sessionId,
    student_id: args.studentId,
    tutor_id: args.tutorId,
    stars,
    comment: null,
    system_issued: true,
    system_reason: args.reason,
    is_active: true,
  });

  if (error) console.warn('[reliability] writeSystemRating failed:', error.message);
}
