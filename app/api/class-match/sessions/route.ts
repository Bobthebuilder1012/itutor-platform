import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import {
  checkTutorEligibility,
  checkClassWellFormed,
  listSessionableClasses,
} from '@/lib/classMatchWeek/eligibility';
import { getLiveCampaign, getParticipation, listTeacherSessions } from '@/lib/classMatchWeek/portalData';
import { mintCampaignMeetLink } from '@/lib/classMatchWeek/meetLink';
import { DISCOUNT_MIN, DISCOUNT_MAX } from '@/lib/classMatchWeek/types';

export const dynamic = 'force-dynamic';

function invalid(field: string) {
  return NextResponse.json({ error: 'invalid_field', field }, { status: 400 });
}

// GET /api/class-match/sessions — everything the teacher page renders in one
// call: their campaign sessions, the classes that cannot back one (with the
// messages saying what to fix), and whether they have opted in.
export async function GET() {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getServiceClient();

    const [sessions, classes, campaign] = await Promise.all([
      listTeacherSessions(service, user.id),
      listSessionableClasses(service, user.id),
      getLiveCampaign(service),
    ]);

    const participation = campaign
      ? await getParticipation(service, campaign.id, user.id)
      : null;

    return NextResponse.json({
      sessions,
      blocked: classes.blocked,
      sessionable: classes.sessionable,
      // getParticipation returns { optedIn } — never null — so read the flag,
      // not the object's truthiness.
      optedIn: participation?.optedIn ?? false,
    });
  } catch (err) {
    console.error('[GET class-match/sessions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/class-match/sessions — create a campaign session, optionally
// publishing it in the same call.
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    }

    const {
      groupId,
      title,
      scheduledAt,
      durationMinutes,
      maxAttendees,
      discountPercent,
      redemptionWindowDays,
      priceDurationMonths,
      discountExpiresAt,
      qualifyingGroupIds,
      publish,
    } = body as Record<string, unknown>;

    if (typeof groupId !== 'string' || !groupId) return invalid('groupId');
    if (typeof title !== 'string' || !title.trim()) return invalid('title');

    const scheduled = typeof scheduledAt === 'string' ? new Date(scheduledAt) : null;
    if (!scheduled || Number.isNaN(scheduled.getTime()) || scheduled.getTime() <= Date.now()) {
      return invalid('scheduledAt');
    }

    if (
      typeof durationMinutes !== 'number' ||
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > 480
    ) {
      return invalid('durationMinutes');
    }

    // NULL is unlimited — the reason max_attendees lives on the new table
    // instead of reusing groups.max_students, where unlimited is unrepresentable.
    if (
      maxAttendees !== null &&
      maxAttendees !== undefined &&
      (typeof maxAttendees !== 'number' || !Number.isInteger(maxAttendees) || maxAttendees <= 0)
    ) {
      return invalid('maxAttendees');
    }

    // Teacher-set percentage, mirroring the widened DB CHECK (migration 235).
    // The floor is the product rule; the ceiling is a typo guard — this number
    // is spent against real money and nothing downstream questions it.
    if (
      typeof discountPercent !== 'number' ||
      !Number.isInteger(discountPercent) ||
      discountPercent < DISCOUNT_MIN ||
      discountPercent > DISCOUNT_MAX
    ) {
      return invalid('discountPercent');
    }
    if (
      typeof redemptionWindowDays !== 'number' ||
      !Number.isInteger(redemptionWindowDays) ||
      redemptionWindowDays < 7 ||
      redemptionWindowDays > 30
    ) {
      return invalid('redemptionWindowDays');
    }
    if (
      typeof priceDurationMonths !== 'number' ||
      !Number.isInteger(priceDurationMonths) ||
      priceDurationMonths < 1 ||
      priceDurationMonths > 24
    ) {
      return invalid('priceDurationMonths');
    }
    // Optional hard deadline (migration 235). It must land AFTER the taster
    // itself — a deadline before the session runs would issue every attendee a
    // coupon that had already expired at the moment they earned it, which reads
    // as the campaign lying rather than as a misconfigured date.
    let discountDeadline: Date | null = null;
    if (discountExpiresAt !== null && discountExpiresAt !== undefined && discountExpiresAt !== '') {
      if (typeof discountExpiresAt !== 'string') return invalid('discountExpiresAt');
      const parsed = new Date(discountExpiresAt);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= scheduled.getTime()) {
        return invalid('discountExpiresAt');
      }
      discountDeadline = parsed;
    }

    if (
      qualifyingGroupIds !== undefined &&
      (!Array.isArray(qualifyingGroupIds) ||
        qualifyingGroupIds.some((id) => typeof id !== 'string'))
    ) {
      return invalid('qualifyingGroupIds');
    }
    if (typeof publish !== 'boolean') return invalid('publish');

    const service = getServiceClient();

    const campaign = await getLiveCampaign(service);
    if (!campaign) {
      return NextResponse.json({ error: 'no_live_campaign' }, { status: 409 });
    }

    // Ownership before anything else. Missing group gets the same 403 as a
    // foreign one — this endpoint should not confirm which ids exist.
    const { data: group } = await service
      .from('groups')
      .select('id, tutor_id')
      .eq('id', groupId)
      .maybeSingle();

    if (!group || group.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const wellFormed = await checkClassWellFormed(service, groupId);
    if (!wellFormed.ok) {
      return NextResponse.json(
        { defects: wellFormed.defects, messages: wellFormed.messages },
        { status: 422 }
      );
    }

    // Creating a first session IS opting in — a teacher who schedules a taster
    // has joined the campaign whether or not they tapped the opt-in button.
    // ON CONFLICT DO NOTHING preserves an earlier snapshot if one exists.
    const eligibility = await checkTutorEligibility(service, user.id);
    const { error: participationError } = await service
      .from('class_match_participation')
      .upsert(
        { campaign_id: campaign.id, tutor_id: user.id, gate_snapshot: eligibility },
        { onConflict: 'campaign_id,tutor_id', ignoreDuplicates: true }
      );
    if (participationError) throw participationError;

    // Mint before insert: a published session must never exist without a room,
    // so a Meet failure aborts the whole create rather than leaving a
    // published row whose join button opens nothing.
    let meetLink: string | null = null;
    const now = new Date().toISOString();
    if (publish) {
      const minted = await mintCampaignMeetLink(service, {
        tutorId: user.id,
        title: title.trim(),
        scheduledAt: scheduled.toISOString(),
        durationMinutes,
      });
      if (!minted.ok) {
        return NextResponse.json(
          { error: 'meet_link_failed', reason: minted.reason, reconnectUrl: minted.reconnectUrl },
          { status: 422 }
        );
      }
      meetLink = minted.url;
    }

    const { data: session, error: insertError } = await service
      .from('class_match_sessions')
      .insert({
        campaign_id: campaign.id,
        group_id: groupId,
        tutor_id: user.id,
        title: title.trim(),
        scheduled_at: scheduled.toISOString(),
        duration_minutes: durationMinutes,
        meet_link: meetLink,
        max_attendees: maxAttendees ?? null,
        status: publish ? 'published' : 'draft',
        published_at: publish ? now : null,
        discount_percent: discountPercent,
        redemption_window_days: redemptionWindowDays,
        price_duration_months: priceDurationMonths,
        discount_expires_at: discountDeadline?.toISOString() ?? null,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // The session's own class always qualifies — that is the floor. A discount
    // that excludes the class the family just sampled is worthless. Extra ids
    // are kept only if they belong to the same tutor; foreign or stale ids are
    // dropped silently rather than sinking the whole create.
    const qualifying = new Set<string>([groupId]);
    const extras = ((qualifyingGroupIds as string[] | undefined) ?? []).filter(
      (id) => id && id !== groupId
    );
    if (extras.length > 0) {
      const { data: owned } = await service
        .from('groups')
        .select('id')
        .in('id', extras)
        .eq('tutor_id', user.id);
      for (const g of owned ?? []) qualifying.add(g.id);
    }

    const { error: qualifyingError } = await service
      .from('class_match_qualifying_groups')
      .insert(Array.from(qualifying).map((gid) => ({ session_id: session.id, group_id: gid })));
    if (qualifyingError) throw qualifyingError;

    // Over-60 is a warning, never a block: ~40% of real class series run
    // longer, and the only hard ceiling is Google's per-account limit on the
    // teacher's own free tier — unknowable here. The UI carries the copy.
    return NextResponse.json(
      {
        session,
        ...(durationMinutes > 60 ? { warning: 'over_60_minutes' } : {}),
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[POST class-match/sessions]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
