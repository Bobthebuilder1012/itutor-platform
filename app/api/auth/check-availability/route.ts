import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const RESERVED = new Set(['admin', 'itutor', 'support', 'help', 'system', 'null', 'undefined', 'test']);

export async function POST(req: Request) {
  try {
    const { email, username } = await req.json();

    if (!email && !username) {
      return NextResponse.json(
        { error: 'Provide at least one of email or username' },
        { status: 400 },
      );
    }

    const supabase = getServiceClient();
    let emailAvailable = true;
    let usernameAvailable = true;

    if (email) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', email)
        .limit(1)
        .maybeSingle();

      if (profile) {
        const { data: { user: authUser } } = await supabase.auth.admin.getUserById(profile.id);
        if (authUser) {
          emailAvailable = false;
        } else {
          await supabase.from('profiles').delete().eq('id', profile.id);
        }
      }
    }

    if (username) {
      if (RESERVED.has(username.toLowerCase())) {
        usernameAvailable = false;
      } else {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .ilike('username', username)
          .limit(1)
          .maybeSingle();

        if (profile) {
          const { data: { user: authUser } } = await supabase.auth.admin.getUserById(profile.id);
          if (authUser) {
            usernameAvailable = false;
          } else {
            await supabase.from('profiles').delete().eq('id', profile.id);
          }
        }
      }
    }

    return NextResponse.json({ emailAvailable, usernameAvailable });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
