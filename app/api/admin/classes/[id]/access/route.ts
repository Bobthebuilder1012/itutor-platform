// GET /api/admin/classes/[id]/access
// Superadmin-only probe used by the tutor class page to establish "admin mode".
// The browser can't read SUPERADMIN_EMAILS (server-only env), so it asks here.
// Returns the full groups row via the service client — which also lets a
// superadmin open an ARCHIVED class the browser's RLS client cannot read.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { isSuperAdmin } from '@/lib/auth/adminAccess';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  if (!isSuperAdmin(auth.profile?.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = params;
  const admin = getServiceClient();
  const { data: group, error } = await admin
    .from('groups')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ adminOverride: true, group });
}
