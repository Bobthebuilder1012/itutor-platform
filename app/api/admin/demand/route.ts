// GET /api/admin/demand?days=30 — the demand map.
//
// Answers WHICH TEACHER SHOULD WE RECRUIT NEXT, and WHO DO WE TELL WHEN THEY
// ARRIVE. Every Finder run writes a demand_signals row, served or not; this
// reads the ledger and hands it to buildDemandMap (lib/finder/demandMap.ts),
// which does all of the ranking. This file only fetches.
//
// The notify list carries names and email addresses, which is why it is
// assembled here behind requireAdmin with the service client and never cached.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import {
  buildDemandMap,
  type ContactInfo,
  type DemandSignalRow,
} from '@/lib/finder/demandMap';

export const dynamic = 'force-dynamic';

/** Rows read per request. The ledger is small; this is a runaway guard. */
const MAX_ROWS = 5000;

/**
 * Widest first. subject_text / notify_email / notify_requested_at arrive in
 * migration 265, delivery_pref and notify_count in 243. A missing column fails
 * the whole select, and the page must still render one migration behind —
 * which is precisely the environment someone would be looking at it on.
 */
const SELECT_TIERS = [
  `id, user_id, subject_id, subject_text, level, availability_blocks, budget_max, delivery_pref,
   match_class, notify_optin, notify_email, notify_requested_at, notified_at,
   resolved_at, resolved_by, created_at, subject:subjects(name),
   request:finder_requests(role, child_label, urgency, lesson_type)`,
  `id, user_id, subject_id, level, availability_blocks, budget_max, delivery_pref,
   match_class, notify_optin, notified_at, resolved_at, resolved_by, created_at,
   subject:subjects(name), request:finder_requests(role, child_label, urgency, lesson_type)`,
  `id, user_id, subject_id, level, availability_blocks, budget_max,
   match_class, notify_optin, resolved_at, created_at, subject:subjects(name)`,
];

function isSchemaMismatch(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null;
  const code = String(err?.code ?? '');
  const message = String(err?.message ?? '').toLowerCase();
  return (
    code === '42703' ||
    code === '42P01' ||
    code === 'PGRST200' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find')
  );
}

export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const service = getServiceClient();

  // Optional window. Anything that is not a positive whole number is "all time".
  const daysParam = Number(req.nextUrl.searchParams.get('days'));
  const since =
    Number.isInteger(daysParam) && daysParam > 0
      ? new Date(Date.now() - daysParam * 24 * 60 * 60 * 1000).toISOString()
      : null;

  let rows: DemandSignalRow[] | null = null;
  for (const columns of SELECT_TIERS) {
    let query = service
      .from('demand_signals')
      .select(columns)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);
    if (since) query = query.gte('created_at', since);
    const { data, error } = await query;

    if (!error) {
      rows = (data ?? []) as unknown as DemandSignalRow[];
      break;
    }
    if (!isSchemaMismatch(error)) {
      console.error('[admin/demand] read failed:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (rows === null) {
    // Most likely migration 240 is not applied on this environment.
    return NextResponse.json({ unavailable: true }, { status: 200 });
  }

  // Names for everyone with an account: the Recruit cards list who asked, and
  // the notify list needs addresses. Chunked so a long id list stays well
  // under PostgREST's URL length limit.
  const accountUsers = Array.from(
    new Set(rows.filter(r => r.user_id).map(r => r.user_id as string))
  );
  const contacts = new Map<string, ContactInfo>();
  for (let i = 0; i < accountUsers.length; i += 150) {
    const { data, error } = await service
      .from('profiles')
      .select('id, full_name, email, role')
      .in('id', accountUsers.slice(i, i + 150));
    if (error) console.error('[admin/demand] contact read failed:', error.message);
    for (const p of (data ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
      role: string | null;
    }>) {
      contacts.set(p.id, { name: p.full_name, email: p.email, role: p.role });
    }
  }

  // Names of the classes that closed a signal, for "resolved by" on the list.
  const classIds = Array.from(
    new Set(rows.filter(r => r.notify_optin && r.resolved_by).map(r => r.resolved_by as string))
  );
  const classNames = new Map<string, string>();
  if (classIds.length > 0) {
    const { data } = await service.from('groups').select('id, name').in('id', classIds);
    for (const g of (data ?? []) as Array<{ id: string; name: string | null }>) {
      if (g.name) classNames.set(g.id, g.name);
    }
  }

  const map = buildDemandMap(rows, contacts, classNames, rows.length >= MAX_ROWS);
  return NextResponse.json(
    { ...map, unavailable: false, days: since ? daysParam : null },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
