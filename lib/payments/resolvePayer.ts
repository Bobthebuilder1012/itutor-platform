// =====================================================
// PAYER RESOLUTION
// =====================================================
// Wraps the get_payer_for_student RPC. For students with
// billing_mode = 'parent_required', returns the linked parent
// uid + email. For everyone else, returns the student's own
// uid + email. Fallback on any RPC error: treat the student
// as the payer (current behaviour) so a transient failure
// doesn't block checkout.
// =====================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export type ResolvedPayer = {
  payerId: string;
  email: string | null;
  isProxy: boolean; // true when payer !== student
};

type AnyClient = SupabaseClient<any, 'public', 'public', any, any>;

export async function resolvePayer(
  admin: AnyClient,
  studentId: string,
  studentEmailFallback: string | null
): Promise<ResolvedPayer> {
  const { data: payerId, error } = await admin.rpc('get_payer_for_student', {
    p_student_id: studentId,
  });

  if (error || !payerId || typeof payerId !== 'string') {
    if (error) {
      console.warn('[resolvePayer] RPC error, falling back to student:', error.message);
    }
    return { payerId: studentId, email: studentEmailFallback, isProxy: false };
  }

  if (payerId === studentId) {
    return { payerId: studentId, email: studentEmailFallback, isProxy: false };
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('email')
    .eq('id', payerId)
    .maybeSingle();

  return {
    payerId,
    email: (profile as any)?.email ?? null,
    isProxy: true,
  };
}
