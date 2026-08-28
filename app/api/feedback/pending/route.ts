import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function getAuthedSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

function lookbackHours(): number {
  const raw = process.env.FEEDBACK_ENFORCEMENT_LOOKBACK_HOURS;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 48; // default: last 48 hours
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = getAuthedSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ redirectTo: null });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = profile?.role;
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const cutoffIso = new Date(now - lookbackHours() * 60 * 60 * 1000).toISOString();

    if (role === 'student') {
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, tutor_id, scheduled_end_at')
        .eq('student_id', user.id)
        .neq('status', 'CANCELLED')
        .lte('scheduled_end_at', nowIso)
        .gte('scheduled_end_at', cutoffIso)
        .order('scheduled_end_at', { ascending: true })
        .limit(50);

      const tutorIds = Array.from(
        new Set((sessions || []).map((s: any) => s.tutor_id).filter(Boolean))
      );

      if (tutorIds.length > 0) {
        const { data: ratings } = await supabase
          .from('ratings')
          .select('tutor_id')
          .eq('student_id', user.id)
          .in('tutor_id', tutorIds);

        const ratedTutors = new Set((ratings || []).map((r: any) => r.tutor_id));
        const pending = (sessions || []).find((s: any) => !ratedTutors.has(s.tutor_id));
        if (pending?.id) {
          return NextResponse.json({ redirectTo: `/feedback/student/${pending.id}` });
        }
      }
    }

    // The tutor branch is gone, deliberately, and not just because the table it
    // read is dropped.
    //
    // It used to look for a session with no tutor_feedback row and hand the
    // middleware a redirect, which trapped the tutor on a feedback form until
    // they filled it in. That is the strongest enforcement the product has, and
    // it is the exact opposite of the model that replaced it: §8 makes feedback
    // optional and pull-based, §8.1 allows "No deadline, no expiry, no reminder,
    // no escalation", and decision 12 gives it no payout consequence. A forced
    // redirect is a deadline, a reminder and an escalation at once.
    //
    // Tutors are now prompted exactly once, when a family actually asks
    // (§8.1), and find outstanding requests at /tutor/feedback.
    //
    // The student branch above stays: it drives session RATINGS, which is a
    // different system feeding tutor rating_average and the marketplace
    // rankings, and nothing in this workstream changes it.
    return NextResponse.json({ redirectTo: null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
  }
}

