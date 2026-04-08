import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import type { UpdateGroupInput } from '@/lib/types/groups';
import { generateUpcomingSessions } from '@/lib/recurrence';

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
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();
    const groupSelects = [
      `
        id, name, description, tutor_id, subject, pricing, created_at, archived_at,
        difficulty, goals, price_per_session, price_monthly, pricing_model, recurrence_type, recurrence_rule,
        form_level, topic, session_length_minutes, session_frequency, price_per_course, pricing_mode, availability_window, media_gallery,
        timezone, max_students, cover_image, header_image, content_blocks, status, updated_at, whatsapp_link,
        tutor:profiles!groups_tutor_id_fkey(id, full_name, avatar_url, response_time_minutes),
        group_members(id, user_id, status, profile:profiles(id, full_name, avatar_url))
      `,
      `
        id, name, description, tutor_id, subject, pricing, created_at, archived_at,
        form_level, topic, session_length_minutes, session_frequency, price_per_course, pricing_mode, availability_window,
        cover_image, header_image, whatsapp_link,
        tutor:profiles!groups_tutor_id_fkey(id, full_name, avatar_url),
        group_members(id, user_id, status, profile:profiles(id, full_name, avatar_url))
      `,
      `
        id, name, description, tutor_id, subject, pricing, created_at,
        cover_image, header_image, whatsapp_link,
        tutor:profiles!groups_tutor_id_fkey(id, full_name, avatar_url),
        group_members(id, user_id, status, profile:profiles(id, full_name, avatar_url))
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

    const approvedMembers = (group.group_members ?? []).filter((m: any) => m.status === 'approved');
    const currentUserMembership = (group.group_members ?? []).find((m: any) => m.user_id === user.id) ?? null;

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

    let otherGroups: any[] = [];
    const { data: otherGroupsRaw, error: otherGroupsError } = await service
      .from('groups')
      .select('id, name, subject, cover_image, created_at')
      .eq('tutor_id', group.tutor_id)
      .neq('id', groupId)
      .is('archived_at', null)
      .limit(6);
    if (!otherGroupsError) {
      otherGroups = otherGroupsRaw ?? [];
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

    return NextResponse.json({
      success: true,
      group: {
        ...group,
        group_members: undefined,
        members: group.group_members,
        member_count: approvedMembers.length,
        member_previews: approvedMembers.slice(0, 3).map((m: any) => m.profile).filter(Boolean),
        current_user_membership: currentUserMembership,
        sessions,
        next_occurrence: nextOccurrence,
        upcoming_sessions: upcomingSessions,
        enrollment_count: approvedMembers.length,
        average_rating: averageRating,
        reviews,
        other_classes_by_tutor: otherGroups,
        key_info: keyInfo,
      },
      data: {
        group: {
          ...group,
          group_members: undefined,
          members: group.group_members,
          member_count: approvedMembers.length,
          member_previews: approvedMembers.slice(0, 3).map((m: any) => m.profile).filter(Boolean),
          current_user_membership: currentUserMembership,
          sessions,
          next_occurrence: nextOccurrence,
          upcoming_sessions: upcomingSessions,
          enrollment_count: approvedMembers.length,
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
    const { data: existing } = await service
      .from('groups')
      .select('tutor_id')
      .eq('id', groupId)
      .single();

    if (!existing || existing.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: UpdateGroupInput = await request.json();
    const updates: Record<string, any> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description;
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
    if ((body as any).whatsapp_link !== undefined) updates.whatsapp_link = (body as any).whatsapp_link;
    if (body.recurrence_type !== undefined) updates.recurrence_type = body.recurrence_type;
    if (body.recurrence_rule !== undefined) updates.recurrence_rule = body.recurrence_rule;
    if (body.timezone !== undefined) updates.timezone = body.timezone;
    if (body.max_students !== undefined) updates.max_students = body.max_students;
    if (body.cover_image !== undefined) updates.cover_image = body.cover_image;
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

    // Attempt 3: strip v2/group-marketplace metadata columns when missing
    const {
      topic: _ignoredTopic,
      form_level: _ignoredFormLevel,
      goals: _ignoredGoals,
      difficulty: _ignoredDifficulty,
      price_per_session: _ignoredPricePerSession,
      price_monthly: _ignoredPriceMonthly,
      pricing_model: _ignoredPricingModel,
      session_length_minutes: _ignoredSessionLength,
      session_frequency: _ignoredSessionFrequency,
      price_per_course: _ignoredPricePerCourse,
      pricing_mode: _ignoredPricingMode,
      availability_window: _ignoredAvailabilityWindow,
      header_image: _ignoredHeaderImage,
      whatsapp_link: _ignoredWhatsappLink,
      recurrence_type: _ignoredRecurrenceType,
      recurrence_rule: _ignoredRecurrenceRule,
      timezone: _ignoredTimezone,
      max_students: _ignoredMaxStudents,
      content_blocks: _ignoredContentBlocks,
      status: _ignoredStatus,
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
      whatsapp_link: legacyWhatsappLink,
    } = withoutUpdatedAt;
    const oldestCompatibleUpdates: Record<string, any> = {};
    if (legacyName !== undefined) oldestCompatibleUpdates.name = legacyName;
    if (legacyDescription !== undefined) oldestCompatibleUpdates.description = legacyDescription;
    if (legacySubject !== undefined) oldestCompatibleUpdates.subject = legacySubject;
    if (legacyCoverImage !== undefined) oldestCompatibleUpdates.cover_image = legacyCoverImage;
    if (legacyWhatsappLink !== undefined) oldestCompatibleUpdates.whatsapp_link = legacyWhatsappLink;

    if (error && isSchemaMismatch(error)) {
      ({ data: group, error } = await runUpdate(oldestCompatibleUpdates));
    }

    if (error) throw error;

    if (body.recurrence_rule !== undefined || body.recurrence_type !== undefined || body.timezone !== undefined) {
      await generateUpcomingSessions(groupId, 60);
    }

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
    const { data: existing, error: existingError } = await service
      .from('groups')
      .select('id, tutor_id')
      .eq('id', groupId)
      .single();

    if (existingError?.code === 'PGRST116' || !existing) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    if (existingError) throw existingError;
    if (existing.tutor_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/groups/[groupId]]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
