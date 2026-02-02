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

    const [{ data: tutorProfile }, { count: ratingCount }] = await Promise.all([
      admin.from('profiles').select('rating_average, rating_count').eq('id', tutorId).single(),
      admin.from('ratings').select('id', { count: 'exact', head: true }).eq('tutor_id', tutorId),
    ]);

    const total = ratingCount || tutorProfile?.rating_count || 0;

    let reviews: Review[] = [];
    let hasMore = offset + limit < total;

    if (limit > 0) {
      // Defensive: if legacy duplicates exist (same student rated multiple times),
      // show only the latest rating per student.
      const desiredUnique = offset + limit;
      const chunkSize = 50;
      const maxChunks = 20;

      const seenStudents = new Set<string>();
      const uniqueRatings: any[] = [];

      let rangeStart = 0;
      let lastChunkLength = 0;

      for (let i = 0; i < maxChunks && uniqueRatings.length < desiredUnique; i++) {
        const { data: chunk, error: ratingsError } = await admin
          .from('ratings')
          .select('id, stars, comment, created_at, student_id')
          .eq('tutor_id', tutorId)
          .order('created_at', { ascending: false })
          .range(rangeStart, rangeStart + chunkSize - 1);

        if (ratingsError) {
          return NextResponse.json({ error: ratingsError.message }, { status: 400 });
        }

        const rows = chunk || [];
        lastChunkLength = rows.length;
        if (rows.length === 0) break;

        for (const r of rows) {
          if (!r?.student_id) continue;
          if (seenStudents.has(r.student_id)) continue;
          seenStudents.add(r.student_id);
          uniqueRatings.push(r);
          if (uniqueRatings.length >= desiredUnique) break;
        }

        rangeStart += chunkSize;
      }

      // Offset/limit apply to the unique-by-student list.
      const page = uniqueRatings.slice(offset, offset + limit);

      // Best-effort "hasMore" when legacy duplicates exist.
      // If we filled the requested unique list and still might have more rows, allow "See more".
      if (page.length < limit) {
        hasMore = false;
      } else {
        hasMore = lastChunkLength === chunkSize || offset + limit < total;
      }

      const studentIds = Array.from(new Set((page || []).map((r: any) => r.student_id).filter(Boolean)));
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

      reviews = (page || []).map((r: any) => ({
        id: r.id,
        stars: r.stars,
        comment: r.comment ?? null,
        created_at: r.created_at,
        student: studentsById.get(r.student_id) || { full_name: 'Anonymous', username: '' },
      }));
    }

    const avgRaw = (tutorProfile as any)?.rating_average ?? null;
    const avgNum = avgRaw == null ? null : Number(avgRaw);
    const averageRating = Number.isFinite(avgNum) ? avgNum : null;

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

