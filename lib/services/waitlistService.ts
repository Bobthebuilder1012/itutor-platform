// =====================================================
// WAITLIST SERVICE
// =====================================================
// Handles promoting the next waiting student when a
// subscription seat opens up.
//
// Called ONLY when a seat actually opens:
//   - Cron finalizes a cancellation
//   - Cron expires a PENDING_PAYMENT reservation (when no
//     active offered entry exists for the group)
//   - Cron processes expired waitlist offers
//   - Tutor removal (after refund succeeds)
//
// NEVER call when a student schedules a cancellation —
// promotion only happens when cron finalizes it.
// =====================================================

import { type SupabaseClient } from '@supabase/supabase-js';

export async function promoteNextFromWaitlist(
  admin: SupabaseClient,
  groupId: string
): Promise<{ promoted: boolean; studentId?: string }> {
  // Check whether there is already an active offered entry for this group.
  // If so, skip — we never offer the same spot twice concurrently.
  const { data: activeOffer } = await admin
    .from('group_waitlist_entries')
    .select('id')
    .eq('group_id', groupId)
    .eq('status', 'offered')
    .maybeSingle();

  if (activeOffer) {
    return { promoted: false };
  }

  // Delegate row-locking and position management to the RPC.
  // process_waitlist_offer uses FOR UPDATE SKIP LOCKED to prevent
  // two concurrent callers from offering the same student.
  const { data, error } = await admin.rpc('process_waitlist_offer', {
    p_group_id: groupId,
  });

  if (error) {
    console.error('[waitlistService] process_waitlist_offer RPC failed:', error);
    return { promoted: false };
  }

  const result = data as { promoted: boolean; student_id?: string } | null;
  if (!result?.promoted || !result.student_id) {
    return { promoted: false };
  }

  // Notify the offered student with a permanent app link.
  await admin.from('notifications').insert({
    user_id: result.student_id,
    type: 'waitlist_offer_available',
    title: 'Spot available!',
    message: 'A spot has opened up in the class you were waiting for. You have 48 hours to subscribe.',
    link: `/student/subscriptions/new?group=${groupId}`,
    group_id: groupId,
    metadata: { groupId },
  }).then(({ error: ne }) => {
    if (ne) console.warn('[waitlistService] notification insert failed:', ne);
  });

  return { promoted: true, studentId: result.student_id };
}
