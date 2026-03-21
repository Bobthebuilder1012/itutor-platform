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
    message.includes('does not exist') ||
    message.includes('could not find')
  );
}

// GET /api/groups — list all non-archived groups with tutor info and member previews
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
      limit: z.coerce.number().min(1).max(50).default(12),
      tutor_name: z.string().optional(),
    });
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
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
    } = parsed.data;

    const service = getServiceClient();

    const { data: profile } = await service
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const isTutor = profile?.role === 'tutor';

    const runGroupsQuery = async (withStatus: boolean, legacySchema: boolean, includeHeaderImage: boolean = true) => {
      let query = service
        .from('groups')
        .select(`
          id, name, description, tutor_id, subject, pricing, created_at, ${withStatus ? 'status,' : ''}${legacySchema ? '' : 'difficulty, form_level, topic, session_length_minutes, session_frequency,'}
          ${
            legacySchema
              ? ''
              : `pricing_model, pricing_mode, price_per_session, price_per_course, price_monthly, recurrence_type, max_students, cover_image, ${includeHeaderImage ? 'header_image, ' : ''}availability_window,`
          }
          tutor:profiles!groups_tutor_id_fkey(id, full_name, avatar_url, rating_average, rating_count),
          group_members(id, user_id, status, profile:profiles(id, full_name, avatar_url))
        `)
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      if (withStatus) {
        if (isTutor) query = query.or(`status.eq.PUBLISHED,tutor_id.eq.${user.id}`);
        else query = query.or('status.eq.PUBLISHED,status.eq.published,status.is.null');
      }

      return query;
    };

    const applyFilters = (query: any, legacySchema: boolean) => {
      let q = query;
      if (subject) q = q.ilike('subject', `%${subject}%`);
      if (!legacySchema) {
        if (formLevel) q = q.eq('form_level', formLevel);
        if (difficulty) q = q.eq('difficulty', difficulty);
        if (recurrenceType) q = q.eq('recurrence_type', recurrenceType);
        if (sessionFrequency) q = q.ilike('session_frequency', `%${sessionFrequency}%`);
        if (minPrice !== undefined) q = q.gte('price_per_session', minPrice);
        if (maxPrice !== undefined) q = q.lte('price_per_session', maxPrice);
      }
      if (search) q = q.or(`name.ilike.%${search}%,subject.ilike.%${search}%`);
      return q;
    };

    let groups: any[] | null = null;
    let error: any = null;
    ({ data: groups, error } = await applyFilters(await runGroupsQuery(true, false, true), false));
    if (isSchemaMismatch(error)) {
      ({ data: groups, error } = await applyFilters(await runGroupsQuery(true, false, false), false));
      if (isSchemaMismatch(error)) {
        ({ data: groups, error } = await applyFilters(await runGroupsQuery(false, true, false), true));
      }
    } else if (!error && !isTutor && (groups?.length ?? 0) === 0) {
      // Legacy datasets can have status values that don't match modern publish enums.
      ({ data: groups, error } = await applyFilters(await runGroupsQuery(false, false, true), false));
      if (isSchemaMismatch(error)) {
        ({ data: groups, error } = await applyFilters(await runGroupsQuery(false, false, false), false));
        if (isSchemaMismatch(error)) {
          ({ data: groups, error } = await applyFilters(await runGroupsQuery(false, true, false), true));
        }
      }
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
      const approvedMembers = (g.group_members ?? []).filter((m: any) => m.status === 'approved');
      const currentUserMembership = (g.group_members ?? []).find((m: any) => m.user_id === user.id) ?? null;

      return {
        ...g,
        group_members: undefined,
        member_count: approvedMembers.length,
        member_previews: approvedMembers.slice(0, 3).map((m: any) => m.profile),
        current_user_membership: currentUserMembership,
        next_occurrence: nextOccurrenceByGroupId.get(g.id) ?? null,
      };
    });

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
      ...(function () {
        const perSession = Number(g.price_per_session ?? 0);
        const perCourse = Number(g.price_per_course ?? 0);
        const enrolled = Number(g.member_count ?? 0);
        const estimatedEarnings =
          perSession > 0 ? perSession * enrolled : perCourse > 0 ? perCourse * enrolled : 0;
        return { estimated_earnings: estimatedEarnings };
      })(),
      ...g,
      title: g.name,
      topic: g.topic ?? null,
      formLevel: g.form_level ?? null,
      sessionLengthMinutes: g.session_length_minutes ?? null,
      sessionFrequency: g.session_frequency ?? g.recurrence_type ?? null,
      pricingModel: g.pricing_model ?? 'FREE',
      pricingMode: g.pricing_mode ?? g.pricing_model ?? 'FREE',
      pricePerSession: g.price_per_session,
      pricePerCourse: g.price_per_course ?? null,
      priceMonthly: g.price_monthly,
      recurrenceType: g.recurrence_type,
      availabilityWindow: g.availability_window ?? null,
      maxStudents: g.max_students,
      coverImage: g.cover_image,
      headerImage: g.header_image ?? null,
      enrollmentCount: g.member_count,
      nextSession: g.next_occurrence ? { scheduledAt: g.next_occurrence.scheduled_start_at } : null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        groups: paginated,
        total,
        page,
        limit,
      },
      groups: paginated,
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

    const body: CreateGroupInput = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
    }

    // Store multiple subjects as a comma-separated string
    const subjectString =
      body.subjects && body.subjects.length > 0
        ? body.subjects.join(', ')
        : null;

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
        pricing_model: body.pricing_model ?? 'FREE',
        price_per_session: body.price_per_session ?? null,
        price_per_course: body.price_per_course ?? null,
        availability_window: body.availability_window ?? null,
        cover_image: body.cover_image ?? null,
        header_image: body.header_image ?? null,
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
          pricing_model: body.pricing_model ?? 'FREE',
          price_per_session: body.price_per_session ?? null,
          price_per_course: body.price_per_course ?? null,
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

    if (error) throw error;

    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/groups]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
