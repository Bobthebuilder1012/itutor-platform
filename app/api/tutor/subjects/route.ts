import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CreateTutorSubjectsBody = {
  subjects: Array<{
    subject_id: string;
    price_per_hour_ttd: number;
    mode?: 'online' | 'in_person' | 'either';
  }>;
};

type UpdateTutorSubjectBody = {
  id: string;
  price_per_hour_ttd: number;
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
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as CreateTutorSubjectsBody;
    const subjects = body?.subjects || [];

    if (!Array.isArray(subjects) || subjects.length === 0) {
      return NextResponse.json({ error: 'subjects is required' }, { status: 400 });
    }

    const rows = subjects.map((s) => ({
      tutor_id: user.id,
      subject_id: s.subject_id,
      price_per_hour_ttd: Number.isFinite(Number(s.price_per_hour_ttd)) && Number(s.price_per_hour_ttd) > 0 ? Number(s.price_per_hour_ttd) : 100,
      mode: s.mode || 'either',
    }));

    const { error } = await supabase.from('tutor_subjects').insert(rows);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getAuthedSupabase();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as UpdateTutorSubjectBody;
    if (!body?.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const price = Number(body.price_per_hour_ttd);
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: 'Invalid price' }, { status: 400 });
    }

    const { error } = await supabase
      .from('tutor_subjects')
      .update({ price_per_hour_ttd: price })
      .eq('id', body.id)
      .eq('tutor_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

