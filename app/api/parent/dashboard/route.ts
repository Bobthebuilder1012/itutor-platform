import { NextResponse } from 'next/server';
import { getParentDashboardData } from '@/lib/server/parentDashboard';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { parentProfile } = await requireParentContext();
    const dashboard = await getParentDashboardData(parentProfile.id);

    return NextResponse.json({
      success: true,
      dashboard,
    });
  } catch (error) {
    if (error instanceof ParentAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
