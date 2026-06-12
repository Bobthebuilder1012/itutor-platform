import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import type { CreateGroupInput } from '@/lib/types/groups';
import { z } from 'zod';

function isSchemaMismatch(error: any) {
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? '').toLowerCase();
  return (
    code === '42703' ||
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    code === 'PGRST201' ||
    message.includes('does not exist') ||
    message.includes('could not find') ||
    message.includes('more than one relationship') ||
    message.includes('could not embed')
  );
}

// GET /api/groups — list all non-archived groups with tutor info and member previews
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const querySchema = z.object({
      subject: z.string().optional(),
      formLevel: z.string().optional(),
      difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).optional(),
      recurrenceType: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'NONE']).optional(),
      sessionFrequency: z.string().optional(),
      availability: z.enum(['today', 'this_week', 'this_month']).optional(),
      minRating: z.coerce.number().min(0).max(5).optional(),
      minPrice: z.coerce.number().optional(),
      maxPrice: z.coerce.number().optional(),
      search: z.string().optional(),
      sortBy: z.enum(['latest', 'rating', 'members', 'price', 'nextSession']).default('latest'),
      sortDir: z.enum(['asc', 'desc']).default('desc'),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(200).default(12),
      tutor_name: z.string().optional(),
      tutor_id: z.string().uuid().optional(),
      archived: z.enum(['true', 'false']).optional(),
    });
    const parsed = querySchema.safeParse(
      Object.fromEntries([...searchParams.entries()].filter(([, v]) => v !== ''))
    );
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid query parameters' }, { status: 400 });
    }
    const {
      subject,
      formLevel,
      difficulty,
      recurrenceType,
      sessionFrequency,
      availability,
      minRating,
      minPrice,
      maxPrice,
      search,
      sortBy,
      sortDir,
      page,
      limit,
      tutor_name: tutorName,
      tutor_id: filterTutorId,
      archived: archivedParam,
    } = parsed.data;

    const fetchArchived = archivedParam === 'true';

    const service = getServiceClient();

    const { data: profile } = await service
      .from('profiles')
      .select('role, is_dev_account')
      .eq('id', user.id)
      .maybeSingle();

    const isTutor = profile?.role === 'tutor';
    const viewerIsDev = profile?.is_dev_account === true;

    // Collect dev tutor IDs so their groups can be hidden from non-dev viewers
    let devTutorIds: string[] = [];
    if (!viewerIsDev) {
      const { data: devProfiles } = await service
        .from('profiles')
        .select('id')
        .eq('is_dev_account', true);
      devTutorIds = (devProfiles ?? []).map((p: { id: string }) => p.id);
    }

    const SELECT_TIERS = [
      // Tier 1: full column set (requires migrations 128-132)
      `id, name, description, tutor_id, subject, pricing, pricing_model, price_per_session, price_monthly, created_at,
       visibility, primary_channel, whatsapp_url, whatsapp_link, google_classroom_link,
       max_students, parent_feedback_mode, parent_feedback_price,
       price_per_session, price_monthly, price_per_course, member_service_fee,
       require_join_requests, auto_suspend_missed_payment, grace_period_days,
       archived_at, archived_reason, cover_image, form_level, session_length_minutes, schedule_display, schedule_data,
       estimated_earnings,
       tutor:profiles!groups_tutor_id_fkey(id, full_name, avatar_url, rating_average, rating_count),
       group_members(id, user_id, status)`,
      // Tier 2: drop columns likely missing (parent_feedback_mode → feedback_mode, no archived_reason/whatsapp_url)
      `id, name, description, tutor_id, subject, pricing, pricing_model, price_per_session, price_monthly, created_at,
       visibility, primary_channel, google_classroom_link,
       max_students, parent_feedback_price,
       price_per_session, price_monthly, price_per_course, member_service_fee,
       require_join_requests, auto_suspend_missed_payment, grace_period_days,
       archived_at, schedule_display, estimated_earnings,
       tutor:profiles!groups_tutor_id_fkey(id, full_name, avatar_url, rating_average, rating_count),
       group_members(id, user_id, status)`,
      // Tier 3: drop rating columns from profiles (may live on tutor_profiles instead)
      `id, name, description, tutor_id, subject, pricing, pricing_model, price_per_session, price_monthly, created_at,
       visibility, max_students, require_join_requests, grace_period_days, archived_at,
       price_per_session, price_monthly, schedule_display, estimated_earnings,
       tutor:profiles!groups_tutor_id_fkey(id, full_name, avatar_url),
       group_members(id, user_id, status)`,
      // Tier 4: bare minimum
      `id, name, description, tutor_id, subject, pricing, pricing_model, price_per_session, price_monthly, created_at, archived_at, estimated_earnings,
       tutor:profiles!groups_tutor_id_fkey(id, full_name, avatar_url),
       group_members(id, user_id, status)`,
    ];

    const buildBaseQuery = (selectStr: string, useVisibilityFilter = true) => {
      let q = service.from('groups').select(selectStr).order('created_at', { ascending: false });
      if (fetchArchived) {
        q = q.not('archived_at', 'is', null).eq('tutor_id', user.id);
      } else {
        q = q.is('archived_at', null);
        if (useVisibilityFilter) {
          if (isTutor) {
            // Tutors see their own classes plus any non-private group
            q = q.or(`tutor_id.eq.${user.id},visibility.neq.private,visibility.is.null`);
          } else {
            // Students see anything that isn't explicitly private
            q = q.or('visibility.neq.private,visibility.is.null');
          }
        }
      }
      // Hide groups owned by dev accounts from non-dev viewers
      if (devTutorIds.length > 0) {
        q = q.not('tutor_id', 'in', `(${devTutorIds.join(',')})`);
      }
      return q;
    };

    const applyFilters = (query: any) => {
      let q = query;
      if (filterTutorId) q = q.eq('tutor_id', filterTutorId);
      if (subject) q = q.ilike('subject', `%${subject}%`);
      if (search) q = q.or(`name.ilike.%${search}%,subject.ilike.%${search}%`);
      return q;
    };

    const QUERY_ATTEMPTS: Array<[string, boolean]> = [
      ...SELECT_TIERS.map((t): [string, boolean] => [t, true]),
      [SELECT_TIERS[SELECT_TIERS.length - 1], false], // last resort: no visibility filter
    ];

    let groups: any[] | null = null;
    let error: any = null;
    for (const [tier, useVis] of QUERY_ATTEMPTS) {
      ({ data: groups, error } = await applyFilters(buildBaseQuery(tier, useVis)));
      if (!error) break;
      if (!isSchemaMismatch(error)) break;
      console.warn('[GET /api/groups] schema mismatch, trying next tier:', error.message);
    }
    if (error) throw error;

    const groupRows = groups ?? [];
    const groupIds = groupRows.map((g: any) => g.id);

    // Preload session occurrences to compute next session per group card
    let nextOccurrenceByGroupId = new Map<string, any>();
    if (groupIds.length > 0) {
      const { data: sessionsRaw } = await service
        .from('group_sessions')
        .select(`
          group_id,
          group_session_occurrences(id, group_session_id, scheduled_start_at, scheduled_end_at, status, cancelled_at, cancellation_note)
        `)
        .in('group_id', groupIds);

      const now = new Date();
      const occurrencesByGroup = new Map<string, any[]>();
      for (const s of sessionsRaw ?? []) {
        const key = s.group_id as string;
        const current = occurrencesByGroup.get(key) ?? [];
        current.push(...((s as any).group_session_occurrences ?? []));
        occurrencesByGroup.set(key, current);
      }

      for (const [groupId, occurrences] of occurrencesByGroup.entries()) {
        const nextOccurrence =
          occurrences
            .filter((o: any) => o.status === 'upcoming' && new Date(o.scheduled_start_at) > now)
            .sort(
              (a: any, b: any) =>
                new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime()
            )[0] ?? null;

        nextOccurrenceByGroupId.set(groupId, nextOccurrence);
      }
    }

    // Attach current user membership, member previews, and next occurrence
    let enriched = groupRows.map((g: any) => {
      const approvedMembers = (g.group_members ?? []).filter((m: any) => m.status === 'approved' || m.status === 'active');
      const currentUserMembership = (g.group_members ?? []).find((m: any) => m.user_id === user.id) ?? null;

      return {
        ...g,
        group_members: undefined,
        member_count: approvedMembers.length,
        member_previews: [],
        current_user_membership: currentUserMembership,
        next_occurrence: nextOccurrenceByGroupId.get(g.id) ?? null,
      };
    });

    // No profile-completeness gate for group classes — visibility (public/private) and
    // archived_at are the sole gating mechanisms. Tutor profile quality checks apply to
    // the 1:1 tutor search (/api/tutors/listed-ids), not here.

    if (availability) {
      const now = new Date();
      const end = new Date(now);
      if (availability === 'today') end.setHours(23, 59, 59, 999);
      if (availability === 'this_week') end.setDate(now.getDate() + 7);
      if (availability === 'this_month') end.setMonth(now.getMonth() + 1);
      enriched = enriched.filter((g: any) => {
        const next = g.next_occurrence?.scheduled_start_at;
        if (!next) return false;
        const d = new Date(next);
        return d >= now && d <= end;
      });
    }

    if (minRating !== undefined) {
      enriched = enriched.filter((g: any) => Number(g.tutor?.rating_average ?? 0) >= minRating);
    }

    // Filter by tutor name client-side (simple search)
    let filtered = tutorName
      ? enriched.filter((g: any) =>
          g.tutor?.full_name?.toLowerCase().includes(tutorName.toLowerCase())
        )
      : enriched;

    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(
        (g: any) =>
          g.name?.toLowerCase().includes(s) ||
          g.subject?.toLowerCase().includes(s) ||
          g.tutor?.full_name?.toLowerCase().includes(s)
      );
    }

    const sorted = [...filtered].sort((a: any, b: any) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortBy === 'rating') return (Number(a.tutor?.rating_average ?? 0) - Number(b.tutor?.rating_average ?? 0)) * dir;
      if (sortBy === 'members') return (Number(a.member_count ?? 0) - Number(b.member_count ?? 0)) * dir;
      if (sortBy === 'price') {
        const aPrice = Number(a.price_per_session ?? a.price_per_course ?? 0);
        const bPrice = Number(b.price_per_session ?? b.price_per_course ?? 0);
        return (aPrice - bPrice) * dir;
      }
      if (sortBy === 'nextSession') {
        const aTs = a.next_occurrence ? new Date(a.next_occurrence.scheduled_start_at).getTime() : Number.MAX_SAFE_INTEGER;
        const bTs = b.next_occurrence ? new Date(b.next_occurrence.scheduled_start_at).getTime() : Number.MAX_SAFE_INTEGER;
        return (aTs - bTs) * dir;
      }
      return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
    });

    const total = sorted.length;
    const from = (page - 1) * limit;
    const paginated = sorted.slice(from, from + limit).map((g: any) => ({
      ...g,
      title: g.name,
      pricingModel: g.pricing_model ?? 'FREE',
      maxStudents: g.max_students,
      enrollmentCount: g.member_count,
      nextSession: g.next_occurrence ? { scheduledAt: g.next_occurrence.scheduled_start_at } : null,
      estimated_earnings: g.estimated_earnings ?? 0,
    }));

    // Attach active promotions to paginated groups
    const paginatedGroupIds = paginated.map((g: any) => g.id);
    const promotionsByGroupId = new Map<string, any>();
    if (paginatedGroupIds.length > 0) {
      try {
        const { data: promos } = await service
          .from('group_promotions')
          .select('id, group_id, kind, discount, student_cap, duration_days, created_at')
          .in('group_id', paginatedGroupIds)
          .eq('active', true)
          .order('created_at', { ascending: false });
        const now = new Date();
        for (const promo of promos ?? []) {
          if (promotionsByGroupId.has(promo.group_id)) continue;
          const enrollmentCount = paginated.find((g: any) => g.id === promo.group_id)?.member_count ?? 0;
          let valid = false;
          if (promo.kind === 'open-ended') valid = true;
          else if (promo.kind === 'early-bird' && promo.student_cap && enrollmentCount < promo.student_cap) valid = true;
          else if (promo.kind === 'time-limited' && promo.duration_days) {
            const exp = new Date(promo.created_at);
            exp.setDate(exp.getDate() + promo.duration_days);
            if (now < exp) valid = true;
          }
          if (valid) promotionsByGroupId.set(promo.group_id, promo);
        }
      } catch { /* non-fatal */ }
    }
    // Batch-count upcoming sessions per group
    const sessionCountByGroupId = new Map<string, number>();
    if (paginatedGroupIds.length > 0) {
      try {
        const now = new Date().toISOString();
        const { data: sessionRows } = await service
          .from('group_session_occurrences')
          .select('group_id')
          .in('group_id', paginatedGroupIds)
          .gte('scheduled_start_at', now)
          .neq('status', 'cancelled');
        for (const row of sessionRows ?? []) {
          sessionCountByGroupId.set(row.group_id, (sessionCountByGroupId.get(row.group_id) ?? 0) + 1);
        }
      } catch { /* non-fatal — session count stays 0 */ }
    }

    const paginatedWithPromos = paginated.map((g: any) => ({
      ...g,
      active_promotion: promotionsByGroupId.get(g.id) ?? null,
      session_count: sessionCountByGroupId.get(g.id) ?? 0,
    }));

    return NextResponse.json({
      success: true,
      data: {
        groups: paginatedWithPromos,
        total,
        page,
        limit,
      },
      groups: paginatedWithPromos,
      total,
    });
  } catch (err) {
    console.error('[GET /api/groups]', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/groups — create a group (tutor only)
export async function POST(request: NextRequest) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();
    const { data: profile } = await service
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'tutor') {
      return NextResponse.json({ error: 'Only tutors can create groups' }, { status: 403 });
    }

    const rawBody = await request.json();
    // Normalise camelCase fields the creation form sends alongside snake_case ones
    const body: CreateGroupInput & Record<string, any> = {
      ...rawBody,
      max_students: rawBody.max_students ?? rawBody.maxStudents ?? undefined,
      price_per_session: rawBody.price_per_session ?? rawBody.pricePerSession ?? undefined,
      price_monthly: rawBody.price_monthly ?? rawBody.priceMonthly ?? undefined,
      form_level: rawBody.form_level ?? rawBody.formLevel ?? undefined,
      pricing_model: rawBody.pricing_model ?? rawBody.billingModel ?? undefined,
    };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
    }

    // Store multiple subjects as a comma-separated string
    const subjectString =
      body.subjects && body.subjects.length > 0
        ? body.subjects.join(', ')
        : (body.subject?.trim() || null);

    // Resolve visibility: form may send isPublic (boolean legacy) or visibility (string)
    const resolvedVisibility: string | null =
      rawBody.visibility ?? (rawBody.isPublic === true ? 'public' : rawBody.isPublic === false ? 'unlisted' : null);

    let { data: group, error } = await service
      .from('groups')
      .insert({
        name: body.name.trim(),
        description: body.description?.trim() ?? null,
        topic: body.topic?.trim() ?? null,
        subject: subjectString,
        form_level: body.form_level ?? null,
        session_length_minutes: body.session_length_minutes ?? null,
        session_frequency: body.session_frequency ?? null,
        tutor_id: user.id,
        pricing: 'free',
        pricing_mode: body.pricing_mode ?? body.pricing_model ?? 'FREE',
        pricing_model: body.pricing_model ?? (
          (body.price_monthly ?? body.price_per_session ?? body.price_per_course) ? 'MONTHLY' : 'FREE'
        ),
        price_per_session: body.price_per_session ?? null,
        price_monthly: body.price_monthly ?? null,
        price_per_course: body.price_per_course ?? null,
        member_service_fee: body.member_service_fee ?? 0,
        max_students: body.max_students ?? null,
        availability_window: body.availability_window ?? null,
        cover_image: body.cover_image ?? null,
        header_image: body.header_image ?? null,
        ...(resolvedVisibility ? { visibility: resolvedVisibility } : {}),
      })
      .select()
      .single();

    if (isSchemaMismatch(error)) {
      ({ data: group, error } = await service
        .from('groups')
        .insert({
          name: body.name.trim(),
          description: body.description?.trim() ?? null,
          topic: body.topic?.trim() ?? null,
          subject: subjectString,
          form_level: body.form_level ?? null,
          session_length_minutes: body.session_length_minutes ?? null,
          session_frequency: body.session_frequency ?? null,
          tutor_id: user.id,
          pricing: 'free',
          pricing_mode: body.pricing_mode ?? body.pricing_model ?? 'FREE',
          pricing_model: body.pricing_model ?? (
            (body.price_monthly ?? body.price_per_session ?? body.price_per_course) ? 'MONTHLY' : 'FREE'
          ),
          price_per_session: body.price_per_session ?? null,
          price_monthly: body.price_monthly ?? null,
          price_per_course: body.price_per_course ?? null,
          member_service_fee: body.member_service_fee ?? 0,
          availability_window: body.availability_window ?? null,
          cover_image: body.cover_image ?? null,
        })
        .select()
        .single());
    }

    if (isSchemaMismatch(error)) {
      ({ data: group, error } = await service
        .from('groups')
        .insert({
          name: body.name.trim(),
          description: body.description?.trim() ?? null,
          subject: subjectString,
          tutor_id: user.id,
          pricing: 'free',
        })
        .select()
        .single());
    }

    if (isSchemaMismatch(error)) {
      ({ data: group, error } = await service
        .from('groups')
        .insert({
          name: body.name.trim(),
          description: body.description?.trim() ?? null,
          subject: subjectString,
          tutor_id: user.id,
        })
        .select()
        .single());
    }

    if (error) throw error;

    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/groups]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
