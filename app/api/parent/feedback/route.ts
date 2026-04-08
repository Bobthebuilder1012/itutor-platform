import { NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';
import { getParentFeedbackPageData } from '@/lib/server/parentFeedback';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { parentProfile } = await requireParentContext();
    const data = await getParentFeedbackPageData(parentProfile.id);
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    if (error instanceof ParentAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[GET /api/parent/feedback]', error);
    return NextResponse.json({ error: 'Failed to load feedback' }, { status: 500 });
  }
}
