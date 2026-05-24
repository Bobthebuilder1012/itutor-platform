import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: { tutorId: string } }
) {
  const db = getServiceClient();
  const { tutorId } = params;

  const [oneOnOne, classRatings] = await Promise.all([
    db
      .from('ratings')
      .select('stars')
      .eq('tutor_id', tutorId)
      .eq('is_test_data', false),
    db
      .from('class_ratings')
      .select('stars')
      .eq('tutor_id', tutorId)
      .eq('is_test_data', false),
  ]);

  const all = [
    ...(oneOnOne.data ?? []),
    ...(classRatings.data ?? []),
  ] as { stars: number }[];

  const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } as Record<number, number>;
  for (const r of all) {
    if (r.stars >= 1 && r.stars <= 5) dist[r.stars]++;
  }

  const count = all.length;
  const average =
    count > 0
      ? parseFloat(
          (all.reduce((sum, r) => sum + r.stars, 0) / count).toFixed(2),
        )
      : 0;

  return NextResponse.json({ average, count, distribution: dist });
}
