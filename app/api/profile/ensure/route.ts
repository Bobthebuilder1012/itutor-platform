import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getServiceClient } from '@/lib/supabase/server';

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

function normalizeUsernameFromEmail(email: string) {
  const prefix = email.split('@')[0] || 'user';
  return prefix.toLowerCase().replace(/[.+]/g, '_').replace(/[^a-z0-9_-]/g, '_');
}

async function findAvailableUsername(admin: ReturnType<typeof getServiceClient>, base: string) {
  let candidate = base || 'user';
  for (let i = 0; i < 6; i++) {
    const { data } = await admin.from('profiles').select('id').eq('username', candidate).maybeSingle();
    if (!data) return candidate;
    const suffix = i < 5 ? String(Math.floor(1000 + Math.random() * 9000)) : String(Date.now()).slice(-6);
    candidate = `${base}_${suffix}`;
  }
  return `${base}_${String(Date.now()).slice(-6)}`;
}

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

    const meta = (user.user_metadata || {}) as Record<string, any>;
    const email = user.email || '';
    const role = (meta.role as string | undefined) || 'student';
    const fullName =
      (meta.full_name as string | undefined) ||
      (meta.display_name as string | undefined) ||
      (meta.username as string | undefined) ||
      (email.split('@')[0] || 'User');

    const baseUsername = (meta.username as string | undefined) || (email ? normalizeUsernameFromEmail(email) : 'user');
    const username = await findAvailableUsername(admin, baseUsername);

    const now = new Date().toISOString();
    const termsAccepted = Boolean(meta.terms_accepted);

    const payload: Record<string, any> = {
      id: user.id,
      email: email || null,
      role,
      full_name: fullName || 'User',
      username,
      country: (meta.country as string | undefined) || null,
      display_name: (meta.display_name as string | undefined) || null,
      terms_accepted: termsAccepted,
      terms_accepted_at: termsAccepted ? now : null,
      created_at: now,
      updated_at: now,
    };

    const { error } = await admin.from('profiles').upsert(payload, { onConflict: 'id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, created: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
  }
}

