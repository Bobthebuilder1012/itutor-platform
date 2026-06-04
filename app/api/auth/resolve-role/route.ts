import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const serverClient = await getServerClient();
    const { data: { user }, error: userError } = await serverClient.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ redirect: null, role: null }, { status: 401 });
    }

    const email = user.email;
    if (!email) return NextResponse.json({ redirect: null, role: null });

    const serviceClient = getServiceClient();

    // Check current user's own profile first
    const { data: ownProfile } = await serviceClient
      .from('profiles')
      .select('role, form_level, billing_mode, teaching_levels')
      .eq('id', user.id)
      .maybeSingle();

    if (ownProfile?.role) {
      const redirect = await resolveRedirect(serviceClient, user.id, ownProfile.role, ownProfile);
      return NextResponse.json({ redirect, role: ownProfile.role });
    }

    // Look for another profile with the same email (linked email/password account)
    const { data: linkedProfile } = await serviceClient
      .from('profiles')
      .select('id, role, form_level, billing_mode, teaching_levels')
      .eq('email', email)
      .neq('id', user.id)
      .maybeSingle();

    if (linkedProfile?.role) {
      await serviceClient.from('profiles').update({
        role: linkedProfile.role,
        form_level: linkedProfile.form_level ?? null,
        billing_mode: linkedProfile.billing_mode ?? null,
      }).eq('id', user.id);

      const redirect = await resolveRedirect(serviceClient, user.id, linkedProfile.role, linkedProfile);
      return NextResponse.json({ redirect, role: linkedProfile.role });
    }

    return NextResponse.json({ redirect: null, role: null });
  } catch {
    return NextResponse.json({ redirect: null, role: null }, { status: 500 });
  }
}

async function resolveRedirect(
  _serviceClient: ReturnType<typeof import('@/lib/supabase/server').getServiceClient>,
  _userId: string,
  role: string,
  profile: { form_level?: string | null; teaching_levels?: string[] | null },
) {
  if (role === 'parent') return '/parent/coming-soon';
  if (role === 'student') return profile.form_level ? '/student/dashboard' : null;
  // Tutor is complete once teaching_levels is set on their profile
  if (role === 'tutor') return (profile.teaching_levels && profile.teaching_levels.length > 0) ? '/tutor/dashboard' : null;
  return null;
}
