import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Review = {
  id: string;
  stars: number;
  comment: string | null;
  created_at: string;
  student: {
    full_name: string;
    username: string;
  };
};

function parseIntParam(value: string | null, fallback: number) {
  const n = Number.parseInt(value || '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tutorId: string }> }
) {
  try {
    const { tutorId } = await params;
    const url = new URL(request.url);
    const limitRaw = parseIntParam(url.searchParams.get('limit'), 15);
    const offset = parseIntParam(url.searchParams.get('offset'), 0);
    const limit = Math.min(limitRaw, 15);

    const admin = getServiceClient();

    // Compute summary directly from ratings so profile pages always show an average,
    // even if profiles.rating_average isn't populated yet.
    // Also dedupe by (student_id) to enforce "latest rating per student".
    const { data: ratingRows, error: ratingsError } = await admin
      .from('ratings')
      .select('id, stars, comment, created_at, student_id')
      .eq('tutor_id', tutorId)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (ratingsError) {
      return NextResponse.json({ error: ratingsError.message }, { status: 400 });
    }

    const seenStudents = new Set<string>();
    const uniqueLatest: any[] = [];
    let sumStars = 0;

    for (const r of ratingRows || []) {
      if (!r?.student_id) continue;
      if (seenStudents.has(r.student_id)) continue;
      seenStudents.add(r.student_id);
      uniqueLatest.push(r);
      sumStars += Number(r.stars || 0);
    }

    const total = uniqueLatest.length;
    const averageRating = total > 0 ? sumStars / total : null;

    let reviews: Review[] = [];
    const page = limit > 0 ? uniqueLatest.slice(offset, offset + limit) : [];
    const hasMore = limit > 0 ? offset + limit < total : false;

    if (page.length > 0) {
      const studentIds = Array.from(new Set(page.map((r: any) => r.student_id).filter(Boolean)));
      const { data: students } = await admin
        .from('profiles')
        .select('id, full_name, display_name, username')
        .in('id', studentIds);

      const studentsById = new Map(
        (students || []).map((s: any) => [
          s.id,
          {
            full_name: (s.display_name || s.full_name || s.username || 'Anonymous') as string,
            username: (s.username || '') as string,
          },
        ])
      );

      reviews = page.map((r: any) => ({
        id: r.id,
        stars: r.stars,
        comment: r.comment ?? null,
        created_at: r.created_at,
        student: studentsById.get(r.student_id) || { full_name: 'Anonymous', username: '' },
      }));
    }

    return NextResponse.json({
      averageRating,
      ratingCount: total,
      reviews,
      hasMore,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
  }
}

