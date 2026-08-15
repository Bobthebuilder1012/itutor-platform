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

    // Every teacher the child is CONNECTED to, not only those they have messaged.
    // The parent's view is "who teaches my child", so a tutor with no messages
    // still gets a card — otherwise the tutor a parent most wants to look up (a
    // new one) is the one missing, and the absence reads as a loading failure.
    const { data: mems } = await admin
      .from('group_members')
      .select('group_id')
      .eq('user_id', childId);
    const groupIds = [
      ...new Set(((mems ?? []) as Array<{ group_id: string | null }>).map((m) => m.group_id).filter(Boolean)),
    ] as string[];
    const { data: groupRows } = groupIds.length
      ? await admin.from('groups').select('tutor_id').in('id', groupIds)
      : { data: [] as Array<{ tutor_id: string | null }> };
    const { data: bookingRows } = await admin
      .from('bookings')
      .select('tutor_id')
      .eq('student_id', childId)
      .limit(200);

    const connectedTutorIds = new Set<string>();
    for (const g of (groupRows ?? []) as Array<{ tutor_id: string | null }>) {
      if (g.tutor_id) connectedTutorIds.add(g.tutor_id);
    }
    for (const b of (bookingRows ?? []) as Array<{ tutor_id: string | null }>) {
      if (b.tutor_id) connectedTutorIds.add(b.tutor_id);
    }

    // Counterparties, so tutor-only can be enforced.
    const otherIds = rows.map((c) =>
      c.participant_1_id === childId ? c.participant_2_id : c.participant_1_id
    );

    const lookupIds = Array.from(new Set([...otherIds, ...connectedTutorIds]));
    if (lookupIds.length === 0) {
      return NextResponse.json({ threads: [], childKnows: true, since: linkedAt });
    }

    const { data: others } = await admin
      .from('profiles')
      .select('id, full_name, display_name, avatar_url, role')
      .in('id', lookupIds);

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

    const { data: messages } = tutorConvos.length
      ? await admin
          .from('messages')
          .select('id, conversation_id, sender_id, content, created_at')
          .in(
            'conversation_id',
            tutorConvos.map((c) => c.id)
          )
          // Boundary 2.
          .gte('created_at', linkedAt)
          .order('created_at', { ascending: true })
          .limit(500)
      : { data: [] as unknown[] };

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

    // Keyed by TEACHER, not by conversation: one card per teacher is the unit the
    // parent thinks in, and a teacher may legitimately have no thread yet.
    const convoByTutor = new Map<string, string>();
    for (const c of tutorConvos) {
      const otherId = c.participant_1_id === childId ? c.participant_2_id : c.participant_1_id;
      convoByTutor.set(otherId, c.id);
    }
    for (const id of connectedTutorIds) {
      if (otherById.get(id)?.role === 'tutor' && !convoByTutor.has(id)) convoByTutor.set(id, '');
    }

    const threads = Array.from(convoByTutor.entries()).map(([tutorId, convoId]) => {
      const other = otherById.get(tutorId);
      const list = convoId ? byConvo.get(convoId) ?? [] : [];
      return {
        // No thread yet still needs a stable key for the UI to open on.
        id: convoId || `tutor:${tutorId}`,
        // The teacher themself, so callers that act on the tutor rather than the
        // thread (requesting feedback) do not have to parse it back out of `id`.
        tutorId,
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

    // Teachers with something to read first, then alphabetically — a parent
    // opening this is usually looking for a conversation, not an empty card.
    threads.sort((a, b) => {
      if ((a.messages.length > 0) !== (b.messages.length > 0)) return a.messages.length > 0 ? -1 : 1;
      return a.tutorName.localeCompare(b.tutorName);
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
