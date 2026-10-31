// POST /api/admin/verification-v2/didit-test   (admin role only)
// A harmless "is Didit reachable with our key" check. It lists at most one session (read
// only), creates nothing and so cannot start a verification. Returns which settings are
// present (booleans) and a plain message. Never returns a key, a secret or Didit's raw
// response.

import { NextResponse } from 'next/server';
import { guardAdminV2 } from '@/lib/verificationV2/adminGuard';
import { diditPing } from '@/lib/identity/providers/didit';
import { diditWorkflowId } from '@/lib/identity/diditConfig';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST() {
  const g = await guardAdminV2({ adminOnly: true });
  if (g.error) return g.error;

  const workflow = diditWorkflowId();
  const settings = {
    apiKey: !!process.env.DIDIT_API_KEY?.trim(),
    workflowId: workflow.length > 0,
    workflowIdLooksValid: UUID.test(workflow),
    webhookSecret: !!process.env.DIDIT_WEBHOOK_SECRET?.trim(),
  };

  const ping = await diditPing();
  const notes: string[] = [];
  if (!settings.workflowId) notes.push('DIDIT_WORKFLOW_ID is not set.');
  else if (!settings.workflowIdLooksValid) notes.push('DIDIT_WORKFLOW_ID is not a valid workflow id (it should be a UUID).');
  if (!settings.webhookSecret) notes.push('DIDIT_WEBHOOK_SECRET is not set, so Didit results cannot be received.');

  return NextResponse.json({ ok: ping.ok && notes.length === 0, connection: ping, settings, notes });
}
