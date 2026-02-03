import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getServiceClient } from '@/lib/supabase/server';

type Body = {
  sessionId?: string;
  stars?: number;
  comment?: string | null;
};

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

export async function POST(request: NextRequest) {
  try {
    const supabase = getAuthedSupabase();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as Body;
    const sessionId = body.sessionId;
    const stars = body.stars;
    const comment = typeof body.comment === 'string' ? body.comment : null;

    if (!sessionId || typeof stars !== 'number') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return NextResponse.json({ error: 'Stars must be an integer from 1 to 5' }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'student') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const nowIso = new Date().toISOString();

    const { data: session } = await supabase
      .from('sessions')
      .select('id, tutor_id, student_id')
      .eq('id', sessionId)
      .eq('student_id', user.id)
      .neq('status', 'CANCELLED')
      .lte('scheduled_end_at', nowIso)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not eligible for rating' }, { status: 400 });
    }

    // One rating per (student, tutor). If it already exists, overwrite it (keep latest).
    const admin = getServiceClient();

    const payload = {
      session_id: sessionId,
      student_id: user.id,
      tutor_id: session.tutor_id,
      stars,
      comment: comment && comment.trim().length > 0 ? comment.trim() : null,
      created_at: new Date().toISOString(),
    };

    // Preferred path: requires a UNIQUE constraint on (student_id, tutor_id).
    const { error: upsertError } = await admin
      .from('ratings')
      .upsert(payload, { onConflict: 'student_id,tutor_id' });

    if (upsertError) {
      // Backward-compatible fallback: if the constraint isn't present yet in Supabase,
      // emulate upsert by selecting and then updating/inserting.
      const msg = String(upsertError.message || '');
      const missingConstraint =
        msg.includes('no unique or exclusion constraint') ||
        msg.includes('ON CONFLICT') ||
        msg.includes('42P10');

      if (!missingConstraint) {
        return NextResponse.json({ error: upsertError.message }, { status: 400 });
      }

      const { data: existing, error: existingError } = await admin
        .from('ratings')
        .select('id')
        .eq('student_id', user.id)
        .eq('tutor_id', session.tutor_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 400 });
      }

      if (existing?.id) {
        const { error: updateError } = await admin
          .from('ratings')
          .update({
            session_id: payload.session_id,
            stars: payload.stars,
            comment: payload.comment,
            created_at: payload.created_at,
          })
          .eq('id', existing.id);

        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 400 });
        }
      } else {
        const { error: insertError } = await admin.from('ratings').insert(payload);
        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 400 });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
  }
}

