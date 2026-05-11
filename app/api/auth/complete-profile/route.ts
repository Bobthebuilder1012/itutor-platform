import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

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
      if (!newRole) return NextResponse.json({ error: 'Role is required' }, { status: 400 });
      const { error } = await service.from('profiles').update({ role: newRole }).eq('id', user.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown role' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
}
