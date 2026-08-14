// GET /api/parent/tutors/[tutorId] — one tutor, for the parent-facing profile.
//
// Adds the two blocks the kit's TutorProfile shows and the list endpoint does
// not: weekly availability and recent reviews.
//
// I previously said neither was exposed to parents. That was wrong —
// tutor_availability_rules holds the weekly pattern and
// /api/public/tutors/[id]/reviews already serves ratings publicly. Both are
// read here rather than left off the page.
//
// STILL SCOPED TO TUTORS WHO TEACH THIS PARENT'S CHILDREN. Reviews are public,
// but this route is not a public directory — the relationship is what grants a
// parent the page, same as the list endpoint.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ tutorId: string }> };

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "16:00:00" -> "4:00 PM" */
function pretty(t: string): string {
  const [h, m] = t.split(':').map(Number);
  if (!Number.isFinite(h)) return t;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hh}:${String(m).padStart(2, '0')} ${ampm}` : `${hh} ${ampm}`;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const { tutorId } = await params;

    // Same relationship check as the list route.
    const { data: links } = await admin
      .from('parent_child_links')
      .select('child_id')
      .eq('parent_id', parentProfile.id);

    const childIds = ((links ?? []) as unknown as Array<{ child_id: string }>).map((l) => l.child_id);
    if (childIds.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // ---- weekly availability -------------------------------------------
    // Only active rules, and rendered as a weekly pattern rather than bookable
    // slots: a parent is judging "does this fit our week", not booking a time.
    let availability: Array<{ day: string; windows: string[] }> = [];
    try {
      const { data: rules } = await admin
        .from('tutor_availability_rules')
        .select('day_of_week, start_time, end_time, is_active')
        .eq('tutor_id', tutorId)
        .eq('is_active', true)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(60);

      const byDay = new Map<number, string[]>();
      for (const r of (rules ?? []) as unknown as Array<{
        day_of_week: number;
        start_time: string;
        end_time: string;
      }>) {
        const list = byDay.get(r.day_of_week) ?? [];
        list.push(`${pretty(r.start_time)}–${pretty(r.end_time)}`);
        byDay.set(r.day_of_week, list);
      }

      // Monday-first, matching every other date surface in the app.
      const order = [1, 2, 3, 4, 5, 6, 0];
      availability = order
        .filter((d) => byDay.has(d))
        .map((d) => ({ day: DAYS[d], windows: byDay.get(d) ?? [] }));
    } catch {
      // Table absent on an older environment: the block is simply omitted rather
      // than failing the page.
      availability = [];
    }

    // ---- recent reviews -------------------------------------------------
    // Read directly rather than proxying the public route, so this stays one
    // request and cannot 404 differently from the rest of the page.
    let reviews: Array<{ id: string; stars: number; comment: string | null; who: string; when: string }> = [];
    let averageRating: number | null = null;
    let ratingCount = 0;

    try {
      const { data: ratings } = await admin
        .from('ratings')
        .select('id, stars, comment, created_at, student_id, is_active')
        .eq('tutor_id', tutorId)
        .order('created_at', { ascending: false })
        .limit(50);

      const active = ((ratings ?? []) as unknown as Array<{
        id: string;
        stars: number;
        comment: string | null;
        created_at: string;
        student_id: string;
        is_active: boolean | null;
      }>).filter((r) => r.is_active !== false);

      ratingCount = active.length;
      averageRating = ratingCount
        ? Math.round((active.reduce((s, r) => s + Number(r.stars || 0), 0) / ratingCount) * 10) / 10
        : null;

      const withComments = active.filter((r) => (r.comment ?? '').trim().length > 0).slice(0, 5);

      const studentIds = Array.from(new Set(withComments.map((r) => r.student_id)));
      const { data: students } = studentIds.length
        ? await admin.from('profiles').select('id, full_name, display_name').in('id', studentIds)
        : { data: [] };

      const nameOf = new Map(
        ((students ?? []) as unknown as Array<{
          id: string;
          full_name: string | null;
          display_name: string | null;
        }>).map((s) => [s.id, s.display_name || s.full_name || 'A student'])
      );

      reviews = withComments.map((r) => ({
        id: r.id,
        stars: Number(r.stars || 0),
        comment: r.comment,
        // First name only. A review is public, but a parent browsing does not
        // need another family's child fully named back to them.
        who: (nameOf.get(r.student_id) ?? 'A student').split(' ')[0],
        when: new Date(r.created_at).toLocaleDateString('en-TT', {
          month: 'short',
          year: 'numeric',
          timeZone: 'America/Port_of_Spain',
        }),
      }));
    } catch {
      reviews = [];
    }

    return NextResponse.json({ availability, reviews, averageRating, ratingCount });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[GET /api/parent/tutors/[tutorId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
