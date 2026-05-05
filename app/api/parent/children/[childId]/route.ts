import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';
import { getParentChildDetail } from '@/lib/server/parentDashboard';

export const dynamic = 'force-dynamic';

type Context = {
  params: Promise<{ childId: string }>;
};

export async function GET(_request: NextRequest, context: Context) {
  try {
    const { childId } = await context.params;
    const { parentProfile } = await requireParentContext();
    const child = await getParentChildDetail(parentProfile.id, childId);

    return NextResponse.json({
      success: true,
      child,
    });
  } catch (error) {
    if (error instanceof ParentAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Failed to load child details' }, { status: 500 });
  }
}
