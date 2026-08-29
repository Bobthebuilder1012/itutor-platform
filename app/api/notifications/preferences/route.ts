// GET / PATCH /api/notifications/preferences — handover §10.6.
//
// Not parent-only: the table is keyed on user_id, and a self-paying student
// receives approval-outcome and feedback email too. Gating this behind a parent
// check would leave those users with no way to turn anything off.
//
// The category list is served from the same constant the send paths use, so the
// screen can never offer a switch for something nothing sends — §10.6 rules out
// digest, attendance and parent session reminders precisely because those
// channels do not exist.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import {
  NOTIFICATION_CATEGORIES,
  getPreferences,
  isCategory,
  setChildMute,
  setPreference,
  type NotificationChannel,
} from '@/lib/server/notificationPreferences';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const server = await getServerClient();
    const {
      data: { user },
    } = await server.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getServiceClient();
    const { matrix, mutes } = await getPreferences(admin, user.id);

    // Children, so the per-child mute rows have names to attach to.
    const { data: links } = await admin
      .from('parent_child_links')
      .select('child_id')
      .eq('parent_id', user.id);

    const childIds = ((links ?? []) as unknown as Array<{ child_id: string }>).map(
      (l) => l.child_id
    );

    let children: Array<{ id: string; name: string }> = [];
    if (childIds.length > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, full_name, display_name, username')
        .in('id', childIds);
      children = ((profiles ?? []) as unknown as Array<{
        id: string;
        full_name: string | null;
        display_name: string | null;
        username: string | null;
      }>).map((p) => ({
        id: p.id,
        name: p.display_name || p.full_name || p.username || 'Child',
      }));
    }

    return NextResponse.json({
      categories: NOTIFICATION_CATEGORIES,
      preferences: matrix,
      mutes,
      children,
      // Stated so the screen can say it rather than implying everything is
      // muteable: the in-app list is never suppressed.
      inAppAlwaysOn: true,
    });
  } catch (err) {
    console.error('[GET /api/notifications/preferences]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const server = await getServerClient();
    const {
      data: { user },
    } = await server.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      category?: string;
      channel?: string;
      enabled?: boolean;
      childId?: string | null;
      muted?: boolean;
    };

    if (!body.category || !isCategory(body.category)) {
      return NextResponse.json({ error: 'Unknown category' }, { status: 400 });
    }

    const admin = getServiceClient();

    // Per-child mute: one category, one child, on or off.
    if (body.childId) {
      if (typeof body.muted !== 'boolean') {
        return NextResponse.json({ error: 'muted must be a boolean' }, { status: 400 });
      }

      // The RLS policy enforces this too, but the service client bypasses RLS —
      // so the link is checked here rather than trusted.
      const { data: link } = await admin
        .from('parent_child_links')
        .select('id')
        .eq('parent_id', user.id)
        .eq('child_id', body.childId)
        .limit(1);

      if (!link || link.length === 0) {
        return NextResponse.json({ error: 'Not your child' }, { status: 403 });
      }

      const result = await setChildMute(admin, {
        parentId: user.id,
        childId: body.childId,
        category: body.category,
        muted: body.muted,
      });
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // Channel preference.
    if (body.channel !== 'push' && body.channel !== 'email') {
      return NextResponse.json({ error: 'channel must be push or email' }, { status: 400 });
    }
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
    }

    const result = await setPreference(admin, {
      userId: user.id,
      category: body.category,
      channel: body.channel as NotificationChannel,
      enabled: body.enabled,
    });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/notifications/preferences]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
