import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getServiceClient } from '@/lib/supabase/server';
import { bootstrapProfileIfMissing } from '@/lib/server/bootstrapProfileIfMissing';

type SelectableRole = 'student' | 'tutor' | 'parent';

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

function isValidUsername(username: string) {
  if (username.length < 6 || username.length > 30) return false;
  return /^[a-zA-Z0-9_-]+$/.test(username);
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { role?: string; username?: string } | null;
    const role = body?.role;
    const trimmedUsername = body?.username?.trim() || '';

    if (role !== 'student' && role !== 'tutor' && role !== 'parent') {
      return NextResponse.json({ error: 'Invalid role selected.' }, { status: 400 });
    }

    if (!isValidUsername(trimmedUsername)) {
      return NextResponse.json({ error: 'Please enter a valid username.' }, { status: 400 });
    }

    const supabase = getAuthedSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { error: bootstrapError } = await bootstrapProfileIfMissing(user);
    if (bootstrapError) {
      return NextResponse.json({ error: bootstrapError.message }, { status: 400 });
    }

    const admin = getServiceClient();
    const { data: usernameOwner } = await admin
      .from('profiles')
      .select('id')
      .eq('username', trimmedUsername)
      .neq('id', user.id)
      .maybeSingle();

    if (usernameOwner?.id) {
      return NextResponse.json({ error: 'This username is already taken.' }, { status: 409 });
    }

    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', user.id)
      .maybeSingle();

    const fallbackName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      (user.email ? user.email.split('@')[0] : null) ||
      'User';

    const fullName = existingProfile?.full_name || fallbackName;
    const email = existingProfile?.email || user.email;

    if (!email) {
      return NextResponse.json({ error: 'Unable to determine account email for profile update.' }, { status: 400 });
    }

    const { error: profileError } = await admin
      .from('profiles')
      .update({
        email,
        full_name: fullName,
        username: trimmedUsername,
        role,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    const { error: userError } = await supabase.auth.updateUser({
      data: { role, username: trimmedUsername },
    });

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status: 500 });
  }
}
