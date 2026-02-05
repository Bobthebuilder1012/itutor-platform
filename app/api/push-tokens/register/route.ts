import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type RegisterBody = {
  token?: string;
  platform?: 'web' | 'android' | 'ios';
};

function getSupabaseRouteClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.delete({ name, ...options });
        },
      },
    }
  );
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseRouteClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as RegisterBody;
    const token = body.token?.trim();
    const platform = body.platform ?? 'web';

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    if (!['web', 'android', 'ios'].includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: user.id,
        token,
        platform,
        last_used_at: now,
      },
      {
        onConflict: 'user_id,token',
      }
    );

    if (error) {
      // Fail silently per requirements (token storage failures shouldn't block UX)
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    // Fail silently
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

