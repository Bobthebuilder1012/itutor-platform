// GET /api/admin/tutors
// Admin list of tutors ordered by the marketplace ranking (pinned first,
// then ranking_score), joined with profile name/email/verification for display.
// Optional ?search= filters by name or email.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const search = (new URL(req.url).searchParams.get('search') ?? '').trim().toLowerCase();
  const admin = getServiceClient();

  // Single source of truth for order (pinned first in pin_rank order, then score).
  const { data: rankings, error: rErr } = await admin
    .from('tutor_marketplace_rankings')
    .select('*')
    .order('pin_rank', { ascending: true, nullsFirst: false })
    .order('ranking_score', { ascending: false });
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const ids = (rankings ?? []).map((r) => r.tutor_id);
  if (ids.length === 0) return NextResponse.json({ tutors: [] });

  const { data: profiles, error: pErr } = await admin
    .from('profiles')
    .select('id, full_name, display_name, email, avatar_url, tutor_verification_status, admin_boost_note, admin_boost_updated_at')
    .in('id', ids);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const pmap = new Map((profiles ?? []).map((p) => [p.id, p as any]));

  let tutors = (rankings ?? []).map((r) => {
    const p = pmap.get(r.tutor_id) ?? {};
    return {
      tutor_id: r.tutor_id,
      name: p.display_name || p.full_name || p.email || 'Tutor',
      email: p.email ?? null,
      avatar_url: p.avatar_url ?? null,
      verification_status: p.tutor_verification_status ?? null,
      rating_avg: Number(r.rating_avg ?? 0),
      rating_count: r.rating_count ?? 0,
      completion_score: r.completion_score ?? 0,
      sessions_held: r.sessions_held ?? 0,
      classes_created: r.classes_created ?? 0,
      admin_boost: r.admin_boost ?? 0,
      pin_rank: r.pin_rank ?? null,
      ranking_score: Number(r.ranking_score ?? 0),
      admin_boost_note: p.admin_boost_note ?? null,
      admin_boost_updated_at: p.admin_boost_updated_at ?? null,
    };
  });

  if (search) {
    tutors = tutors.filter(
      (t) => t.name.toLowerCase().includes(search) || (t.email ?? '').toLowerCase().includes(search)
    );
  }

  return NextResponse.json({ tutors });
}
