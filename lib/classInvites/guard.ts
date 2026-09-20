// The one place the teacher activation flag is enforced, and the one place a
// route decides whether this caller may send invitations at all.
//
// Two separate questions, deliberately answered together so no route can
// remember one and forget the other:
//
//   is the feature on?      the kill switch
//   is this tutor verified? the spam control
//
// A tutor who has not been verified cannot cause mail to be sent from our
// domain. That is not a product nicety — it is the only thing standing between
// an open signup form and an open relay.

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { isTeacherActivationEnabled } from '@/lib/featureFlags/teacherActivation';
import { teacherActivationForbiddenResponse } from '@/lib/featureFlags/http';
import { fail } from '@/lib/api/http';

export type ActivationGate =
  | { ok: true; tutorId: string; verifiedAt: string | null }
  | { ok: false; response: NextResponse };

/**
 * May this tutor create or send invitations right now?
 *
 * Callers that only READ (the activation summary, the dashboard list) should
 * not use this: turning the flag off must hide the tools, not blind a teacher
 * to invitations that are already in flight.
 */
export async function requireTeacherActivation(tutorId: string): Promise<ActivationGate> {
  if (!isTeacherActivationEnabled()) {
    return { ok: false, response: teacherActivationForbiddenResponse() };
  }

  const admin = getServiceClient();
  const { data } = await admin
    .from('profiles')
    .select('role, tutor_verification_status, tutor_verified_at')
    .eq('id', tutorId)
    .maybeSingle();

  const profile = data as {
    role: string | null;
    tutor_verification_status: string | null;
    tutor_verified_at: string | null;
  } | null;

  if (!profile || profile.role !== 'tutor') {
    return { ok: false, response: fail('Tutor role required', 403) };
  }

  if (profile.tutor_verification_status !== 'VERIFIED') {
    return {
      ok: false,
      response: fail(
        'Your profile needs to be verified before you can invite students.',
        403
      ),
    };
  }

  return { ok: true, tutorId, verifiedAt: profile.tutor_verified_at };
}
