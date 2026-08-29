// PATCH  /api/tutor/venues/[venueId] — edit one.
// DELETE /api/tutor/venues/[venueId] — archive one.
//
// Authorisation is RLS, not this file's filters. `venues` carries
// `tutor_id = auth.uid()` FOR ALL, so both handlers use the CALLER'S client:
// another tutor's venue is refused by the database rather than by remembering to
// add `.eq('tutor_id', …)`. The explicit filter is still written, as the second
// of two locks on a row that holds a street address.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ venueId: string }> };

const VENUE_COLUMNS =
  'id, name, region_id, address_line, access_instructions, arrival_notes, capacity, archived_at, created_at';

const LIMITS = {
  name: 120,
  address_line: 300,
  access_instructions: 1000,
  arrival_notes: 1000,
} as const;

function trimTo(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

async function requireTutor() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) } as const;
  }
  return { supabase, userId: user.id } as const;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { venueId } = await params;
  const auth = await requireTutor();
  if ('error' in auth) return auth.error;
  const { supabase, userId } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // Built key by key so an omitted field is left alone rather than nulled. A
  // PATCH that silently blanked the access instructions because the client sent
  // a partial body is the kind of bug a tutor discovers from a student who could
  // not find the door.
  const patch: Record<string, unknown> = {};

  if ('name' in body) {
    const name = trimTo(body.name, LIMITS.name);
    if (!name) return NextResponse.json({ error: 'invalid_field', field: 'name' }, { status: 400 });
    patch.name = name;
  }
  if ('region_id' in body) {
    if (typeof body.region_id !== 'string' || !body.region_id) {
      return NextResponse.json({ error: 'invalid_field', field: 'region_id' }, { status: 400 });
    }
    patch.region_id = body.region_id;
  }
  if ('address_line' in body) {
    const addr = trimTo(body.address_line, LIMITS.address_line);
    if (!addr) {
      return NextResponse.json({ error: 'invalid_field', field: 'address_line' }, { status: 400 });
    }
    patch.address_line = addr;
  }
  // These two ARE nullable on purpose: clearing them is a legitimate edit, so an
  // explicitly-sent empty string means "remove", not "reject".
  if ('access_instructions' in body) {
    patch.access_instructions = trimTo(body.access_instructions, LIMITS.access_instructions);
  }
  if ('arrival_notes' in body) {
    patch.arrival_notes = trimTo(body.arrival_notes, LIMITS.arrival_notes);
  }
  if ('capacity' in body) {
    const raw = body.capacity;
    if (raw === null || raw === '' || raw === undefined) {
      patch.capacity = null;
    } else {
      const n = Math.trunc(Number(raw));
      // The column has CHECK (capacity IS NULL OR capacity > 0), so 0 would be a
      // constraint violation reported as a 500. Caught here as a bad request.
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json({ error: 'invalid_field', field: 'capacity' }, { status: 400 });
      }
      patch.capacity = n;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 });
  }

  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('venues')
    .update(patch)
    .eq('id', venueId)
    .eq('tutor_id', userId)
    .select(VENUE_COLUMNS)
    .maybeSingle();

  if (error) {
    if (String(error.code) === '23503') {
      return NextResponse.json({ error: 'invalid_field', field: 'region_id' }, { status: 400 });
    }
    console.error('[tutor/venues] update failed:', error.message);
    return NextResponse.json({ error: 'could_not_save' }, { status: 500 });
  }
  // No row means it is not theirs or does not exist. Deliberately the same
  // answer for both, so this cannot be used to discover another tutor's venue
  // ids.
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ venue: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { venueId } = await params;
  const auth = await requireTutor();
  if ('error' in auth) return auth.error;
  const { supabase, userId } = auth;

  // ARCHIVED, NOT DELETED, and not only out of caution: a venue is referenced by
  // `groups.venue_id` and by `group_session_occurrences.venue_id`, so a hard
  // delete would either be refused by the foreign key or orphan the record of
  // where a lesson actually took place. Archiving keeps the history and removes
  // it from every picker.
  //
  // Refused while a live class still points at it. `groups_venue_required_check`
  // means a physical class with no venue is an invalid row, so archiving one out
  // from under a class would leave a class that cannot be edited without also
  // changing its format — a corner the tutor should be told about now rather
  // than discover later.
  const { data: usedBy, error: usedByError } = await supabase
    .from('groups')
    .select('id, name')
    .eq('venue_id', venueId)
    .is('archived_at', null)
    .limit(5);

  if (usedByError) {
    console.error('[tutor/venues] usage check failed:', usedByError.message);
    return NextResponse.json({ error: 'could_not_save' }, { status: 500 });
  }

  if ((usedBy ?? []).length > 0) {
    return NextResponse.json(
      {
        error: 'venue_in_use',
        classes: (usedBy as Array<{ id: string; name: string | null }>).map(g => ({
          id: g.id,
          name: g.name ?? 'Untitled class',
        })),
      },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from('venues')
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', venueId)
    .eq('tutor_id', userId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[tutor/venues] archive failed:', error.message);
    return NextResponse.json({ error: 'could_not_save' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ archived: true });
}
