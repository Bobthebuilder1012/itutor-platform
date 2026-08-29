// GET /api/messages/parent-visibility — is a parent reading this student's threads?
//
// Backs the §9.4 disclosure. Deliberately a server answer rather than a prop the
// messaging UI passes in: a linked parent must never be able to become invisible
// because some caller forgot to thread a flag through. If the link exists, this
// says so.
//
// Returns only what the notice needs — whether a parent is linked, their name,
// and the date the access starts. No parent id, because the student's messaging
// surface has no reason to hold one.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const server = await getServerClient();
    const {
      data: { user },
    } = await server.auth.getUser();
    if (!user) return NextResponse.json({ linked: false, parentName: null, since: null });

    const admin = getServiceClient();

    const { data: link } = await admin
      .from('parent_child_links')
      .select('parent_id, created_at')
      .eq('child_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const row = link as { parent_id: string; created_at: string } | null;
    if (!row) return NextResponse.json({ linked: false, parentName: null, since: null });

    const { data: parent } = await admin
      .from('profiles')
      .select('full_name, display_name')
      .eq('id', row.parent_id)
      .maybeSingle();

    const p = parent as { full_name: string | null; display_name: string | null } | null;

    return NextResponse.json({
      linked: true,
      parentName: p?.display_name || p?.full_name || null,
      // The scope boundary, stated. §10.8 keeps anything older private, and a
      // student who assumes otherwise self-censors about the wrong period.
      since: new Date(row.created_at).toLocaleDateString('en-TT', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'America/Port_of_Spain',
      }),
    });
  } catch (err) {
    console.error('[GET /api/messages/parent-visibility]', err);
    return NextResponse.json({ linked: false, parentName: null, since: null });
  }
}
