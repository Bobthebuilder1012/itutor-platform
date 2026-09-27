// GET  /api/tutor/venues — this tutor's venues, plus the region list for pickers.
// POST /api/tutor/venues — create one.
//
// A venue is where a physical class meets. Migration 242 shipped the schema and
// nothing to write it with, so until this route existed a tutor could not create
// a physical class at all — `groups_venue_required_check` refuses a non-online
// class with no venue_id, which is the correct constraint and made the whole
// feature unreachable.
//
// ── WHY THE REGION IS A TABLE AND NOT FREE TEXT ─────────────────────────────
// Migration 242 explains it: the point of storing a location is the student-side
// filter, and four spellings of one town are four filter values — a failure
// nobody reports because the results still look plausible. So `region_id` is
// required and picked from a seeded list.
//
// ── WHY THIS USES THE CALLER'S CLIENT, NOT THE SERVICE CLIENT ───────────────
// `venues` has RLS: `tutor_id = auth.uid()` for ALL. A venue row carries a street
// address, so that policy is the enforcement, not a formality — reading and
// writing through the caller's own session means the database refuses another
// tutor's venue even if this route's own filter were ever wrong. The regions
// read is also fine on the caller's client: its policy is
// `FOR SELECT TO authenticated USING (active)`.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { isPhysicalClassesEnabled, PHYSICAL_CLASSES_DISABLED_MESSAGE } from '@/lib/featureFlags/physicalClasses';

export const dynamic = 'force-dynamic';

const VENUE_COLUMNS =
  'id, name, region_id, address_line, access_instructions, arrival_notes, capacity, archived_at, created_at';

/** Field caps. This is tutor-supplied text that students will read. */
const LIMITS = {
  name: 120,
  address_line: 300,
  access_instructions: 1000,
  arrival_notes: 1000,
} as const;

function trimTo(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

/** The venue's own room capacity — the tutor's note to self, not a seat cap. */
function capacityOf(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  return t > 0 ? t : null;
}

async function requireTutor() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) } as const;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if ((profile as { role?: string } | null)?.role !== 'tutor') {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) } as const;
  }

  return { supabase, userId: user.id } as const;
}

export async function GET() {
  const auth = await requireTutor();
  if ('error' in auth) return auth.error;
  const { supabase, userId } = auth;

  // Archived venues are excluded rather than deleted: a venue may still be
  // referenced by a past class's occurrences, and hard-deleting one would
  // orphan the record of where a lesson actually happened.
  const { data: venues, error: venuesError } = await supabase
    .from('venues')
    .select(VENUE_COLUMNS)
    .eq('tutor_id', userId)
    .is('archived_at', null)
    .order('created_at', { ascending: true });

  if (venuesError) {
    // 242 unapplied on this environment. Reported as an empty list with a flag
    // rather than a 500, so the tab renders an explanation instead of an error.
    console.warn('[tutor/venues] read failed:', venuesError.message);
    return NextResponse.json({ venues: [], regions: [], unavailable: true });
  }

  const { data: regions, error: regionsError } = await supabase
    .from('regions')
    .select('id, name, country_code')
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (regionsError) {
    console.warn('[tutor/venues] regions read failed:', regionsError.message);
  }

  return NextResponse.json({
    venues: venues ?? [],
    regions: regions ?? [],
    unavailable: false,
  });
}

export async function POST(req: NextRequest) {
  // Reading venues stays open so an existing physical class can still show
  // where it meets; only CREATING a new one is closed.
  if (!isPhysicalClassesEnabled()) {
    return NextResponse.json({ error: PHYSICAL_CLASSES_DISABLED_MESSAGE }, { status: 400 });
  }
  const auth = await requireTutor();
  if ('error' in auth) return auth.error;
  const { supabase, userId } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const name = trimTo(body.name, LIMITS.name);
  if (!name) return NextResponse.json({ error: 'invalid_field', field: 'name' }, { status: 400 });

  const regionId = typeof body.region_id === 'string' ? body.region_id : null;
  if (!regionId) {
    return NextResponse.json({ error: 'invalid_field', field: 'region_id' }, { status: 400 });
  }

  // ADDRESS REQUIRED AT CREATION, even though the column is nullable.
  // The column is nullable so a venue can exist before its address is known;
  // but a physical class whose page says "somewhere in Arima" is not something
  // a parent can act on, and `venue_visibility` already controls WHO sees it.
  const addressLine = trimTo(body.address_line, LIMITS.address_line);
  if (!addressLine) {
    return NextResponse.json({ error: 'invalid_field', field: 'address_line' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('venues')
    .insert({
      // From the session, never the body — the RLS WITH CHECK would refuse a
      // mismatch anyway, but sending it from the body invites someone to try.
      tutor_id: userId,
      name,
      region_id: regionId,
      address_line: addressLine,
      access_instructions: trimTo(body.access_instructions, LIMITS.access_instructions),
      arrival_notes: trimTo(body.arrival_notes, LIMITS.arrival_notes),
      capacity: capacityOf(body.capacity),
    })
    .select(VENUE_COLUMNS)
    .single();

  if (error) {
    // 23503 is a foreign-key violation, which here means an unknown region_id —
    // a bad request rather than a server fault.
    if (String(error.code) === '23503') {
      return NextResponse.json({ error: 'invalid_field', field: 'region_id' }, { status: 400 });
    }
    console.error('[tutor/venues] create failed:', error.message);
    return NextResponse.json({ error: 'could_not_save' }, { status: 500 });
  }

  return NextResponse.json({ venue: data }, { status: 201 });
}
