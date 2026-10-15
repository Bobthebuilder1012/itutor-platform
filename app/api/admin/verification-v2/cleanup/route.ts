// POST /api/admin/verification-v2/cleanup   { apply?: boolean }
// Runs the retention sweep now (lib/verificationV2/cleanup.ts). Admin only.
// Dry run unless `apply: true`.

import { NextRequest, NextResponse } from 'next/server';
import { runVerificationCleanup } from '@/lib/verificationV2/cleanup';
import { guardAdminV2 } from '@/lib/verificationV2/adminGuard';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const g = await guardAdminV2({ adminOnly: true });
  if (g.error) return g.error;

  const body = await request.json().catch(() => ({}));
  const report = await runVerificationCleanup({ dryRun: body?.apply !== true, db: g.db });
  return NextResponse.json(report);
}
