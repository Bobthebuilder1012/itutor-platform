// =====================================================
// ELIGIBILITY HELPERS — Ratings & Comments v2
// All functions run server-side against the DB via
// the service-role client.  Never trust the caller.
// =====================================================

import { getServiceClient } from '@/lib/supabase/server';

// -------------------------------------------------------
// canCommentOnClass
// True iff:
//   • student has a completed billing cycle for class+period
//   • no existing comment for (class, student, billing_period)
// -------------------------------------------------------
export async function canCommentOnClass(
  studentId: string,
  classId: string,
  billingPeriod: string
): Promise<boolean> {
  const db = getServiceClient();

  // Check for an existing comment first (cheapest check)
  const { count: existingCount } = await db
    .from('class_comments')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', classId)
    .eq('author_id', studentId)
    .eq('billing_period', billingPeriod)
    .is('deleted_at', null);

  if ((existingCount ?? 0) > 0) return false;

  // Student must have a completed billing cycle: a rating_prompt that
  // was submitted OR a class_payment that covers this period.
  // We use the rating_prompt as the canonical "period closed" signal.
  const { count: promptCount } = await db
    .from('rating_prompts')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('class_id', classId)
    .eq('billing_period', billingPeriod);

  return (promptCount ?? 0) > 0;
}

// -------------------------------------------------------
// canCommentOnTutor
// True iff:
//   • session is completed
//   • session.student_id === studentId
//   • session.tutor_id   === tutorId
//   • no existing tutor_profile_comment for that session_id
// -------------------------------------------------------
export async function canCommentOnTutor(
  studentId: string,
  tutorId: string,
  sessionId: string
): Promise<boolean> {
  const db = getServiceClient();

  // Session must be completed and belong to this student/tutor pair
  const { data: session } = await db
    .from('sessions')
    .select('id, student_id, tutor_id, status')
    .eq('id', sessionId)
    .single();

  if (!session) return false;
  if (session.student_id !== studentId) return false;
  if (session.tutor_id !== tutorId) return false;
  if (session.status !== 'completed') return false;

  // Must not have already commented on this session
  const { count } = await db
    .from('tutor_profile_comments')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  return (count ?? 0) === 0;
}

// -------------------------------------------------------
// canReactToClassComment
// True iff: user has at least one completed billing cycle
//           for the comment's class.
// -------------------------------------------------------
export async function canReactToClassComment(
  userId: string,
  commentId: string
): Promise<boolean> {
  const db = getServiceClient();

  const { data: comment } = await db
    .from('class_comments')
    .select('class_id')
    .eq('id', commentId)
    .single();

  if (!comment) return false;

  const { count } = await db
    .from('rating_prompts')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', userId)
    .eq('class_id', comment.class_id);

  return (count ?? 0) > 0;
}

// -------------------------------------------------------
// canReactToTutorComment
// True iff: user has at least one completed session with
//           the comment's tutor.
// -------------------------------------------------------
export async function canReactToTutorComment(
  userId: string,
  commentId: string
): Promise<boolean> {
  const db = getServiceClient();

  const { data: comment } = await db
    .from('tutor_profile_comments')
    .select('tutor_id')
    .eq('id', commentId)
    .single();

  if (!comment) return false;

  const { count } = await db
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', userId)
    .eq('tutor_id', comment.tutor_id)
    .eq('status', 'completed');

  return (count ?? 0) > 0;
}

// -------------------------------------------------------
// canReplyToComment
// True iff: user is the tutor who owns the class
//           (for class_comment) or the tutor whose profile
//           it's on (for tutor_profile_comment).
// -------------------------------------------------------
export async function canReplyToComment(
  userId: string,
  targetType: 'class_comment' | 'tutor_profile_comment',
  targetId: string
): Promise<boolean> {
  const db = getServiceClient();

  if (targetType === 'class_comment') {
    const { data: comment } = await db
      .from('class_comments')
      .select('class_id')
      .eq('id', targetId)
      .single();

    if (!comment) return false;

    const { data: group } = await db
      .from('groups')
      .select('tutor_id')
      .eq('id', comment.class_id)
      .single();

    return group?.tutor_id === userId;
  }

  // tutor_profile_comment
  const { data: comment } = await db
    .from('tutor_profile_comments')
    .select('tutor_id')
    .eq('id', targetId)
    .single();

  return comment?.tutor_id === userId;
}

// -------------------------------------------------------
// canRateClass
// True iff:
//   • a rating_prompt exists with status='pending'
//   • it hasn't expired (expires_at > now())
//   • no class_rating exists for (class, student, billing_period)
// -------------------------------------------------------
export async function canRateClass(
  studentId: string,
  classId: string,
  billingPeriod: string
): Promise<boolean> {
  const db = getServiceClient();

  const { data: prompt } = await db
    .from('rating_prompts')
    .select('id, expires_at, status')
    .eq('student_id', studentId)
    .eq('class_id', classId)
    .eq('billing_period', billingPeriod)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!prompt) return false;

  const { count } = await db
    .from('class_ratings')
    .select('id', { count: 'exact', head: true })
    .eq('class_id', classId)
    .eq('student_id', studentId)
    .eq('billing_period', billingPeriod);

  return (count ?? 0) === 0;
}
