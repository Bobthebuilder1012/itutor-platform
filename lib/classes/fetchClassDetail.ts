// One loader for one class, used by the student's explore page and the parent's.
//
// This was the body of ExploreClassDetailPage.fetchGroup. It moved out when the
// parent class page began rendering the SAME <Detail> view: two callers building
// GroupData from the same endpoint by hand is two mappings that drift, and the
// way they drift is a field the parent silently never sees.
//
// Pure — it returns the class or null. Loading state, membership side-effects and
// anything role-specific stay with the caller.

import { supabase } from '@/lib/supabase/client';
import type { GroupData, SessionRow } from '@/components/classes/ClassDetailView';

export async function fetchClassDetail(groupId: string): Promise<GroupData | null> {
  try {
  const res = await fetch(`/api/groups/${groupId}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const payload = await res.json();
  const g = payload?.group ?? payload?.data?.group ?? payload;
  if (!g) return null;

  const tutorObj = Array.isArray(g.tutor) ? g.tutor[0] : g.tutor;

  // Membership comes from the API, which resolves both group_members (free /
  // approval-gated classes) and group_enrollments (paid classes). Doing it
  // server-side means this page can't miss one of the two tables, and there
  // is no window where the CTA renders before membership is known.
  //
  // That endpoint now also reports SECURED and its release_date, which this
  // page used to fetch itself. A subscription is the stronger signal — it
  // means money is changing hands right now — and resolving it server-side
  // is what stops an ACTIVE enrolment alongside group_members.status
  // 'removed' from telling a paying student to "Request to join".
  const vm = g.viewer_membership ?? null;
  const enrolled = !!vm?.enrolled;
  const memberStatus: string | null = vm?.member_status ?? null;
  const paymentPending = !!vm?.payment_pending;
  const securedState: { releaseDate: string | null } | null = vm?.secured
    ? { releaseDate: vm.release_date ?? null }
    : null;


  // Tutor verification + display name (defensive against schema drift)
  let tutorVerified = false;
  let tutorDisplayName: string | null = null;
  if (tutorObj?.id) {
    try {
      const { data: tp } = await supabase
        .from('profiles')
        .select('display_name, tutor_verification_status')
        .eq('id', tutorObj.id)
        .maybeSingle();
      tutorDisplayName = tp?.display_name ?? null;
      tutorVerified = String(tp?.tutor_verification_status ?? '').toUpperCase() === 'VERIFIED';
    } catch { /* non-fatal */ }
  }

  const sessions: SessionRow[] = Array.isArray(g.sessions)
    ? g.sessions.map((s: any) => ({
        id: s.id,
        title: s.title ?? null,
        duration_minutes: s.duration_minutes ?? null,
        recurrence_type: s.recurrence_type ?? null,
        recurrence_days: Array.isArray(s.recurrence_days) ? s.recurrence_days : null,
        start_time: s.start_time ?? null,
        starts_on: s.starts_on ?? null,
        ends_on: s.ends_on ?? null,
        occurrences: Array.isArray(s.occurrences)
          ? s.occurrences
          : Array.isArray(s.group_session_occurrences)
            ? s.group_session_occurrences
            : [],
      }))
    : [];

  return {
    id: g.id,
    name: g.name,
    description: g.description ?? null,
    subject: g.subject ?? null,
    topic: g.topic ?? null,
    form_level: g.form_level ?? null,
    tutor_id: g.tutor_id,
    price_monthly: g.price_monthly ?? null,
    price_per_session: g.price_per_session ?? null,
    pricing_model: g.pricing_model ?? null,
    max_students: g.max_students ?? 20,
    require_join_requests: g.require_join_requests ?? false,
    feedback_mode: g.feedback_mode ?? g.parent_feedback_mode ?? null,
    cover_image: g.cover_image ?? null,
    schedule_display: g.schedule_display ?? null,
    schedule_data: g.schedule_data ?? null,
    session_length_minutes: g.session_length_minutes ?? g.key_info?.session_length_minutes ?? null,
    session_frequency: g.session_frequency ?? g.recurrence_type ?? g.key_info?.session_frequency ?? null,
    whatsapp_link: g.whatsapp_link ?? g.whatsapp_url ?? null,
    google_classroom_link: g.google_classroom_link ?? null,
    average_rating: g.average_rating ?? null,
    tutor: tutorObj ? {
      id: tutorObj.id,
      full_name: tutorObj.full_name ?? null,
      display_name: tutorDisplayName ?? tutorObj.display_name ?? tutorObj.full_name ?? null,
      avatar_url: tutorObj.avatar_url ?? null,
      verified: tutorVerified,
    } : null,
    member_count: g.enrollment_count ?? g.member_count ?? 0,
    enrolled,
    memberStatus,
    paymentPending,
    parent_feedback_price: g.parent_feedback_price ?? null,
    active_promotion: g.active_promotion ?? null,
    sessions,
    secure_spot_enabled: g.secure_spot_enabled === true,
    end_date: g.end_date ?? null,
    secured: securedState,
  };
  } catch (err) {
    console.error('[fetchClassDetail]', err);
    return null;
  }
}
