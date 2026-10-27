// GET /api/credits/me — everything the Rewards page, the balance chips and the
// checkout controls need about the signed-in student's or parent's credits.
//
//   ?lite=1   wallet, switches and pending renewal credits only (chips,
//             checkout, subscriptions page) — no code creation, no history
//
// The referral code is created here on the first full visit (spec §3.1).
// While the referral programme is off the share link and progress are left
// out, but balances stay visible and spendable.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getCreditSettings } from '@/lib/credits/settings';
import { getWallet } from '@/lib/credits/wallet';
import { releaseLapsedCreditHolds } from '@/lib/credits/releaseLapsedHolds';
import { getOrCreateReferralCode, referralLink } from '@/lib/credits/referralCodes';
import { firstNameAndInitial } from '@/lib/credits/notify';
import type { CreditHistoryItem, CreditLedgerRow, CreditsMePayload } from '@/lib/credits/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = getServiceClient();
  const settings = await getCreditSettings(admin);
  if (!settings) return NextResponse.json({ available: false } satisfies CreditsMePayload);

  const { data: profile } = await admin
    .from('profiles')
    .select('role, is_suspended')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role !== 'student' && profile?.role !== 'parent') {
    return NextResponse.json({ available: false } satisfies CreditsMePayload);
  }

  // Repair the balance before reporting it. Credits held for a checkout that
  // was abandoned are otherwise invisible until the daily cron, and a student
  // looking at a zero balance they did not spend has no way to tell the
  // difference between a hold and a charge.
  await releaseLapsedCreditHolds(admin, user.id);

  const lite = req.nextUrl.searchParams.get('lite') === '1';
  const wallet = (await getWallet(admin, user.id)) ?? { available: 0, pending: 0, reserved: 0 };

  const { data: openRenewals } = await admin
    .from('credit_ledger')
    .select('amount_ttd, context')
    .eq('user_id', user.id)
    .eq('kind', 'spend')
    .eq('state', 'reserved')
    .eq('context->>scenario', 'A');
  const renewals: CreditsMePayload['renewals'] = {};
  for (const r of openRenewals ?? []) {
    const ctx = (r.context ?? {}) as { enrollment_id?: string; period_end?: string };
    if (ctx.enrollment_id) {
      renewals[ctx.enrollment_id] = { credits: -Number(r.amount_ttd), applies_on: ctx.period_end ?? null };
    }
  }

  const base: CreditsMePayload = {
    available: true,
    role: profile.role,
    suspended: profile.is_suspended === true,
    programme: {
      referrals_enabled: settings.referrals_enabled,
      campaign_codes_enabled: settings.campaign_codes_enabled,
      referrals_required: settings.referrals_required,
      credit_value_ttd: settings.credit_value_ttd,
      min_qualifying_cash_ttd: settings.min_qualifying_cash_ttd,
      hold_days: settings.hold_days,
    },
    wallet,
    renewals,
  };
  if (lite) return NextResponse.json(base);

  // ── Referral link and progress (programme on only) ─────────────────────
  let referral: CreditsMePayload['referral'] = null;
  if (settings.referrals_enabled && !profile.is_suspended) {
    const code = await getOrCreateReferralCode(admin, user.id).catch((e) => {
      console.error('[credits/me] referral code:', e);
      return null;
    });
    if (code) referral = { code, link: referralLink(code) };
  }

  const { data: referralRows } = await admin
    .from('referrals')
    .select('referee_id, status, grant_id, created_at, converted_at')
    .eq('referrer_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  const refereeIds = (referralRows ?? []).map((r) => r.referee_id as string);
  const { data: referees } = refereeIds.length
    ? await admin.from('profiles').select('id, full_name').in('id', refereeIds)
    : { data: [] as Array<{ id: string; full_name: string | null }> };
  const nameOf = new Map((referees ?? []).map((p) => [p.id as string, firstNameAndInitial(p.full_name)]));

  const friends: CreditsMePayload['friends'] = (referralRows ?? []).map((r) => ({
    name: nameOf.get(r.referee_id as string) ?? 'A friend',
    status:
      r.status === 'rejected'
        ? 'not_eligible'
        : r.status === 'converted'
          ? r.grant_id
            ? 'rewarded'
            : 'paid'
          : 'signed_up',
    at: (r.converted_at as string | null) ?? (r.created_at as string),
  }));
  const progress = {
    toward_next: (referralRows ?? []).filter((r) => r.status === 'converted' && !r.grant_id).length,
    required: settings.referrals_required,
    rewards: new Set((referralRows ?? []).map((r) => r.grant_id).filter(Boolean)).size,
    friends: (referralRows ?? []).length,
  };

  // ── History ────────────────────────────────────────────────────────────
  const { data: ledger } = await admin
    .from('credit_ledger')
    .select('id, kind, amount_ttd, state, source, source_id, available_at, context, note, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  const rows = (ledger ?? []) as unknown as CreditLedgerRow[];

  const groupIds = Array.from(
    new Set(rows.map((r) => (r.context as { group_id?: string } | null)?.group_id).filter(Boolean) as string[])
  );
  const { data: groups } = groupIds.length
    ? await admin.from('groups').select('id, name').in('id', groupIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const groupName = new Map((groups ?? []).map((g) => [g.id as string, g.name as string]));

  // Campaign names, through the redemption (migration 269; absent before it).
  const redemptionIds = rows.filter((r) => r.source === 'campaign_code' && r.source_id).map((r) => r.source_id as string);
  const campaignOf = new Map<string, string>();
  if (redemptionIds.length) {
    const { data: redemptions } = await admin
      .from('credit_redemptions')
      .select('id, campaign:credit_campaigns!campaign_id(name)')
      .in('id', redemptionIds);
    for (const r of (redemptions ?? []) as Array<{ id: string; campaign: { name: string } | { name: string }[] | null }>) {
      const c = Array.isArray(r.campaign) ? r.campaign[0] : r.campaign;
      if (c?.name) campaignOf.set(r.id, c.name);
    }
  }

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-TT', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  const history: CreditHistoryItem[] = [];
  for (const r of rows) {
    const amount = Number(r.amount_ttd);
    const className = groupName.get((r.context as { group_id?: string } | null)?.group_id ?? '') ?? null;
    switch (r.kind) {
      case 'grant':
        if (r.state === 'void') {
          history.push({ id: r.id, label: 'Referral reward cancelled', detail: 'A friend’s payment was refunded during the hold period.', amount: 0, status: 'done', at: r.created_at });
          break;
        }
        history.push({
          id: r.id,
          label:
            r.source === 'referral'
              ? 'Referral reward'
              : r.source === 'campaign_code'
                ? `Campaign: ${campaignOf.get(r.source_id ?? '') ?? 'code'}`
                : 'Added by iTutor',
          detail:
            r.state === 'pending' ? `Spendable from ${fmtDate(r.available_at)}` : r.source === 'admin' ? r.note : null,
          amount,
          status: r.state === 'pending' ? 'pending' : 'done',
          at: r.created_at,
        });
        break;
      case 'spend':
        if (r.state === 'released') break; // a checkout that never completed: net nothing
        history.push({
          id: r.id,
          label: className ? `Spent on ${className}` : 'Spent on a class',
          detail:
            r.state === 'reserved'
              ? (r.context as { scenario?: string })?.scenario === 'A'
                ? `Set to apply to your payment on ${fmtDate((r.context as { period_end?: string }).period_end ?? null)}`
                : 'Waiting for your payment to complete'
              : null,
          amount,
          status: r.state === 'reserved' ? 'held' : 'done',
          at: r.created_at,
        });
        break;
      case 'restore':
        history.push({ id: r.id, label: 'Returned after a refund', detail: null, amount, status: 'done', at: r.created_at });
        break;
      case 'clawback':
        history.push({ id: r.id, label: 'Reward taken back', detail: 'A friend’s payment was refunded.', amount, status: 'done', at: r.created_at });
        break;
      case 'expiry':
        history.push({ id: r.id, label: 'Credits expired', detail: null, amount, status: 'done', at: r.created_at });
        break;
      case 'adjustment':
        history.push({ id: r.id, label: 'Removed by iTutor', detail: r.note, amount, status: 'done', at: r.created_at });
        break;
    }
  }

  return NextResponse.json({ ...base, referral, progress, friends, history } satisfies CreditsMePayload);
}
