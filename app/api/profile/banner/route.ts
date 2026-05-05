import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function expectedBannerPrefix(userId: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  return `${base}/storage/v1/object/public/avatars/${userId}/`;
}

function isValidBannerUrlForUser(userId: string, url: string): boolean {
  const clean = url.split('?')[0].split('#')[0];
  if (!clean.startsWith(expectedBannerPrefix(userId))) return false;
  return clean.endsWith('/profile-banner.jpg');
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const raw = body?.bannerUrl;
    const bannerUrl: string | null =
      raw === null || raw === undefined || raw === '' ? null : String(raw).trim();

    if (bannerUrl !== null && !isValidBannerUrlForUser(user.id, bannerUrl)) {
      return NextResponse.json({ error: 'Invalid banner URL' }, { status: 400 });
    }

    const admin = getServiceClient();
    const { data: profile, error: roleError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (roleError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (profile.role !== 'tutor') {
      return NextResponse.json({ error: 'Only tutors can set a profile banner' }, { status: 403 });
    }

    const canonicalUrl = bannerUrl === null ? null : bannerUrl.split('?')[0].split('#')[0];

    const { data: updated, error: updateError } = await admin
      .from('profiles')
      .update({ profile_banner_url: canonicalUrl })
      .eq('id', user.id)
      .select('profile_banner_url, updated_at')
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: 'Banner was not saved' }, { status: 500 });
    }

    return NextResponse.json({
      profile_banner_url: updated.profile_banner_url,
      updated_at: updated.updated_at,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
