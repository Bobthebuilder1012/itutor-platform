// Admin review-moderation list: unified feed of active reviews from BOTH
// rating systems — 1:1 `ratings` and group `group_reviews` — with reviewer +
// tutor names resolved. Powers /admin/rating-appeals (the moderation UI).
//
// Defensive: `ratings.deleted_at` only exists after migration 191. We try to
// filter it and fall back to an unfiltered query if the column isn't there yet,
// so this endpoint works before AND after the migration is applied.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Row = {
  source: 'oneonone' | 'group';
  id: string;
  reviewerId: string | null;
  reviewerName: string;
  tutorId: string | null;
  tutorName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  context: string | null; // group name for group reviews
};

export async function GET(_req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const admin = getServiceClient();

  // --- 1:1 ratings (defensive about deleted_at not existing pre-mig-191) ---
  let ratingRows: any[] = [];
  {
    const base = () =>
      admin.from('ratings').select('id, stars, comment, created_at, student_id, tutor_id').order('created_at', { ascending: false }).limit(200);
    let res = await base().is('deleted_at', null);
    if (res.error) res = await base(); // column missing -> unfiltered fallback
    ratingRows = res.data ?? [];
  }

  // --- group reviews (deleted_at already exists) ---
  const { data: groupRows } = await admin
    .from('group_reviews')
    .select('id, rating, comment, created_at, reviewer_id, tutor_id, group_id')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);

  // --- resolve names in bulk (no FK-name guessing) ---
  const profileIds = new Set<string>();
  ratingRows.forEach((r) => { if (r.student_id) profileIds.add(r.student_id); if (r.tutor_id) profileIds.add(r.tutor_id); });
  (groupRows ?? []).forEach((r) => { if (r.reviewer_id) profileIds.add(r.reviewer_id); if (r.tutor_id) profileIds.add(r.tutor_id); });
  const groupIds = Array.from(new Set((groupRows ?? []).map((r) => r.group_id).filter(Boolean)));

  const [{ data: profiles }, { data: groups }] = await Promise.all([
    profileIds.size
      ? admin.from('profiles').select('id, full_name, display_name').in('id', Array.from(profileIds))
      : Promise.resolve({ data: [] as any[] }),
    groupIds.length
      ? admin.from('groups').select('id, name').in('id', groupIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const nameOf = new Map<string, string>();
  (profiles ?? []).forEach((p: any) => nameOf.set(p.id, p.display_name || p.full_name || 'Unknown'));
  const groupName = new Map<string, string>();
  (groups ?? []).forEach((g: any) => groupName.set(g.id, g.name));

  const rows: Row[] = [
    ...ratingRows.map((r): Row => ({
      source: 'oneonone',
      id: r.id,
      reviewerId: r.student_id ?? null,
      reviewerName: r.student_id ? (nameOf.get(r.student_id) ?? 'Unknown') : 'Unknown',
      tutorId: r.tutor_id ?? null,
      tutorName: r.tutor_id ? (nameOf.get(r.tutor_id) ?? 'Unknown') : 'Unknown',
      rating: r.stars,
      comment: r.comment ?? null,
      createdAt: r.created_at,
      context: '1:1 session',
    })),
    ...(groupRows ?? []).map((r): Row => ({
      source: 'group',
      id: r.id,
      reviewerId: r.reviewer_id ?? null,
      reviewerName: r.reviewer_id ? (nameOf.get(r.reviewer_id) ?? 'Unknown') : 'Unknown',
      tutorId: r.tutor_id ?? null,
      tutorName: r.tutor_id ? (nameOf.get(r.tutor_id) ?? 'Unknown') : 'Unknown',
      rating: r.rating,
      comment: r.comment ?? null,
      createdAt: r.created_at,
      context: r.group_id ? (groupName.get(r.group_id) ?? 'Group class') : 'Group class',
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({ reviews: rows });
}
