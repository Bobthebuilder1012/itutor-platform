import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getServiceClient } from '@/lib/supabase/server';
import { bootstrapProfileIfMissing } from '@/lib/server/bootstrapProfileIfMissing';

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

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest) {
  try {
    const supabase = getAuthedSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getServiceClient();

    const { data: existing } = await admin.from('profiles').select('id').eq('id', user.id).maybeSingle();
    if (existing?.id) return NextResponse.json({ ok: true, existed: true });

    const { error } = await bootstrapProfileIfMissing(user);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, created: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
  }
}

