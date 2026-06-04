// =====================================================
// TUTOR PAYOUT ACCOUNT
// =====================================================
// GET  /api/tutor/payout-account     → returns the caller's account
// POST /api/tutor/payout-account     → upsert bank details
//
// Tutors-only. Money flows iTutor → tutor's bank via the admin
// payout CSV pipeline (see /api/admin/payouts/*).
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function requireTutor() {
  const userClient = await getServerClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };

  const { data: profile } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'tutor') {
    return { error: 'Forbidden', status: 403 as const };
  }

  return { user };
}

export async function GET() {
  const auth = await requireTutor();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = getServiceClient();
  const { data, error } = await admin
    .from('tutor_payout_accounts')
    .select('payout_name, payout_account_identifier, bank_name, branch, account_type, verified_at, updated_at')
    .eq('tutor_id', auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ account: data ?? null });
}

export async function POST(request: NextRequest) {
  const auth = await requireTutor();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const payoutName = (body.payout_name ?? '').toString().trim();
  const accountNumber = (body.payout_account_identifier ?? '').toString().trim();
  const bankName = (body.bank_name ?? '').toString().trim();
  const branch = (body.branch ?? '').toString().trim();
  const accountType = (body.account_type ?? '').toString().trim();

  if (!payoutName || !accountNumber || !bankName || !branch) {
    return NextResponse.json(
      { error: 'payout_name, account number, bank name, and branch are required' },
      { status: 400 }
    );
  }

  if (accountType && !['chequing', 'savings'].includes(accountType)) {
    return NextResponse.json(
      { error: 'account_type must be "chequing" or "savings"' },
      { status: 400 }
    );
  }

  const admin = getServiceClient();
  const { error } = await admin
    .from('tutor_payout_accounts')
    .upsert(
      {
        tutor_id: auth.user.id,
        provider: 'bank',
        payout_name: payoutName,
        payout_account_identifier: accountNumber,
        bank_name: bankName,
        branch,
        account_type: accountType || null,
        verified_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tutor_id' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
