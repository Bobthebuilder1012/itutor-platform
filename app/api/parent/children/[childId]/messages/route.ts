// GET /api/parent/children/[childId]/messages — the read-only thread (§9.4, §10.8).
//
// Migration 225 already grants the parent a direct RLS read. This route exists so
// the boundaries are enforced in one auditable place rather than depending on a
// policy the caller might bypass with a service client elsewhere, and so the
// response can carry the disclosure metadata the UI must show.
//
// THE THREE BOUNDARIES, RE-ASSERTED HERE
//   tutor threads only        a parent cannot read their child's peer DMs
//   from the link date only   anything older stays private, permanently
//   read only                 there is no POST on this route, by design
//
// It also returns `childKnows: true` unconditionally — not as data, as a
// reminder. The parent's view must state that the child can see they have access
// (§9.4), and a UI that forgets to say it turns open oversight into covert
// monitoring.

import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext, requireParentChild } from '@/lib/server/parentAccess';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ childId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const { childId } = await params;
    await requireParentChild(parentProfile.id, childId);

    // The link date is the scope floor. Read it here rather than trusting the
    // policy, because this route uses the service client.
    const { data: link } = await admin
      .from('parent_child_links')
      .select('created_at')
      .eq('parent_id', parentProfile.id)
      .eq('child_id', childId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const linkedAt = (link as { created_at: string } | null)?.created_at;
    // No link date means no floor, and no floor must mean nothing rather than
    // everything — a missing bound cannot become an absent filter.
    if (!linkedAt) return NextResponse.json({ threads: [], childKnows: true, since: null });

    const { data: convos } = await admin
      .from('conversations')
      .select('id, participant_1_id, participant_2_id, created_at')
      .or(`participant_1_id.eq.${childId},participant_2_id.eq.${childId}`)
      .limit(50);

    const rows = (convos ?? []) as unknown as Array<{
      id: string;
      participant_1_id: string;
      participant_2_id: string;
    }>;

    if (rows.length === 0) {
      return NextResponse.json({ threads: [], childKnows: true, since: linkedAt });
    }

    // Counterparties, so tutor-only can be enforced.
    const otherIds = rows.map((c) =>
      c.participant_1_id === childId ? c.participant_2_id : c.participant_1_id
    );

    const { data: others } = await admin
      .from('profiles')
      .select('id, full_name, display_name, avatar_url, role')
      .in('id', Array.from(new Set(otherIds)));

    const otherById = new Map(
      ((others ?? []) as unknown as Array<{
        id: string;
        full_name: string | null;
        display_name: string | null;
        avatar_url: string | null;
        role: string | null;
      }>).map((p) => [p.id, p])
    );

    // Boundary 1. The justification for reading a minor's messages is oversight
    // of the adult teaching them; it does not extend to their peers.
    const tutorConvos = rows.filter((c) => {
      const otherId = c.participant_1_id === childId ? c.participant_2_id : c.participant_1_id;
      return otherById.get(otherId)?.role === 'tutor';
    });

    if (tutorConvos.length === 0) {
      return NextResponse.json({ threads: [], childKnows: true, since: linkedAt });
    }

    const { data: messages } = await admin
      .from('messages')
      .select('id, conversation_id, sender_id, content, created_at')
      .in(
        'conversation_id',
        tutorConvos.map((c) => c.id)
      )
      // Boundary 2.
      .gte('created_at', linkedAt)
      .order('created_at', { ascending: true })
      .limit(500);

    const msgRows = (messages ?? []) as unknown as Array<{
      id: string;
      conversation_id: string;
      sender_id: string;
      content: string;
      created_at: string;
    }>;

    const byConvo = new Map<string, typeof msgRows>();
    for (const m of msgRows) {
      const list = byConvo.get(m.conversation_id) ?? [];
      list.push(m);
      byConvo.set(m.conversation_id, list);
    }

    const threads = tutorConvos.map((c) => {
      const otherId = c.participant_1_id === childId ? c.participant_2_id : c.participant_1_id;
      const other = otherById.get(otherId);
      const list = byConvo.get(c.id) ?? [];
      return {
        id: c.id,
        tutorName: other?.display_name || other?.full_name || 'Tutor',
        tutorAvatar: other?.avatar_url ?? null,
        messages: list.map((m) => ({
          id: m.id,
          fromChild: m.sender_id === childId,
          text: m.content,
          at: new Date(m.created_at).toLocaleString('en-TT', {
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/Port_of_Spain',
          }),
        })),
      };
    });

    return NextResponse.json({
      threads,
      // Boundary 3 is structural: this route has no POST.
      readOnly: true,
      // §9.4 — the parent is told the child knows.
      childKnows: true,
      since: linkedAt,
    });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[GET /api/parent/children/[childId]/messages]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
