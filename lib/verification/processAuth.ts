// Who may trigger verification processing (OCR) for a request.
//
// This endpoint used the service role with NO auth check, so anyone holding a
// request id could run it and read back OCR output. Now one of:
//   1. a server-to-server secret   Authorization: Bearer <VERIFICATION_PROCESS_SECRET>
//   2. an admin or reviewer session
//   3. the tutor who OWNS that exact request (their own browser calls this
//      after uploading; being logged in as some other tutor is not enough)
// Anything else: 401 when nobody is authenticated, 403 when someone is but is
// not allowed.

import { timingSafeEqual } from 'crypto';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';
import type { VerificationActor } from './transitions';

export interface ProcessCaller {
  secretMatched: boolean;
  user: { id: string } | null;
  profile: { role: string | null; is_reviewer: boolean | null; email?: string | null } | null;
}

export type ProcessAccess =
  | { allowed: true; via: 'secret' | 'staff' | 'owner'; actor: VerificationActor }
  | { allowed: false; status: 401 | 403; error: string };

/** Pure decision, unit-tested. */
export function decideProcessAccess(
  caller: ProcessCaller,
  requestTutorId: string | null
): ProcessAccess {
  if (caller.secretMatched) return { allowed: true, via: 'secret', actor: 'system' };
  if (!caller.user) return { allowed: false, status: 401, error: 'Unauthorized' };

  const p = caller.profile;
  const isStaff = !!p && (p.is_reviewer === true || p.role === 'admin');
  if (isStaff && !(p!.role === 'admin' && isEmailManagementOnlyAdmin(p!.email))) {
    return { allowed: true, via: 'staff', actor: p!.role === 'admin' ? 'admin' : 'reviewer' };
  }

  if (p?.role === 'tutor' && requestTutorId !== null && requestTutorId === caller.user.id) {
    return { allowed: true, via: 'owner', actor: 'tutor' };
  }
  return { allowed: false, status: 403, error: 'Forbidden' };
}

function secretMatches(header: string | null): boolean {
  const expected = process.env.VERIFICATION_PROCESS_SECRET;
  if (!expected || !header) return false;
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Reads the secret header and the session. Does not decide anything. */
export async function resolveProcessCaller(request: Request): Promise<ProcessCaller> {
  if (secretMatches(request.headers.get('authorization'))) {
    return { secretMatched: true, user: null, profile: null };
  }

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { secretMatched: false, user: null, profile: null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_reviewer, email')
    .eq('id', user.id)
    .maybeSingle();

  return { secretMatched: false, user: { id: user.id }, profile: profile ?? null };
}
