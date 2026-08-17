import { NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';

export const dynamic = 'force-dynamic';

// POST /api/parent/feedback/seen — mark the feedback notification as read.
//
// The dashboard attention card and the sidebar badge both count feedback that
// arrived AFTER `profiles.feedback_seen_at`. Before this existed they counted
// by age alone, so a parent had no way to clear either: "Read feedback" opened
// the page and the count stayed put until the item aged out. Stamping on view
// is what makes that button mean what it says.
//
// Idempotent and monotonic — it only ever moves the mark forward. Two tabs, a
// double-tap, or a stale request arriving late cannot rewind it and resurrect
// notifications the parent has already dismissed.
export async function POST() {
  try {
    const { admin, parentProfile } = await requireParentContext();

    const now = new Date().toISOString();
    const { error } = await admin
      .from('profiles')
      .update({ feedback_seen_at: now })
      .eq('id', parentProfile.id)
      // Monotonic: never move the mark backwards.
      .or(`feedback_seen_at.is.null,feedback_seen_at.lt.${now}`);

    if (error) throw error;
    return NextResponse.json({ seenAt: now });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[POST /api/parent/feedback/seen]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
