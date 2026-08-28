import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { seatState } from '@/lib/services/seatOccupancy';
import { resolveGroupActor, auditAdminOverride } from '@/lib/auth/groupAccess';
import type { UpdateGroupInput } from '@/lib/types/groups';
import { generateUpcomingSessions } from '@/lib/recurrence';
import { canOpenPreorders } from '@/lib/services/secureSpotService';
import { classOccupancy } from '@/lib/services/classOccupancy';

type Params = { params: Promise<{ groupId: string }> };
function isSchemaMismatch(error: any): boolean {
  const code = String(error?.code ?? '');
  const msg = String(error?.message ?? '').toLowerCase();
  return (
    code === '42703' ||
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    code === 'PGRST201' ||
    msg.includes('could not find') ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('more than one relationship') ||
    msg.includes('could not embed')
  );
}

// GET /api/groups/[groupId] — get group detail
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Anonymous reads are allowed so a QR code or a shared class link opens the
    // class page without an account — you cannot ask someone to sign up for a
    // class they have not been allowed to look at. Anonymous callers get a
    // PUBLIC view only: the roster, member previews and membership state are
    // stripped from the response below, and a private or archived class still
    // 404s rather than leaking its existence.
    const isAnonymous = !user;

    const service = getServiceClient();
    // NOTE ON ORDERING. These are tried widest-first and a single missing column
    // 42703s the WHOLE select, so the in-person columns (migration 242) get their
    // own tier at the top rather than being added to the existing widest one.
    // Production does not have 242; if they were merged into tier 1, tier 1 would
    // fail there and every class would fall back to a narrower select — which is
    // exactly how "Secure your spot" once went missing on staging, as the comment
    // on the last tier records.
    const IN_PERSON_COLUMNS =
      'class_format, venue_id, venue_visibility, max_students_online, max_students_physical, ' +
      'price_online_ttd, price_physical_ttd, accepts_cash, ' +
      'venue:venues(id, name, region_id, address_line, access_instructions, arrival_notes, region:regions(id, name))';

    const WIDEST_BASE = `
        id, name, description, tutor_id, subject, pricing, created_at, archived_at,
        difficulty, goals, price_per_session, price_monthly, pricing_model, recurrence_type, recurrence_rule,
        form_level, topic, session_length_minutes, session_frequency, price_per_course, pricing_mode, availability_window, media_gallery,
        timezone, max_students, cover_image, header_image, content_blocks, status, updated_at,
        whatsapp_url, google_classroom_link, primary_channel, meeting_link,
        require_join_requests, auto_suspend_missed_payment, grace_period_days, secure_spot_enabled, end_date,
        visibility, parent_feedback_mode, parent_feedback_price, member_service_fee,
        tutor:profiles!groups_tutor_id_fkey(id, full_name, avatar_url, response_time_minutes),
        group_members(id, user_id, status, profile:profiles!group_members_user_id_fkey(id, full_name, avatar_url))
      `;

    const groupSelects = [
      `${WIDEST_BASE}, ${IN_PERSON_COLUMNS}`,
      WIDEST_BASE,
      `
        id, name, description, tutor_id, subject, pricing, created_at, archived_at,
        form_level, topic, session_length_minutes, session_frequency, price_per_course, pricing_mode, availability_window,
        max_students, price_per_session, price_monthly, cover_image, whatsapp_url, whatsapp_link,
        google_classroom_link, primary_channel, meeting_link, schedule_display, schedule_data,
        require_join_requests, auto_suspend_missed_payment, grace_period_days, secure_spot_enabled, end_date,
        visibility, parent_feedback_mode, parent_feedback_price, feedback_mode, status,
        tutor:profiles!groups_tutor_id_fkey(id, full_name, avatar_url),
        group_members(id, user_id, status, profile:profiles!group_members_user_id_fkey(id, full_name, avatar_url))
      `,
      `
        id, name, description, tutor_id, subject, pricing, created_at,
        max_students, price_per_session, price_monthly, cover_image, whatsapp_url, whatsapp_link,
        google_classroom_link, schedule_display, schedule_data, require_join_requests, visibility, status, secure_spot_enabled, end_date,
        tutor:profiles!groups_tutor_id_fkey(id, full_name, avatar_url),
        group_members(id, user_id, status, profile:profiles!group_members_user_id_fkey(id, full_name, avatar_url))
      `,
      // Last resort. It must still carry the columns the class page cannot
      // work without, or a single missing column earlier in the chain silently
      // strips them: on staging, content_blocks/whatsapp_url/parent_feedback_mode
      // are absent, every earlier select 42703s, and this one wins — which is
      // why "Secure your spot" never appeared there despite the flag being on.
      //
      // cover_image and friends were missing from THIS select while appearing in
      // every earlier one — so on staging, where this select is the one that
      // wins, the class banner never rendered and neither did the level, topic,
      // session length or frequency. It read as a styling bug on the parent's
      // class page; it was a column list.
      //
      // Every column added here was checked to exist on BOTH staging and prod
      // before being added, because one absent column 42703s this select too —
      // and this is the last resort, so there is nothing left to fall back to.
      `
        id, name, description, tutor_id, subject, pricing, created_at, archived_at, status,
        max_students, price_per_session, price_monthly, pricing_model, require_join_requests, visibility,
        secure_spot_enabled, end_date, cover_image, form_level, topic,
        session_length_minutes, session_frequency, recurrence_type,
        grace_period_days, auto_suspend_missed_payment, google_classroom_link,
        tutor:profiles!groups_tutor_id_fkey(id, full_name, avatar_url),
        group_members(id, user_id, status, profile:profiles!group_members_user_id_fkey(id, full_name, avatar_url))
      `,
    ];

    let group: any = null;
    let groupError: any = null;
    for (let i = 0; i < groupSelects.length; i += 1) {
      const attempt = await service
        .from('groups')
        .select(groupSelects[i]!)
        .eq('id', groupId)
        .single();

      if (!attempt.error && attempt.data) {
        group = attempt.data;
        groupError = null;
        break;
      }

      groupError = attempt.error;
      if (!isSchemaMismatch(groupError)) {
        break;
      }
      console.warn(`[GET /api/groups/[groupId]] group select fallback attempt ${i + 1} failed:`, groupError?.message);
    }

    // PostgREST nested embeds can fail (ambiguous FK, hint mismatch). Load core row + relations manually.
    if (!group) {
      const { data: bareGroup, error: bareErr } = await service
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .maybeSingle();

      if (!bareErr && bareGroup) {
        let tutor: any = null;
        const tutorFull = await service
          .from('profiles')
          .select('id, full_name, avatar_url, response_time_minutes')
          .eq('id', bareGroup.tutor_id)
          .maybeSingle();
        if (!tutorFull.error && tutorFull.data) {
          tutor = tutorFull.data;
        } else {
          const tutorLite = await service
            .from('profiles')
            .select('id, full_name, avatar_url')
            .eq('id', bareGroup.tutor_id)
            .maybeSingle();
          if (!tutorLite.error) tutor = tutorLite.data;
        }

        const { data: memberRows, error: memErr } = await service
          .from('group_members')
          .select('id, user_id, status')
          .eq('group_id', groupId);

        const rows = memErr ? [] : (memberRows ?? []);
        const userIds = [...new Set(rows.map((m: { user_id: string }) => m.user_id))];
        const profileById = new Map<string, { id: string; full_name: string | null; avatar_url: string | null }>();
        if (userIds.length > 0) {
          const { data: profs } = await service
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', userIds);
          for (const p of profs ?? []) profileById.set(p.id, p);
        }

        group = {
          ...bareGroup,
          tutor: tutor ?? null,
          group_members: rows.map((m: any) => ({
            ...m,
            profile: profileById.get(m.user_id) ?? null,
          })),
        };
        groupError = null;
      } else if (!bareErr && !bareGroup) {
        return NextResponse.json({ error: 'Group not found' }, { status: 404 });
      }
    }

    if (!group) {
      if (groupError?.code === 'PGRST116') {
        return NextResponse.json({ error: 'Group not found' }, { status: 404 });
      }
      console.error('[GET /api/groups/[groupId]] unable to load group:', groupError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    // A private or archived class is not browsable by a stranger. Signed-in
    // users keep the previous behaviour (the tutor and members still need it).
    if (isAnonymous) {
      const isPublic = String(group.visibility ?? 'public').toLowerCase() === 'public';
      if (!isPublic || group.archived_at) {
        return NextResponse.json({ error: 'Group not found' }, { status: 404 });
      }
    }

    const approvedMembers = (group.group_members ?? []).filter((m: any) => m.status === 'approved');
    const currentUserMembership = user
      ? ((group.group_members ?? []).find((m: any) => m.user_id === user.id) ?? null)
      : null;

    // Viewer membership must consider BOTH tables. Free / approval-gated classes
    // create a `group_members` row, but a paid class enrols through
    // /subscribe which only writes `group_enrollments` — a student who paid has
    // no group_members row at all. Resolving this server-side keeps every page
    // that renders a join CTA from having to remember both.
    let viewerEnrollmentStatus: string | null = null;
    let viewerReleaseDate: string | null = null;
    /** Which seat this viewer holds. Null before 242, or when not enrolled. */
    let viewerSeatType: string | null = null;
    // Guarded: this page is now browsable by signed-out visitors, who have no
    // membership to resolve. Unguarded, the merge of anonymous access with this
    // block would have dereferenced a null user on every public class view.
    if (user) {
      // Tiered: `seat_type` arrives in migration 242, and a missing column
      // fails the WHOLE select — which here would make an enrolled student
      // look like a stranger to their own class page.
      let enrolRows: any[] | null = null;
      let enrolErr: any = null;
      for (const cols of ['status, release_date, seat_type', 'status, release_date']) {
        const res = await service
          .from('group_enrollments')
          .select(cols)
          .eq('group_id', groupId)
          .eq('student_id', user.id);
        if (!res.error) { enrolRows = (res.data ?? []) as any[]; enrolErr = null; break; }
        enrolErr = res.error;
        if (!isSchemaMismatch(res.error)) break;
      }

      if (enrolErr && !isSchemaMismatch(enrolErr)) {
        console.warn('[GET /api/groups/[groupId]] viewer enrollment load failed (non-fatal):', enrolErr?.message ?? enrolErr);
      }
      // SECURED belongs in this list. A student who paid their first month up
      // front holds a place, so omitting it offered them "Secure your spot" on
      // a class they had already paid for.
      const statuses = (enrolRows ?? []).map((r: any) => String(r.status));
      viewerEnrollmentStatus =
        statuses.find((s) => ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED'].includes(s)) ??
        statuses.find((s) => s === 'PENDING_PAYMENT') ??
        null;
      viewerReleaseDate =
        (enrolRows ?? []).find((r: any) => String(r.status) === 'SECURED')?.release_date ?? null;
      // The seat that goes with the enrolment we actually settled on, not
      // whichever row happens to come back first — a student who cancelled a
      // room seat and rejoined online has two rows and only one live seat.
      viewerSeatType =
        (enrolRows ?? []).find((r: any) => String(r.status) === viewerEnrollmentStatus)?.seat_type ?? null;
    }

    const viewerMemberStatus = currentUserMembership?.status ? String(currentUserMembership.status) : null;
    const viewerEnrolled =
      (!!viewerMemberStatus && ['approved', 'active', 'invited'].includes(viewerMemberStatus)) ||
      (!!viewerEnrollmentStatus && ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED'].includes(viewerEnrollmentStatus));
    const viewerMembership = {
      member_status: viewerMemberStatus,
      enrollment_status: viewerEnrollmentStatus,
      enrolled: viewerEnrolled,
      pending_approval: viewerMemberStatus === 'pending',
      payment_pending: !viewerEnrolled && viewerEnrollmentStatus === 'PENDING_PAYMENT',
      /** Place held by an up-front first-month payment (Secure your spot). */
      secured: viewerEnrollmentStatus === 'SECURED',
      release_date: viewerReleaseDate,
      /** 'online' | 'physical', or null before 242 / when not enrolled. */
      seat_type: viewerSeatType,
    };

    // Fetch sessions with upcoming occurrences (service client bypasses RLS so all users get schedule preview)
    let sessionsRaw: any[] | null = null;
    let sessionsError: any = null;
    ({ data: sessionsRaw, error: sessionsError } = await service
      .from('group_sessions')
      .select(`
        id, group_id, title, recurrence_type, recurrence_days, start_time, duration_minutes, starts_on, ends_on, created_at,
        recurrence_rule, timezone, meeting_platform,
        group_session_occurrences(id, group_session_id, scheduled_start_at, scheduled_end_at, status, cancelled_at, cancellation_note, meeting_link, meeting_platform, timezone)
      `)
      .eq('group_id', groupId)
      .order('starts_on', { ascending: true }));

    if (sessionsError && isSchemaMismatch(sessionsError)) {
      ({ data: sessionsRaw, error: sessionsError } = await service
        .from('group_sessions')
        .select(`
          id, group_id, title, recurrence_type, recurrence_days, start_time, duration_minutes, starts_on, ends_on, created_at,
          group_session_occurrences(id, group_session_id, scheduled_start_at, scheduled_end_at, status, cancelled_at, cancellation_note)
        `)
        .eq('group_id', groupId)
        .order('starts_on', { ascending: true }));
    }
    if (sessionsError && !isSchemaMismatch(sessionsError)) {
      console.warn('[GET /api/groups/[groupId]] sessions load failed (non-fatal):', sessionsError?.message ?? sessionsError);
      sessionsRaw = [];
    }

    const sessions = (sessionsRaw ?? []).map((s: any) => ({
      ...s,
      occurrences: s.group_session_occurrences ?? [],
      group_session_occurrences: undefined,
    }));

    // Find next upcoming occurrence across all sessions
    const now = new Date();
    const allUpcoming = sessions
      .flatMap((s: any) => s.occurrences)
      .filter((o: any) => (o.status ? o.status === 'upcoming' : true) && new Date(o.scheduled_start_at) > now)
      .sort((a: any, b: any) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime());

    const nextOccurrence = allUpcoming[0] ?? null;
    const upcomingSessions = allUpcoming.slice(0, 10);

    let reviewsRaw: any[] | null = null;
    let reviewsError: any = null;
    ({ data: reviewsRaw, error: reviewsError } = await service
      .from('group_reviews')
      .select(`
        id, rating, comment, is_verified, created_at, reviewer_id,
        reviewer:profiles!group_reviews_reviewer_id_fkey(id, full_name, avatar_url)
      `)
      .eq('group_id', groupId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5));
    if (reviewsError && isSchemaMismatch(reviewsError)) {
      reviewsRaw = [];
    } else if (reviewsError) {
      console.warn('[GET /api/groups/[groupId]] reviews load failed (non-fatal):', reviewsError?.message ?? reviewsError);
      reviewsRaw = [];
    }

    const reviews = reviewsRaw ?? [];
    let ratingRows: any[] | null = [];
    let ratingsError: any = null;
    ({ data: ratingRows, error: ratingsError } = await service
      .from('group_reviews')
      .select('rating')
      .eq('group_id', groupId)
      .is('deleted_at', null));
    if (ratingsError && !isSchemaMismatch(ratingsError)) {
      console.warn('[GET /api/groups/[groupId]] ratings aggregate failed (non-fatal):', ratingsError?.message ?? ratingsError);
      ratingRows = [];
    }
    const ratings = (ratingRows ?? []).map((r: any) => Number(r.rating)).filter((n) => Number.isFinite(n));
    const averageRating =
      ratings.length === 0 ? 0 : Math.round((ratings.reduce((acc, n) => acc + n, 0) / ratings.length) * 100) / 100;

    // Fetch active promotion for this group
    let activePromotion: any = null;
    try {
      // Class-level promotions only. Personal coupons (migration 231) carry a
      // user_id and belong to one attendee — surfacing one here would badge
      // the class with a discount every other viewer cannot actually get.
      // This runs on the service client, so RLS does not scope it.
      const { data: promos } = await service
        .from('group_promotions')
        .select('id, kind, discount, student_cap, duration_days, created_at')
        .eq('group_id', groupId)
        .eq('active', true)
        .is('user_id', null)
        .order('created_at', { ascending: false });

      const now = new Date();
      for (const promo of promos ?? []) {
        if (promo.kind === 'open-ended') { activePromotion = promo; break; }
        if (promo.kind === 'early-bird' && promo.student_cap && approvedMembers.length < promo.student_cap) { activePromotion = promo; break; }
        if (promo.kind === 'time-limited' && promo.duration_days) {
          const exp = new Date(promo.created_at);
          exp.setDate(exp.getDate() + promo.duration_days);
          if (now < exp) { activePromotion = promo; break; }
        }
      }
    } catch { /* non-fatal */ }

    let otherGroups: any[] = [];
    let otherGroupsResult = await service
      .from('groups')
      .select('id, name, subject, cover_image, created_at')
      .eq('tutor_id', group.tutor_id)
      .neq('id', groupId)
      .is('archived_at', null)
      .limit(6);
    if (isSchemaMismatch(otherGroupsResult.error)) {
      otherGroupsResult = await service
        .from('groups')
        .select('id, name, subject, cover_image, created_at')
        .eq('tutor_id', group.tutor_id)
        .neq('id', groupId)
        .is('archived_at', null)
        .limit(6);
    }
    if (!otherGroupsResult.error) {
      otherGroups = otherGroupsResult.data ?? [];
    }

    const keyInfo = {
      form_level: group.form_level ?? null,
      session_length_minutes: group.session_length_minutes ?? null,
      session_frequency: group.session_frequency ?? group.recurrence_type ?? null,
      members: approvedMembers.length,
      tutor_response_time: group.tutor?.response_time_minutes ?? null,
      pricing_mode: group.pricing_mode ?? group.pricing_model ?? 'FREE',
      price_per_session: group.price_per_session ?? null,
      price_per_course: group.price_per_course ?? null,
      availability_window: group.availability_window ?? null,
    };

    // ── The venue's street address is gated; its AREA is not ─────────────────
    //
    // `venue_visibility` defaults to 'after_enrolment' (migration 242), and this
    // endpoint is deliberately readable by anonymous visitors — so without this
    // the tier above would hand a tutor's street address, and often their home
    // address, to anyone who opens a class page or scrapes the API.
    //
    // The REGION always survives, because a location filter nobody can see does
    // not work: a family has to be able to tell that a class is in Arima before
    // deciding whether to enrol in it. What is stripped is the line that gets
    // someone to the door — address_line, access_instructions, arrival_notes.
    //
    // "Enrolled" is read from viewerMembership rather than recomputed, so this
    // cannot drift from what the page uses to decide whether to show a Join
    // button. A secured place counts: they have paid.
    // ── Per-seat availability ────────────────────────────────────────────────
    //
    // Computed server-side so every surface reads the same answer. The rule
    // (lib/utils/seatCapacity.ts) is that a class is NOT full until every seat
    // type it offers is full — so a hybrid class with a full room and free online
    // seats reports open online seats and a closed physical one, where the
    // class-level `member_count >= max_students` test that predates 242 would get
    // both directions wrong.
    //
    // Non-fatal: a failure here costs the seat breakdown, not the class page. The
    // existing member_count/max_students fields are untouched and still correct
    // for an online-only class, which is every class on production.
    let seats: Awaited<ReturnType<typeof seatState>> | null = null;
    try {
      seats = await seatState(service as any, groupId, group as any);
    } catch (seatErr: any) {
      console.warn('[GET /api/groups] seat state unavailable:', seatErr?.message);
    }

    const venueRaw = (group as any).venue ?? null;
    const venue = Array.isArray(venueRaw) ? (venueRaw[0] ?? null) : venueRaw;
    const maySeeAddress =
      (group as any).venue_visibility === 'public' ||
      viewerMembership.enrolled ||
      viewerMembership.secured ||
      // The tutor's own class. They wrote the address.
      (!!user && user.id === (group as any).tutor_id);

    const venueForViewer = venue
      ? {
          id: venue.id,
          name: venue.name,
          region: Array.isArray(venue.region) ? (venue.region[0] ?? null) : (venue.region ?? null),
          address_line: maySeeAddress ? (venue.address_line ?? null) : null,
          access_instructions: maySeeAddress ? (venue.access_instructions ?? null) : null,
          arrival_notes: maySeeAddress ? (venue.arrival_notes ?? null) : null,
          /** So the UI can say "address after you join" rather than nothing. */
          address_hidden: !maySeeAddress && Boolean(venue.address_line),
        }
      : null;

    return NextResponse.json({
      success: true,
      group: {
        ...group,
        group_members: undefined,
        venue: venueForViewer,
        /** Per seat type: capacity, enrolled, remaining, full, price. */
        seat_availability: seats?.availability ?? null,
        /** True only when every seat type the class offers is full. */
        seats_full: seats?.full ?? null,
        // Counts are public; who the students are is not. An anonymous viewer
        // gets neither the roster nor the preview avatars.
        members: isAnonymous ? [] : group.group_members,
        member_count: approvedMembers.length,
        member_previews: isAnonymous
          ? []
          : approvedMembers.slice(0, 3).map((m: any) => m.profile).filter(Boolean),
        current_user_membership: currentUserMembership,
        viewer_membership: viewerMembership,
        sessions,
        next_occurrence: nextOccurrence,
        upcoming_sessions: upcomingSessions,
        enrollment_count: approvedMembers.length,
        average_rating: averageRating,
        reviews,
        other_classes_by_tutor: otherGroups,
        key_info: keyInfo,
        active_promotion: activePromotion,
      },
      data: {
        group: {
          ...group,
          group_members: undefined,
          // Mirrors the block above — this legacy `data` shape is still read by
          // some callers, so it has to be stripped for anonymous viewers too.
          // That includes the venue: `...group` spreads the RAW joined row, so
          // omitting this line would hand the street address out through the
          // legacy shape while the modern one gated it.
          venue: venueForViewer,
          seat_availability: seats?.availability ?? null,
          seats_full: seats?.full ?? null,
          members: isAnonymous ? [] : group.group_members,
          member_count: approvedMembers.length,
          member_previews: isAnonymous
            ? []
            : approvedMembers.slice(0, 3).map((m: any) => m.profile).filter(Boolean),
          current_user_membership: currentUserMembership,
          viewer_membership: viewerMembership,
          sessions,
          next_occurrence: nextOccurrence,
          upcoming_sessions: upcomingSessions,
          enrollment_count: approvedMembers.length,
          active_promotion: activePromotion,
          average_rating: averageRating,
          reviews,
          other_classes_by_tutor: otherGroups,
          key_info: keyInfo,
        },
      },
    });
  } catch (err) {
    console.error('[GET /api/groups/[groupId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/groups/[groupId] — update group name/description
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();
    const actor = await resolveGroupActor({ groupId, userId: user.id, email: user.email });
    if (actor.notFound) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    if (!actor.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: UpdateGroupInput = await request.json();
    // `secure_spot_enabled` tells "opening preorders" apart from "resending the
    // flag unchanged". tutor_id, class_format and venue_id are read in the same
    // round trip for the in-person block below — it needs to know what the row
    // WILL be after a partial PATCH, and who owns the venue it may be given.
    const { data: currentGroup } = await service
      .from('groups')
      .select('secure_spot_enabled, tutor_id, class_format, venue_id')
      .eq('id', groupId)
      .maybeSingle();
    const updates: Record<string, any> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description;
    if ((body as any).visibility !== undefined) updates.visibility = (body as any).visibility;
    if ((body as any).primary_channel !== undefined) updates.primary_channel = (body as any).primary_channel;
    if ((body as any).member_service_fee !== undefined) updates.member_service_fee = (body as any).member_service_fee;
    if ((body as any).parent_feedback_price !== undefined) updates.parent_feedback_price = (body as any).parent_feedback_price;
    if (body.subject !== undefined) updates.subject = body.subject;
    if ((body as any).topic !== undefined) updates.topic = (body as any).topic;
    if (body.difficulty !== undefined) updates.difficulty = body.difficulty;
    if ((body as any).form_level !== undefined) updates.form_level = (body as any).form_level;
    if (body.goals !== undefined) updates.goals = body.goals;
    if ((body as any).session_length_minutes !== undefined) updates.session_length_minutes = (body as any).session_length_minutes;
    if ((body as any).session_frequency !== undefined) updates.session_frequency = (body as any).session_frequency;
    if (body.price_per_session !== undefined) updates.price_per_session = body.price_per_session;
    if ((body as any).price_per_course !== undefined) updates.price_per_course = (body as any).price_per_course;
    if (body.price_monthly !== undefined) updates.price_monthly = body.price_monthly;
    if (body.pricing_model !== undefined) updates.pricing_model = body.pricing_model;
    if ((body as any).pricing_mode !== undefined) updates.pricing_mode = (body as any).pricing_mode;
    if ((body as any).availability_window !== undefined) updates.availability_window = (body as any).availability_window;
    if ((body as any).whatsapp_url !== undefined) updates.whatsapp_url = (body as any).whatsapp_url;
    if ((body as any).whatsapp_link !== undefined) updates.whatsapp_url = (body as any).whatsapp_link;
    if ((body as any).google_classroom_link !== undefined) updates.google_classroom_link = (body as any).google_classroom_link;
    if ((body as any).meeting_link !== undefined) updates.meeting_link = (body as any).meeting_link;
    if ((body as any).require_join_requests !== undefined) updates.require_join_requests = (body as any).require_join_requests;
    if ((body as any).auto_suspend_missed_payment !== undefined) updates.auto_suspend_missed_payment = (body as any).auto_suspend_missed_payment;
    if ((body as any).grace_period_days !== undefined) updates.grace_period_days = (body as any).grace_period_days;
    if ((body as any).parent_feedback_mode !== undefined) updates.parent_feedback_mode = (body as any).parent_feedback_mode;
    if ((body as any).feedback_mode !== undefined) updates.parent_feedback_mode = (body as any).feedback_mode;
    if (body.recurrence_type !== undefined) updates.recurrence_type = body.recurrence_type;
    if (body.recurrence_rule !== undefined) updates.recurrence_rule = body.recurrence_rule;
    if (body.timezone !== undefined) updates.timezone = body.timezone;
    // Capacity is editable at any point in a class's life, including after it
    // has started — a tutor who wants to take more students should not have to
    // wait for a new term. The only floor is the seats already taken: dropping
    // the limit below that would leave enrolled students over the line, with no
    // rule for who gets removed.
    if (body.max_students !== undefined) {
      const wantedCapacity = Number(body.max_students);
      let taken: number;
      try {
        taken = await classOccupancy(service as any, groupId);
      } catch (occErr: any) {
        console.error('[PATCH /api/groups] occupancy lookup failed:', occErr?.message);
        return NextResponse.json({ error: 'Could not check how many students are enrolled. Please try again.' }, { status: 503 });
      }
      if (Number.isFinite(wantedCapacity) && wantedCapacity < taken) {
        return NextResponse.json(
          {
            error: `This class already has ${taken} student${taken === 1 ? '' : 's'}. Set the limit to ${taken} or more, or remove a student first.`,
            reason: 'below_current_enrolment',
            enrolled: taken,
          },
          { status: 400 }
        );
      }
      updates.max_students = body.max_students;
    }
    // ── In-person delivery (migration 242) ────────────────────────────────
    //
    // Validated here rather than left to the CHECK constraints, because those
    // were added NOT VALID and surface as a raw Postgres error the tutor cannot
    // act on. The rules, and why each one exists:
    //
    //   class_format ∈ online|physical|hybrid       — the enum
    //   a non-online class needs a venue             — groups_venue_required_check;
    //                                                  "somewhere in Arima" is not
    //                                                  an address a parent can use
    //   the venue must be THIS TUTOR'S               — not a DB constraint, and the
    //                                                  only thing stopping a tutor
    //                                                  pointing a class at someone
    //                                                  else's street address
    //   cash only when there is a room to hand it in — groups_cash_requires_venue
    //   caps and prices are non-negative             — the remaining CHECKs
    //
    // max_students is NOT set here: a trigger keeps it as the sum of the two
    // seat caps (sync_group_max_students), so writing both would let them
    // disagree.
    {
      const FORMATS = ['online', 'physical', 'hybrid'] as const;
      type Fmt = (typeof FORMATS)[number];

      const rawFormat = (body as any).class_format;
      const wantsFormat = rawFormat !== undefined;
      if (wantsFormat && !FORMATS.includes(rawFormat)) {
        return NextResponse.json({ error: 'Unknown class format.' }, { status: 400 });
      }

      const rawVenue = (body as any).venue_id;
      const wantsVenue = rawVenue !== undefined;

      // The effective format AFTER this PATCH, so the venue rule is checked
      // against what the row will be rather than what it was. A PATCH that only
      // sets a venue must still satisfy the rule for the format already stored.
      const effectiveFormat: Fmt = wantsFormat
        ? (rawFormat as Fmt)
        : (((currentGroup as any)?.class_format ?? 'online') as Fmt);

      const effectiveVenue = wantsVenue ? (rawVenue as string | null) : undefined;

      if (effectiveFormat !== 'online') {
        // Either the PATCH supplies a venue, or the row already has one.
        const venueId =
          effectiveVenue !== undefined
            ? effectiveVenue
            : ((currentGroup as any)?.venue_id ?? null);
        if (!venueId) {
          return NextResponse.json(
            { error: 'Choose a venue before setting this class to meet in person.' },
            { status: 400 }
          );
        }
      }

      // Ownership. RLS does not help here — this route writes with the service
      // client — so without this check a tutor could attach another tutor's
      // venue, and its street address, to their own class.
      if (effectiveVenue) {
        const { data: venue, error: venueErr } = await service
          .from('venues')
          .select('id, tutor_id, archived_at')
          .eq('id', effectiveVenue)
          .maybeSingle();
        if (venueErr) {
          console.error('[PATCH /api/groups] venue lookup failed:', venueErr.message);
          return NextResponse.json({ error: 'Could not check that venue.' }, { status: 503 });
        }
        const v = venue as { tutor_id?: string; archived_at?: string | null } | null;
        // Same answer for "not yours" and "does not exist", so this cannot be
        // used to probe for other tutors' venue ids.
        if (!v || v.tutor_id !== (currentGroup as any)?.tutor_id || v.archived_at) {
          return NextResponse.json({ error: 'That venue is not available.' }, { status: 400 });
        }
      }

      if (wantsFormat) updates.class_format = rawFormat;
      if (wantsVenue) updates.venue_id = rawVenue;

      if ((body as any).venue_visibility !== undefined) {
        const vis = (body as any).venue_visibility;
        if (vis !== 'public' && vis !== 'after_enrolment') {
          return NextResponse.json({ error: 'Unknown venue visibility.' }, { status: 400 });
        }
        updates.venue_visibility = vis;
      }

      // Nullable numerics: null means "no limit" for a cap and "same as the
      // class price" for a price, which is why an explicit null is passed
      // through rather than coerced to 0. Zero is a different answer — no seats
      // of that kind — and seatCapacity.ts depends on the distinction.
      for (const field of [
        'max_students_online',
        'max_students_physical',
        'price_online_ttd',
        'price_physical_ttd',
      ] as const) {
        if ((body as any)[field] === undefined) continue;
        const raw = (body as any)[field];
        if (raw === null || raw === '') {
          updates[field] = null;
          continue;
        }
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json(
            { error: 'Seat limits and prices cannot be negative.' },
            { status: 400 }
          );
        }
        updates[field] = field.startsWith('max_') ? Math.trunc(n) : n;
      }

      if ((body as any).accepts_cash !== undefined) {
        const cash = Boolean((body as any).accepts_cash);
        if (cash && effectiveFormat === 'online') {
          return NextResponse.json(
            { error: 'Cash can only be accepted for a class that meets in person.' },
            { status: 400 }
          );
        }
        updates.accepts_cash = cash;
      }
    }

    if (body.cover_image !== undefined) updates.cover_image = body.cover_image;
    if ((body as any).schedule_display !== undefined) updates.schedule_display = (body as any).schedule_display;
    if ((body as any).schedule_data !== undefined) updates.schedule_data = (body as any).schedule_data;
    // Preorders can only be opened on a class that has a confirmed schedule
    // with its first lesson still ahead. Checked here rather than trusted from
    // the client, because this is the flag that lets the class take money
    // before it has taught anything.
    if ((body as any).secure_spot_enabled !== undefined) {
      const wanted = (body as any).secure_spot_enabled === true;
      // Only re-check when preorders are actually being OPENED. The class
      // settings form resends every field on every save, so re-validating an
      // unchanged `true` made the whole request 400 with "already_started" once
      // the class began — blocking edits to capacity, price and everything else
      // on this endpoint for any class that had preorders left switched on.
      const alreadyOpen = currentGroup?.secure_spot_enabled === true;
      if (wanted && !alreadyOpen) {
        const allowed = await canOpenPreorders(service as any, groupId);
        if (!allowed.ok) {
          return NextResponse.json({ error: allowed.message, reason: allowed.reason }, { status: 400 });
        }
      }
      updates.secure_spot_enabled = wanted;
    }
    if (body.header_image !== undefined) updates.header_image = body.header_image;
    if (body.content_blocks !== undefined) updates.content_blocks = body.content_blocks;
    if (body.status !== undefined) updates.status = body.status;
    updates.updated_at = new Date().toISOString();

    let group: any = null;
    let error: any = null;
    const runUpdate = async (updatePayload: Record<string, any>) =>
      service
        .from('groups')
        .update(updatePayload)
        .eq('id', groupId)
        .select()
        .single();

    // Attempt 1: full payload (latest schema)
    ({ data: group, error } = await runUpdate(updates));

    // Attempt 2: remove updated_at for older schemas
    const { updated_at: _ignoredUpdatedAt, ...withoutUpdatedAt } = updates;
    if (error && isSchemaMismatch(error)) {
      ({ data: group, error } = await runUpdate(withoutUpdatedAt));
    }

    // Attempt 3: strip v2/group-marketplace metadata columns + newer settings columns when missing.
    // price_monthly, pricing_model, pricing_mode are intentionally kept — they must always be saved.
    const {
      topic: _ignoredTopic,
      form_level: _ignoredFormLevel,
      goals: _ignoredGoals,
      difficulty: _ignoredDifficulty,
      price_per_session: _ignoredPricePerSession,
      session_length_minutes: _ignoredSessionLength,
      session_frequency: _ignoredSessionFrequency,
      price_per_course: _ignoredPricePerCourse,
      availability_window: _ignoredAvailabilityWindow,
      header_image: _ignoredHeaderImage,
      whatsapp_url: _ignoredWhatsappUrl,
      recurrence_type: _ignoredRecurrenceType,
      recurrence_rule: _ignoredRecurrenceRule,
      timezone: _ignoredTimezone,
      max_students: _ignoredMaxStudents,
      content_blocks: _ignoredContentBlocks,
      status: _ignoredStatus,
      // migration 128
      require_join_requests: _ignoredRequireJoinRequests,
      auto_suspend_missed_payment: _ignoredAutoSuspend,
      grace_period_days: _ignoredGracePeriodDays,
      google_classroom_link: _ignoredGoogleClassroomLink,
      feedback_mode: _ignoredFeedbackMode,
      // migration 129
      bio: _ignoredBio,
      member_service_fee: _ignoredMemberServiceFee,
      visibility: _ignoredVisibility,
      primary_channel: _ignoredPrimaryChannel,
      parent_feedback_price: _ignoredParentFeedbackPrice,
      // migration 131
      meeting_link: _ignoredMeetingLink,
      ...legacyCompatibleUpdates
    } = withoutUpdatedAt;
    if (error && isSchemaMismatch(error)) {
      ({ data: group, error } = await runUpdate(legacyCompatibleUpdates));
    }

    // Attempt 4: very old schema used by current staging branch
    const {
      name: legacyName,
      description: legacyDescription,
      subject: legacySubject,
      cover_image: legacyCoverImage,
      whatsapp_url: legacyWhatsappUrl,
    } = withoutUpdatedAt;
    const oldestCompatibleUpdates: Record<string, any> = {};
    if (legacyName !== undefined) oldestCompatibleUpdates.name = legacyName;
    if (legacyDescription !== undefined) oldestCompatibleUpdates.description = legacyDescription;
    if (legacySubject !== undefined) oldestCompatibleUpdates.subject = legacySubject;
    if (legacyCoverImage !== undefined) oldestCompatibleUpdates.cover_image = legacyCoverImage;
    if (legacyWhatsappUrl !== undefined) oldestCompatibleUpdates.whatsapp_url = legacyWhatsappUrl;

    if (error && isSchemaMismatch(error)) {
      ({ data: group, error } = await runUpdate(oldestCompatibleUpdates));
    }

    if (error) throw error;

    if (body.recurrence_rule !== undefined || body.recurrence_type !== undefined || body.timezone !== undefined) {
      await generateUpcomingSessions(groupId, 60);
    }

    await auditAdminOverride(actor, 'class.update', { fields: Object.keys(updates).filter((k) => k !== 'updated_at') });

    return NextResponse.json({ group });
  } catch (err) {
    console.error('[PATCH /api/groups/[groupId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/groups/[groupId] — permanently delete group (tutor only)
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();
    const actor = await resolveGroupActor({ groupId, userId: user.id, email: user.email });
    if (actor.notFound) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    if (!actor.authorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Guard: cannot delete a group with active subscriptions
    const nowIso = new Date().toISOString();
    const { count: activeSubCount } = await service
      .from('group_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('enrollment_type', 'SUBSCRIPTION')
      .or(
        `status.in.(ACTIVE,GRACE,SUSPENDED),` +
        `and(status.eq.PENDING_PAYMENT,pending_payment_expires_at.gt.${nowIso})`
      );

    if ((activeSubCount ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Cannot delete a group with active subscriptions.', active_subscriptions: activeSubCount },
        { status: 409 }
      );
    }

    const deleteByEq = async (table: string, column: string, value: string) => {
      const { error } = await service.from(table).delete().eq(column, value);
      if (error && !isSchemaMismatch(error)) throw error;
    };
    const deleteByIn = async (table: string, column: string, values: string[]) => {
      if (values.length === 0) return;
      const { error } = await service.from(table).delete().in(column, values);
      if (error && !isSchemaMismatch(error)) throw error;
    };

    let sessionIds: string[] = [];
    const { data: sessions, error: sessionsError } = await service
      .from('group_sessions')
      .select('id')
      .eq('group_id', groupId);
    if (sessionsError && !isSchemaMismatch(sessionsError)) throw sessionsError;
    sessionIds = (sessions ?? []).map((s: any) => String(s.id));

    let streamPostIds: string[] = [];
    const { data: streamPosts, error: streamPostsError } = await service
      .from('stream_posts')
      .select('id')
      .eq('group_id', groupId);
    if (streamPostsError && !isSchemaMismatch(streamPostsError)) throw streamPostsError;
    streamPostIds = (streamPosts ?? []).map((p: any) => String(p.id));

    // Child records first to avoid FK violations across mixed schemas.
    await deleteByIn('group_attendance_records', 'session_id', sessionIds);
    await deleteByIn('group_session_occurrences', 'group_session_id', sessionIds);
    await deleteByEq('group_sessions', 'group_id', groupId);

    await deleteByEq('group_enrollments', 'group_id', groupId);
    await deleteByEq('group_waitlist_entries', 'group_id', groupId);
    await deleteByEq('group_reviews', 'group_id', groupId);
    await deleteByEq('group_announcements', 'group_id', groupId);
    await deleteByEq('group_messages', 'group_id', groupId);
    await deleteByEq('group_members', 'group_id', groupId);

    await deleteByIn('stream_attachments', 'post_id', streamPostIds);
    await deleteByIn('stream_replies', 'post_id', streamPostIds);
    await deleteByEq('stream_posts', 'group_id', groupId);

    await deleteByEq('notifications', 'group_id', groupId);

    const { error: deleteError } = await service
      .from('groups')
      .delete()
      .eq('id', groupId);

    if (deleteError) {
      if (String(deleteError.code) === '23503') {
        return NextResponse.json(
          { error: 'Unable to delete this group because dependent records still exist.' },
          { status: 409 }
        );
      }
      throw deleteError;
    }

    await auditAdminOverride(actor, 'class.delete');

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/groups/[groupId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
