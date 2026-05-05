export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email')?.trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email, role, avatar_url')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ profile: null }, { status: 404 });
  }

  return NextResponse.json({ profile: data });
}
