import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { isParentAccountsEnabled, PARENT_ACCOUNTS_DISABLED_MESSAGE } from '@/lib/featureFlags/parentAccounts';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const serverClient = await getServerClient();
    const { data: { user }, error: userError } = await serverClient.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { role } = body;
    const service = getServiceClient();

    if (role === 'student') {
      const { form_level, school, institution_id } = body;
      if (!form_level) return NextResponse.json({ error: 'Year level is required' }, { status: 400 });

      const { error } = await service.from('profiles').update({
        form_level,
        school: school ?? null,
        institution_id: institution_id ?? null,
      }).eq('id', user.id);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    if (role === 'tutor') {
      const { teaching_levels } = body;
      if (!teaching_levels || teaching_levels.length === 0) {
        return NextResponse.json({ error: 'Select at least one teaching level' }, { status: 400 });
      }

      const { error } = await service.from('profiles').update({
        teaching_levels,
      }).eq('id', user.id);

      if (error) {
        // If the column simply doesn't exist yet, return a clear message
        return NextResponse.json({
          error: `Profile save failed: ${error.message}. Please ensure the teaching_levels migration has been run in Supabase.`,
        }, { status: 400 });
      }

      return NextResponse.json({ success: true });
    }

    if (role === 'set-role') {
      const { newRole } = body;
      // This write runs as the service role, so migration 217's column guard
      // does not apply: whatever this accepts is written. It used to accept any
      // value, which let any signed-in account post newRole: 'admin' (is_admin()
      // is role = 'admin') or swap its existing role. It is the first-role step
      // of /signup/complete-role and nothing else.
      if (newRole !== 'student' && newRole !== 'tutor' && newRole !== 'parent') {
        return NextResponse.json({ error: 'Invalid role selected.' }, { status: 400 });
      }
      if (newRole === 'parent' && !isParentAccountsEnabled()) {
        return NextResponse.json({ error: PARENT_ACCOUNTS_DISABLED_MESSAGE }, { status: 403 });
      }
      const { data: current } = await service.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (current?.role && current.role !== newRole) {
        return NextResponse.json({ error: 'This account already has a role.' }, { status: 409 });
      }
      const { error } = await service.from('profiles').update({ role: newRole }).eq('id', user.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown role' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}
