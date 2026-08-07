// GET  /api/admin/marketplace/classes
//   Every non-archived class in exactly the order the group marketplace shows
//   them (class pin → tutor pin → class score), with the stats behind that
//   order so an admin can see WHY something sits where it does.
//
// PUT  /api/admin/marketplace/classes   { pinned: string[] }
//   The whole pinned sequence, in order. Sent as one call rather than N
//   because a drag is a statement about the whole block — see the note on
//   set_group_pin_order in migration 215.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/services/adminAudit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const search = (new URL(req.url).searchParams.get('search') ?? '').trim().toLowerCase();
  const admin = getServiceClient();

  // The view is the single source of truth for order — the same one
  // /api/groups reads, so this page cannot drift from the marketplace.
  const { data: rankings, error: rErr } = await admin
    .from('group_marketplace_rankings')
    .select('*');
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const rows = rankings ?? [];
  if (rows.length === 0) return NextResponse.json({ classes: [] });

  const tutorIds = [...new Set(rows.map((r: any) => r.tutor_id).filter(Boolean))];
  const groupIds = rows.map((r: any) => r.group_id);

  const [{ data: tutors }, { data: groups }] = await Promise.all([
    admin.from('profiles').select('id, full_name, display_name, email, avatar_url').in('id', tutorIds),
    admin
      .from('groups')
      .select('id, subject, cover_image, header_image, price_monthly, pricing_model, admin_boost_note, admin_boost_updated_at')
      .in('id', groupIds),
  ]);

  const tmap = new Map((tutors ?? []).map((t: any) => [t.id, t]));
  const gmap = new Map((groups ?? []).map((g: any) => [g.id, g]));

  let classes = rows.map((r: any) => {
    const t = tmap.get(r.tutor_id) ?? {};
    const g = gmap.get(r.group_id) ?? {};
    return {
      group_id: r.group_id,
      name: r.group_name ?? 'Untitled class',
      subject: g.subject ?? null,
      cover_image: g.cover_image ?? g.header_image ?? null,
      price_monthly: g.price_monthly != null ? Number(g.price_monthly) : null,
      pricing_model: g.pricing_model ?? null,
      tutor_id: r.tutor_id,
      tutor_name: t.display_name || t.full_name || t.email || 'Tutor',
      tutor_avatar: t.avatar_url ?? null,
      tutor_pin_rank: r.tutor_pin_rank ?? null,
      tutor_ranking_score: Number(r.tutor_ranking_score ?? 0),
      rating_avg: Number(r.rating_avg ?? 0),
      rating_count: r.rating_count ?? 0,
      member_count: r.member_count ?? 0,
      max_students: r.max_students ?? 0,
      completion_score: r.completion_score ?? 0,
      admin_boost: r.admin_boost ?? 0,
      pin_rank: r.pin_rank ?? null,
      ranking_score: Number(r.ranking_score ?? 0),
      admin_boost_note: g.admin_boost_note ?? null,
      admin_boost_updated_at: g.admin_boost_updated_at ?? null,
    };
  });

  // Filtered AFTER ordering, so positions shown always mean marketplace
  // positions rather than positions within the search result.
  if (search) {
    classes = classes.filter(
      (c) =>
        c.name.toLowerCase().includes(search) ||
        (c.subject ?? '').toLowerCase().includes(search) ||
        c.tutor_name.toLowerCase().includes(search)
    );
  }

  return NextResponse.json({ classes });
}

export async function PUT(req: NextRequest) {
  const { error, profile } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const pinned = (body as { pinned?: unknown }).pinned;

  if (!Array.isArray(pinned) || pinned.some((id) => typeof id !== 'string' || !id)) {
    return NextResponse.json({ error: 'pinned must be an array of class ids' }, { status: 400 });
  }
  // An empty array is meaningful — it unpins everything — but a truncated one
  // is not distinguishable from that, so cap rather than silently accept junk.
  if (pinned.length > 200) {
    return NextResponse.json({ error: 'Too many pinned classes (max 200)' }, { status: 400 });
  }

  const ids = [...new Set(pinned as string[])];
  const admin = getServiceClient();

  const { data: count, error: rpcErr } = await (admin as any).rpc('set_group_pin_order', {
    p_group_ids: ids,
    p_actor: profile!.id,
  });

  if (rpcErr) {
    console.error('[admin/marketplace/classes] reorder failed:', rpcErr.message);
    return NextResponse.json({ error: 'Could not save the new order' }, { status: 500 });
  }

  await logAdminAction(
    { id: profile!.id, email: profile!.email },
    {
      action: 'marketplace.classes.reorder',
      targetType: 'group',
      targetId: ids[0] ?? null,
      targetLabel: `${ids.length} pinned class${ids.length === 1 ? '' : 'es'}`,
      details: { pinned_order: ids },
    }
  );

  return NextResponse.json({ ok: true, pinned: Number(count ?? ids.length) });
}
