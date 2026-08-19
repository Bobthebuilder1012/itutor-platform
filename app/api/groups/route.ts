import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import type { CreateGroupInput } from '@/lib/types/groups';
import {
  resolveScheduleEntries,
  scheduleMatchesDayTime,
  type ScheduleEntry,
  type TimeBand,
} from '@/lib/utils/scheduleFormat';
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
      // Recurring day-of-week filter: comma-separated indices, 0=Sunday.
      days: z
        .string()
        .optional()
        .transform((v) =>
          (v ?? '')
            .split(',')
            .map((s) => Number(s.trim()))
            .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
        ),
      // Time-of-day bands: comma-separated morning|afternoon|evening.
      timeOfDay: z
        .string()
        .optional()
        .transform((v) =>
          (v ?? '')
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter((s): s is TimeBand => s === 'morning' || s === 'afternoon' || s === 'evening')
        ),
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
      days: filterDays,
      timeOfDay: filterBands,
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
       tutor:profiles!groups_tutor_id_fkey(id, full_name, avatar_url, rating_average, rating_count, profile_banner_url),
       group_members(id, user_id, status)`,
      // Tier 2: drop columns likely missing (parent_feedback_mode → feedback_mode, no archived_reason/whatsapp_url)
      `id, name, description, tutor_id, subject, pricing, pricing_model, price_per_session, price_monthly, created_at,
       visibility, primary_channel, google_classroom_link,
       max_students, parent_feedback_price,
       price_per_session, price_monthly, price_per_course, member_service_fee,
       require_join_requests, auto_suspend_missed_payment, grace_period_days,
       archived_at, schedule_display, estimated_earnings,
       tutor:profiles!groups_tutor_id_fkey(id, full_name, avatar_url, rating_average, rating_count, profile_banner_url),
       group_members(id, user_id, status)`,
      // Tier 3: drop rating columns from profiles (may live on tutor_profiles instead)
      `id, name, description, tutor_id, subject, pricing, pricing_model, price_per_session, price_monthly, created_at,
       visibility, max_students, require_join_requests, grace_period_days, archived_at,
       price_per_session, price_monthly, schedule_display, estimated_earnings,
       tutor:profiles!groups_tutor_id_fkey(id, full_name, avatar_url),
       group_members(id, user_id, status)`,
      // Tier 4: bare minimum
      `id, name, description, tutor_id, subject, pricing, pricing_model, price_per_session, price_monthly, created_at, archived_at, estimated_earnings, max_students,
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

    // Preload the recurring schedule per group: powers the card's "Recurring
    // every Monday and Wednesday · 5:00–7:00 PM AST" line and the day/time
    // filters below. Manual schedule_data (authored by the tutor) wins over the
    // pattern derived from group_sessions.
    const scheduleEntriesByGroupId = new Map<string, ScheduleEntry[]>();
    if (groupIds.length > 0) {
      // No recurrence_type filter: classes scheduled as individual dates (no
      // recurrence rule) still have a real weekly pattern in their occurrences,
      // and resolveScheduleEntries falls back to those.
      const { data: recurrenceRows, error: recurrenceError } = await service
        .from('group_sessions')
        .select(
          'group_id, start_time, recurrence_type, recurrence_days, duration_minutes, ' +
            'group_session_occurrences(scheduled_start_at, scheduled_end_at, cancelled_at, status)'
        )
        .in('group_id', groupIds)
        .order('created_at', { ascending: true });

      if (recurrenceError && !isSchemaMismatch(recurrenceError)) {
        console.warn('[GET /api/groups] recurring schedule load failed (non-fatal):', recurrenceError.message);
      }

      const rulesByGroup = new Map<string, any[]>();
      const occurrencesByGroup = new Map<string, any[]>();
      for (const row of recurrenceRows ?? []) {
        const key = String((row as any).group_id);
        rulesByGroup.set(key, [...(rulesByGroup.get(key) ?? []), row]);
        occurrencesByGroup.set(key, [
          ...(occurrencesByGroup.get(key) ?? []),
          ...(((row as any).group_session_occurrences as any[]) ?? []),
        ]);
      }

      for (const g of groupRows) {
        const key = String(g.id);
        const entries = resolveScheduleEntries({
          scheduleData: (g as any).schedule_data ?? null,
          sessionRows: rulesByGroup.get(key) ?? [],
          occurrences: occurrencesByGroup.get(key) ?? [],
        });
        if (entries.length > 0) scheduleEntriesByGroupId.set(key, entries);
      }
    }

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
        schedule_entries: scheduleEntriesByGroupId.get(String(g.id)) ?? [],
      };
    });

    // Day-of-week / time-of-day filter. Lives here rather than in the `groups`
    // where-clause because the data is on group_sessions, not groups.
    if (filterDays.length > 0 || filterBands.length > 0) {
      enriched = enriched.filter((g: any) => scheduleMatchesDayTime(g.schedule_entries, filterDays, filterBands));
    }

    // No profile-completeness gate for group classes — visibility (public/private),
    // archived_at and the schedule requirement below are the gating mechanisms. Tutor
    // profile quality checks apply to the 1:1 tutor search (/api/tutors/listed-ids).

    /**
     * A CLASS WITH NO SCHEDULE IS NOT LISTED.
     *
     * `schedule_entries` is the same resolved pattern every card and class page
     * renders (`resolveScheduleEntries`: manual `schedule_data`, then a
     * `group_sessions` recurrence rule, then two or more dated occurrences). If it
     * resolves to nothing, the marketplace cannot tell a customer when the class
     * meets — so the listing is an invitation to enrol in something with no
     * stated time, which is the one thing a recurring class has to state.
     *
     * Gating on the RESOLVED pattern rather than on `group_sessions.recurrence_days`
     * is deliberate: a tutor who typed their days into `schedule_data` has
     * answered the question, even with no recurrence row behind it.
     *
     * THE OWNING TUTOR ALWAYS SEES THEIR OWN, and the exemption is PER ROW, not
     * per request. It cannot be keyed on `tutor_id=<self>` being passed, because
     * the tutor's own lessons home (components/groups/tutor/TutorLessonsHome)
     * fetches this endpoint with no tutor_id at all and filters by owner on the
     * client — a request-level exemption would strip their unscheduled classes
     * before that filter ran, hiding from a tutor the very classes they need to
     * open in order to fix. Per row also keeps the gate correct for the public
     * profile card (components/tutor/public/ClassesSection), which passes someone
     * else's tutor_id: a student browsing it still gets the gate.
     *
     * This removes real supply — 18 of 38 published classes on production at the
     * time of writing. That is the point: those 18 are already broken for paying
     * customers, and most of them are why Class Match Week's ineligible list exists.
     */
    if (!fetchArchived) {
      enriched = enriched.filter(
        (g: any) => (g.schedule_entries ?? []).length > 0 || g.tutor_id === user.id
      );
    }

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

    // Default ("latest") order is the class marketplace ranking (mig 215):
    // classes an admin pinned by hand, then classes whose TUTOR is pinned
    // (mig 190's behaviour, kept so existing tutor pins still carry their
    // classes), then the class ranking score, then newest. Explicit user sorts
    // (rating/members/price/nextSession) are unaffected. Skipped if the
    // ranking view isn't present yet.
    type ClassRank = { pin: number | null; tutorPin: number | null; score: number };
    const rankMap = new Map<string, ClassRank>();
    if (sortBy === 'latest') {
      const rankGroupIds = filtered.map((g: any) => g.id).filter(Boolean);
      if (rankGroupIds.length > 0) {
        const { data: rankRows, error: rankErr } = await service
          .from('group_marketplace_rankings')
          .select('group_id, pin_rank, tutor_pin_rank, ranking_score')
          .in('group_id', rankGroupIds);
        if (!rankErr && rankRows) {
          rankRows.forEach((r: any) =>
            rankMap.set(r.group_id, {
              pin: r.pin_rank ?? null,
              tutorPin: r.tutor_pin_rank ?? null,
              score: Number(r.ranking_score ?? 0),
            })
          );
        }
      }
    }

    // Unpinned always sorts after pinned; two pins compare by position.
    const byPin = (a: number | null, b: number | null): number | null => {
      if (a == null && b == null) return null;
      if (a == null) return 1;
      if (b == null) return -1;
      return a === b ? null : a - b;
    };

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
      // Default 'latest': marketplace ranking when available, else newest first.
      if (rankMap.size > 0) {
        const empty: ClassRank = { pin: null, tutorPin: null, score: 0 };
        const ra = rankMap.get(a.id) ?? empty;
        const rb = rankMap.get(b.id) ?? empty;
        const classPin = byPin(ra.pin, rb.pin);
        if (classPin !== null) return classPin;
        const tutorPin = byPin(ra.tutorPin, rb.tutorPin);
        if (tutorPin !== null) return tutorPin;
        if (rb.score !== ra.score) return rb.score - ra.score;
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
        // Class-level promotions only — a personal coupon (migration 231)
        // belongs to one attendee and must not badge the class in a listing.
        // Service client, so RLS does not scope this.
        const { data: promos } = await service
          .from('group_promotions')
          .select('id, group_id, kind, discount, student_cap, duration_days, created_at')
          .in('group_id', paginatedGroupIds)
          .eq('active', true)
          .is('user_id', null)
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
        const nowIso = new Date().toISOString();
        const { data: sessionRows } = await service
          .from('group_sessions')
          .select('group_id, group_session_occurrences(id, scheduled_start_at, status)')
          .in('group_id', paginatedGroupIds);
        for (const row of sessionRows ?? []) {
          const upcoming = ((row.group_session_occurrences as any[]) ?? []).filter(
            (o: any) => o.status !== 'cancelled' && o.scheduled_start_at > nowIso
          ).length;
          sessionCountByGroupId.set(row.group_id, (sessionCountByGroupId.get(row.group_id) ?? 0) + upcoming);
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
      end_date: rawBody.end_date ?? rawBody.endDate ?? undefined,
    };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
    }

    // Every NEW class must carry an end date — "ongoing / no end date" is not
    // an allowed class type. Billing stops after this date, so a class without
    // one would recur indefinitely. Existing classes predating this rule are
    // handled by the tutor backfill flow, which is why the column is nullable.
    const endDateRaw = (body as any).end_date;
    if (!endDateRaw) {
      return NextResponse.json(
        { error: 'An end date is required. Classes must have a date they finish.' },
        { status: 400 }
      );
    }
    const endDate = new Date(`${String(endDateRaw).slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(endDate.getTime())) {
      return NextResponse.json({ error: 'End date is not a valid date' }, { status: 400 });
    }
    // Compare on the date, not the instant, so "today" isn't rejected for
    // being a few hours in the past.
    const todayUtc = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    if (endDate.getTime() < todayUtc.getTime()) {
      return NextResponse.json(
        { error: 'End date cannot be in the past' },
        { status: 400 }
      );
    }
    const MAX_CLASS_YEARS = 2;
    const maxEnd = new Date(todayUtc);
    maxEnd.setUTCFullYear(maxEnd.getUTCFullYear() + MAX_CLASS_YEARS);
    if (endDate.getTime() > maxEnd.getTime()) {
      return NextResponse.json(
        { error: `End date cannot be more than ${MAX_CLASS_YEARS} years away` },
        { status: 400 }
      );
    }
    const endDateValue = endDate.toISOString().slice(0, 10);

    // Store multiple subjects as a comma-separated string
    const subjectString =
      body.subjects && body.subjects.length > 0
        ? body.subjects.join(', ')
        : (body.subject?.trim() || null);

    // Resolve visibility: form may send isPublic (boolean legacy) or visibility (string)
    const resolvedVisibility: string | null =
      rawBody.visibility ?? (rawBody.isPublic === true ? 'public' : rawBody.isPublic === false ? 'unlisted' : null);

    /**
     * DRAFT or PUBLISHED. `groups.status` is NOT NULL DEFAULT 'PUBLISHED', and no
     * insert here used to set it — so this endpoint could only ever publish, and
     * the creation form's "Save as draft" button had nothing to call. It navigated
     * away instead, discarding everything typed.
     *
     * Anything other than an explicit 'DRAFT' stays PUBLISHED, so every existing
     * caller keeps its behaviour.
     *
     * SET ON EVERY FALLBACK TIER BELOW, not just the primary. The comment on
     * end_date in those tiers is the cautionary tale: it lived on the primary
     * insert alone, the primary always failed on production because of a column
     * that does not exist there, and classes were created without it. A draft
     * that silently published would be the same bug with worse consequences.
     */
    const resolvedStatus = rawBody.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED';

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
        // On every tier — see resolvedStatus above.
        status: resolvedStatus,
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
        end_date: endDateValue,
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
          // On every tier — see resolvedStatus above.
          status: resolvedStatus,
          // end_date is VALIDATED AS REQUIRED above, so it has to survive every
          // rung of this fallback chain. It was on the primary insert only, and
          // header_image — which the primary also carries — does not exist on
          // production, so the primary always failed there and the class was
          // created with end_date NULL. EndDateGate then demanded it on the next
          // screen, which is why tutors were asked for the same date twice.
          end_date: endDateValue,
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
          // On every tier — see resolvedStatus above.
          status: resolvedStatus,
          // end_date is VALIDATED AS REQUIRED above, so it has to survive every
          // rung of this fallback chain. It was on the primary insert only, and
          // header_image — which the primary also carries — does not exist on
          // production, so the primary always failed there and the class was
          // created with end_date NULL. EndDateGate then demanded it on the next
          // screen, which is why tutors were asked for the same date twice.
          end_date: endDateValue,
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
          // On every tier — see resolvedStatus above.
          status: resolvedStatus,
          // end_date is VALIDATED AS REQUIRED above, so it has to survive every
          // rung of this fallback chain. It was on the primary insert only, and
          // header_image — which the primary also carries — does not exist on
          // production, so the primary always failed there and the class was
          // created with end_date NULL. EndDateGate then demanded it on the next
          // screen, which is why tutors were asked for the same date twice.
          end_date: endDateValue,
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
