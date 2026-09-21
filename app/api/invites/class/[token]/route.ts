// GET /api/invites/class/[token]
// What the invitation page shows. Public on purpose — the whole point is that
// someone with no account can see who invited them, and to what.
//
// Non-disclosure: an unknown token, a token for a private or archived class and
// a garbage string all return the same 404. 194's read route sets that
// precedent — a valid-but-not-yours token must be indistinguishable from
// nonsense, or the endpoint becomes an oracle for enumerating classes.

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { resolveInvite } from '@/lib/server/classInvites';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
) {
  try {
    const resolved = await resolveInvite(getServiceClient(), params.token);
    if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ invite: resolved });
  } catch (e: any) {
    console.error('[classInvites] resolve failed:', e?.message ?? e);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
