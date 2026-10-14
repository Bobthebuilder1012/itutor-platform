// /api/admin/credits/adjust — add or remove a user's credits by hand.
//
//   POST {user_id | email, amount_ttd, reason, request_id?}
//
// Positive adds a lot (source 'admin', spendable at once); negative takes from
// the user's lots and is refused if their available balance is short. A
// written reason of at least 10 characters is required, as with payment
// reversals, and every adjustment is audited. request_id makes a double-click
// a no-op.

import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/services/adminAudit';
import { requireCreditAdmin } from '@/lib/credits/adminAccess';
import { isMissingSchema } from '@/lib/supabase/schemaErrors';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const { error, admin } = await requireCreditAdmin({ write: true });
  if (error) return error;

  const body = (await req.json().catch(() => null)) as {
    user_id?: unknown;
    email?: unknown;
    amount_ttd?: unknown;
    reason?: unknown;
    request_id?: unknown;
  } | null;

  const amount = Number(body?.amount_ttd);
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100_000) {
    return NextResponse.json({ error: 'Enter a non-zero amount in TT$' }, { status: 400 });
  }
  const rounded = Math.round(amount * 100) / 100;
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 10) {
    return NextResponse.json({ error: 'Give a reason of at least 10 characters' }, { status: 400 });
  }
  const requestId =
    typeof body?.request_id === 'string' && UUID.test(body.request_id) ? body.request_id : randomUUID();

  const service = getServiceClient();

  let userQuery = service.from('profiles').select('id, full_name, email, role');
  if (typeof body?.user_id === 'string' && UUID.test(body.user_id)) {
    userQuery = userQuery.eq('id', body.user_id);
  } else if (typeof body?.email === 'string' && body.email.includes('@')) {
    userQuery = userQuery.ilike('email', body.email.trim());
  } else {
    return NextResponse.json({ error: 'Choose the account by email' }, { status: 400 });
  }
  const { data: target } = await userQuery.maybeSingle();
  if (!target) return NextResponse.json({ error: 'No account with that email' }, { status: 404 });
  if (target.role !== 'student' && target.role !== 'parent') {
    return NextResponse.json({ error: 'Only student and parent accounts hold credits' }, { status: 400 });
  }

  const { data: ledgerId, error: rpcErr } = await service.rpc('adjust_credits', {
    p_user: target.id,
    p_amount: rounded,
    p_reason: reason,
    p_admin: admin.id,
    p_key: `admin-adjust:${requestId}`,
  });
  if (rpcErr) {
    if (isMissingSchema(rpcErr)) {
      return NextResponse.json({ error: 'Credits are not set up on this environment (migration 268)' }, { status: 409 });
    }
    if (rpcErr.message.startsWith('insufficient_credits:')) {
      return NextResponse.json(
        { error: 'That is more than their available balance. Credits already spent cannot be removed.' },
        { status: 409 }
      );
    }
    console.error('[admin/credits/adjust] failed:', rpcErr.message);
    return NextResponse.json({ error: 'Could not adjust credits' }, { status: 500 });
  }

  await logAdminAction(
    { id: admin.id, email: admin.email },
    {
      action: rounded > 0 ? 'credits.adjust.add' : 'credits.adjust.remove',
      targetType: 'account',
      targetId: target.id,
      targetLabel: target.full_name ?? target.email ?? null,
      details: { amount_ttd: rounded, ledger_id: ledgerId },
      reason,
    }
  );

  const { data: wallet } = await service
    .from('credit_wallets')
    .select('available_ttd, pending_ttd, reserved_ttd')
    .eq('user_id', target.id)
    .maybeSingle();

  return NextResponse.json({ ok: true, ledger_id: ledgerId, wallet });
}
