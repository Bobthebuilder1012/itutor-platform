// GET /api/admin/classes — list every class (group) across all tutors,
// including archived ones (RLS hides archived from clients, so this uses the
// service client). Supports ?search= and ?filter=all|active|archived.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { isSuperAdmin } from '@/lib/auth/adminAccess';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get('search') || '').trim();
  const tutor = (searchParams.get('tutor') || '').trim();
  const filter = searchParams.get('filter') || 'all'; // all | active | archived

  const admin = getServiceClient();

  // Tutor filter: resolve matching tutor ids first, then scope the class list.
  let tutorIdFilter: string[] | null = null;
  if (tutor) {
    const { data: matches } = await admin
      .from('profiles')
      .select('id')
      .or(`full_name.ilike.%${tutor}%,email.ilike.%${tutor}%`)
      .limit(200);
    tutorIdFilter = (matches ?? []).map((m) => m.id);
    if (tutorIdFilter.length === 0) {
      return NextResponse.json({ classes: [], is_superadmin: isSuperAdmin(auth.profile?.email) });
    }
  }

  let query = admin
    .from('groups')
    .select('id, name, subject, tutor_id, status, archived_at, cover_image, visibility, price_monthly, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (filter === 'active') query = query.is('archived_at', null);
  if (filter === 'archived') query = query.not('archived_at', 'is', null);
  if (search) query = query.ilike('name', `%${search}%`);
  if (tutorIdFilter) query = query.in('tutor_id', tutorIdFilter);

  const { data: classes, error } = await query;
  if (error) {
    console.error('Admin classes list failed:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Resolve tutor names in one round-trip (avoids relying on FK constraint names).
  const tutorIds = Array.from(new Set((classes ?? []).map((c) => c.tutor_id).filter(Boolean)));
  const tutorMap: Record<string, { full_name: string | null; email: string | null }> = {};
  if (tutorIds.length > 0) {
    const { data: tutors } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', tutorIds);
    for (const t of tutors ?? []) tutorMap[t.id] = { full_name: t.full_name, email: t.email };
  }

  const result = (classes ?? []).map((c) => ({
    ...c,
    archived: !!c.archived_at,
    tutor_name: tutorMap[c.tutor_id]?.full_name ?? null,
    tutor_email: tutorMap[c.tutor_id]?.email ?? null,
  }));

  return NextResponse.json({ classes: result, is_superadmin: isSuperAdmin(auth.profile?.email) });
}
