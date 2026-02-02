import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Body = {
  tutorIds?: string[];
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const tutorIds = Array.isArray(body?.tutorIds) ? body.tutorIds.filter(Boolean) : [];

    if (tutorIds.length === 0) return NextResponse.json({ byTutorId: {} });
    if (tutorIds.length > 200) {
      return NextResponse.json({ error: 'Too many tutorIds' }, { status: 400 });
    }

    const admin = getServiceClient();

    // Fetch recent-first so first seen per (tutor, student) is the latest.
    const { data: rows, error } = await admin
      .from('ratings')
      .select('tutor_id, student_id, stars, created_at')
      .in('tutor_id', tutorIds)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const seenPairs = new Set<string>();
    const sums = new Map<string, number>();
    const counts = new Map<string, number>();

    for (const r of rows || []) {
      if (!r?.tutor_id || !r?.student_id) continue;
      const key = `${r.tutor_id}:${r.student_id}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);

      const tutorId = r.tutor_id as string;
      const stars = Number(r.stars || 0);
      if (!Number.isFinite(stars) || stars <= 0) continue;

      sums.set(tutorId, (sums.get(tutorId) || 0) + stars);
      counts.set(tutorId, (counts.get(tutorId) || 0) + 1);
    }

    const byTutorId: Record<string, { ratingCount: number; averageRating: number | null }> = {};
    for (const id of tutorIds) {
      const c = counts.get(id) || 0;
      const s = sums.get(id) || 0;
      byTutorId[id] = {
        ratingCount: c,
        averageRating: c > 0 ? Math.round((s / c) * 10) / 10 : null,
      };
    }

    return NextResponse.json({ byTutorId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
  }
}

