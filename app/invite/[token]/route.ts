/**
 * The invitation hop.
 *
 * Sets the cookie that survives signup, records the open, and gets out of the
 * way. Modelled on app/r/[code]/route.ts, which solves the same problem for
 * printed and creator links.
 *
 * NEVER 404s. A mistyped, expired or revoked token sends the visitor to the
 * marketplace rather than an error page: they are a real person who was invited
 * to something, and a dead end is the worst possible answer. Only the
 * attribution is lost.
 *
 * NO ?to= PARAMETER, deliberately. /r/[code] needs one because a printed asset
 * can point anywhere; an invitation has exactly one destination, so not
 * accepting a caller-supplied redirect removes the open-redirect surface
 * entirely rather than validating it.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { PRODUCT_EVENTS } from '@/lib/analytics/events';
import {
  ATTR_COOKIE,
  LAST_COOKIE,
  ANON_COOKIE,
  ATTR_MAX_AGE,
  ANON_MAX_AGE,
  parseAttribution,
  serializeAttribution,
  type Attribution,
} from '@/lib/analytics/attribution';
import { INVITE_COOKIE } from '@/lib/classInvites/token';
import { isTokenShaped } from '@/lib/classInvites/token';
import { INVITE_COOKIE_MAX_AGE_S } from '@/lib/classInvites/limits';
import { classDestination } from '@/lib/classInvites/links';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const origin = request.nextUrl.origin;

  let groupId: string | null = null;
  let inviteId: string | null = null;
  let tutorId: string | null = null;
  let valid = false;

  if (isTokenShaped(token)) {
    try {
      const admin = getServiceClient();

      const { data: inviteData } = await admin
        .from('class_invites')
        .select('id, group_id, tutor_id, status, expires_at')
        .eq('token', token)
        .maybeSingle();
      const invite = inviteData as {
        id: string;
        group_id: string | null;
        tutor_id: string;
        status: string;
        expires_at: string;
      } | null;

      if (invite) {
        inviteId = invite.id;
        groupId = invite.group_id;
        tutorId = invite.tutor_id;
        valid = invite.status !== 'revoked';

        // Lazy expiry — the row is corrected by the first person to look at it
        // rather than by a sweep, the same way the parent invite reader does it.
        if (invite.status === 'pending' && Date.parse(invite.expires_at) < Date.now()) {
          await admin
            .from('class_invites')
            .update({ status: 'expired' })
            .eq('id', invite.id)
            .eq('status', 'pending');
          valid = false;
        }
      } else {
        // Not an addressed invitation. It may be a class's shared link, which
        // is a different kind of token: one per class, many people.
        const { data: groupData } = await admin
          .from('groups')
          .select('id, tutor_id, archived_at')
          .eq('invite_link_token', token)
          .maybeSingle();
        const group = groupData as {
          id: string;
          tutor_id: string;
          archived_at: string | null;
        } | null;
        if (group && !group.archived_at) {
          groupId = group.id;
          tutorId = group.tutor_id;
          valid = true;
        }
      }
    } catch (err) {
      // A dead database must not turn an invitation into an error page.
      console.error('[invite] resolve failed:', err);
    }
  }

  const destination = new URL(classDestination(groupId), origin);
  const response = NextResponse.redirect(destination, 307);

  const cookieBase = {
    path: '/',
    sameSite: 'lax' as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  };

  if (valid) {
    // The token itself, for adoption at signup. 'lax' matters: 'strict' drops
    // the cookie on the top-level GET back from Google OAuth, which is exactly
    // the hop a social signup makes.
    response.cookies.set({
      ...cookieBase,
      name: INVITE_COOKIE,
      value: token,
      maxAge: INVITE_COOKIE_MAX_AGE_S,
    });

    // Standard attribution, so product_events and profiles.first_touch get a
    // correct join without needing the campaign_codes table that /r/[code]
    // still tolerates the absence of.
    const attribution: Attribution = {
      utm_source: 'teacher',
      utm_medium: 'invite',
      utm_campaign: groupId ?? tutorId ?? 'teacher_invite',
      ref: 'teacher_invite',
      path: `/invite/${token.slice(0, 12)}`,
      at: new Date().toISOString(),
    };
    const serialized = serializeAttribution(attribution);

    // First touch only, never overwritten: someone who arrived on a campaign
    // last month and an invitation today stays credited to the campaign.
    if (!parseAttribution(request.cookies.get(ATTR_COOKIE)?.value)) {
      response.cookies.set({
        ...cookieBase,
        name: ATTR_COOKIE,
        value: serialized,
        maxAge: ATTR_MAX_AGE,
      });
    }
    response.cookies.set({
      ...cookieBase,
      name: LAST_COOKIE,
      value: serialized,
      maxAge: ATTR_MAX_AGE,
    });

    let anonId = request.cookies.get(ANON_COOKIE)?.value ?? null;
    if (!anonId) {
      anonId = crypto.randomUUID();
      response.cookies.set({
        ...cookieBase,
        name: ANON_COOKIE,
        value: anonId,
        maxAge: ANON_MAX_AGE,
      });
    }

    // Written straight to product_events rather than through track(), for the
    // same reason /r/[code] does: this response is the one setting the cookies,
    // so there is nothing for track() to read yet.
    try {
      const admin = getServiceClient();
      await admin.from('product_events').insert({
        user_id: null,
        anon_id: anonId,
        event: PRODUCT_EVENTS.TEACHER_INVITE_OPENED,
        props: { invite_id: inviteId, group_id: groupId },
        attribution,
      });
    } catch (err) {
      console.error('[invite] failed to record open:', err);
    }
  }

  return response;
}
