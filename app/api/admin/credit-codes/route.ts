// /api/admin/credit-codes — campaign (credit) codes, migration 269.
//
//   GET   every campaign with its numbers, the programme switches, and the
//         accounts that have redeemed the most
//   POST  create a campaign:
//         batch {kind:'batch', name, value_ttd, count, starts_at?, ends_at?,
//                eligibility?, credit_expiry_days?, max_redemptions?, note?}
//         promo {kind:'promo', name, value_ttd, code, starts_at?, ends_at?,
//                max_redemptions?, eligibility?, credit_expiry_days?, note?}
//
// Reading is open to reviewers; creating needs role 'admin'. Every write is
// audited.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/services/adminAudit';
import { requireCreditAdmin } from '@/lib/credits/adminAccess';
import { getCreditSettings } from '@/lib/credits/settings';
import { MAX_BATCH_SIZE, createBatchCodes, normaliseCode, promoCodeProblem } from '@/lib/credits/codes';
import { isMissingSchema } from '@/lib/supabase/schemaErrors';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function readDate(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

export async function GET() {
  const { error } = await requireCreditAdmin();
  if (error) return error;

  const admin = getServiceClient();
  const settings = await getCreditSettings(admin, { fresh: true });
  if (!settings) return NextResponse.json({ unavailable: true });

  const [{ data: campaigns, error: cErr }, { data: stats, error: sErr }] = await Promise.all([
    admin.from('credit_campaigns').select('*').order('created_at', { ascending: false }),
    admin.rpc('credit_campaign_stats'),
  ]);
  if (cErr || sErr) {
    if (isMissingSchema(cErr ?? sErr)) return NextResponse.json({ unavailable: true, reason: 'migration_269' });
    return NextResponse.json({ error: (cErr ?? sErr)?.message }, { status: 500 });
  }
  const statsBy = new Map(((stats ?? []) as Array<Record<string, unknown>>).map((s) => [s.campaign_id as string, s]));

  // Promo campaigns show their code in the list.
  const promoIds = (campaigns ?? []).filter((c) => c.kind === 'promo').map((c) => c.id);
  const { data: promoCodes } = promoIds.length
    ? await admin.from('credit_codes').select('campaign_id, code').in('campaign_id', promoIds)
    : { data: [] as Array<{ campaign_id: string; code: string }> };
  const codeOf = new Map((promoCodes ?? []).map((c) => [c.campaign_id, c.code]));

  // High redeemers: accounts by number of redemptions.
  const { data: redemptions } = await admin
    .from('credit_redemptions')
    .select('user_id, amount_ttd, reversed_at')
    .order('redeemed_at', { ascending: false })
    .limit(5000);
  const byUser = new Map<string, { count: number; value: number }>();
  for (const r of redemptions ?? []) {
    if (r.reversed_at) continue;
    const e = byUser.get(r.user_id) ?? { count: 0, value: 0 };
    e.count += 1;
    e.value += Number(r.amount_ttd);
    byUser.set(r.user_id, e);
  }
  const top = Array.from(byUser.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 25);
  const { data: people } = top.length
    ? await admin.from('profiles').select('id, full_name, email, is_suspended').in('id', top.map(([id]) => id))
    : { data: [] as Array<{ id: string; full_name: string | null; email: string | null; is_suspended: boolean }> };
  const personOf = new Map((people ?? []).map((p) => [p.id, p]));

  return NextResponse.json({
    switches: {
      campaign_codes_enabled: settings.campaign_codes_enabled,
      code_attempt_limit: settings.code_attempt_limit,
    },
    campaigns: (campaigns ?? []).map((c) => {
      const s = statsBy.get(c.id) ?? {};
      return {
        ...c,
        value_ttd: Number(c.value_ttd),
        code: codeOf.get(c.id) ?? null,
        codes_issued: Number(s.codes_issued ?? 0),
        codes_redeemed: Number(s.codes_redeemed ?? 0),
        redemptions: Number(s.redemptions ?? 0),
        value_redeemed: Number(s.value_redeemed ?? 0),
        value_spent: Number(s.value_spent ?? 0),
        value_outstanding: Number(s.value_outstanding ?? 0),
        value_expired: Number(s.value_expired ?? 0),
        value_clawed_back: Number(s.value_clawed_back ?? 0),
      };
    }),
    high_redeemers: top.map(([id, e]) => ({
      user_id: id,
      name: personOf.get(id)?.full_name ?? 'Unknown',
      email: personOf.get(id)?.email ?? null,
      is_suspended: personOf.get(id)?.is_suspended === true,
      redemptions: e.count,
      value_ttd: Math.round(e.value * 100) / 100,
    })),
  });
}

export async function POST(req: NextRequest) {
  const { error, admin: actor } = await requireCreditAdmin({ write: true });
  if (error) return error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Send the campaign' }, { status: 400 });

  const kind = body.kind === 'promo' ? 'promo' : body.kind === 'batch' ? 'batch' : null;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const value = Math.round(Number(body.value_ttd) * 100) / 100;
  const startsAt = readDate(body.starts_at);
  const endsAt = readDate(body.ends_at);
  const maxRedemptions = body.max_redemptions === null || body.max_redemptions === '' || body.max_redemptions === undefined
    ? null
    : Number(body.max_redemptions);
  const expiryDays = body.credit_expiry_days === null || body.credit_expiry_days === '' || body.credit_expiry_days === undefined
    ? null
    : Number(body.credit_expiry_days);
  const eligibility = body.eligibility === 'new_accounts' ? 'new_accounts' : 'anyone';

  if (!kind) return NextResponse.json({ error: 'Choose a batch of codes or a promo code' }, { status: 400 });
  if (name.length < 2 || name.length > 120) return NextResponse.json({ error: 'Give the campaign a name' }, { status: 400 });
  if (!(value > 0) || value > 10_000) return NextResponse.json({ error: 'Enter a TT$ value per code' }, { status: 400 });
  if (startsAt === undefined && body.starts_at !== undefined) return NextResponse.json({ error: 'Start date is not a date' }, { status: 400 });
  if (endsAt === undefined && body.ends_at !== undefined) return NextResponse.json({ error: 'End date is not a date' }, { status: 400 });
  if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt ?? new Date().toISOString())) {
    return NextResponse.json({ error: 'The end date must be after the start' }, { status: 400 });
  }
  if (maxRedemptions !== null && !(Number.isInteger(maxRedemptions) && maxRedemptions >= 1)) {
    return NextResponse.json({ error: 'Maximum redemptions must be a whole number' }, { status: 400 });
  }
  if (expiryDays !== null && !(Number.isInteger(expiryDays) && expiryDays >= 1)) {
    return NextResponse.json({ error: 'Credit expiry must be a whole number of days' }, { status: 400 });
  }

  const service = getServiceClient();

  let count = 0;
  let promoCode: string | null = null;
  if (kind === 'batch') {
    count = Number(body.count);
    if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH_SIZE) {
      return NextResponse.json({ error: `A batch is 1 to ${MAX_BATCH_SIZE} codes` }, { status: 400 });
    }
  } else {
    promoCode = normaliseCode(String(body.code ?? ''));
    const problem = await promoCodeProblem(service, promoCode);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  const { data: campaign, error: insErr } = await service
    .from('credit_campaigns')
    .insert({
      name,
      kind,
      value_ttd: value,
      starts_at: startsAt ?? new Date().toISOString(),
      ends_at: endsAt ?? null,
      max_redemptions: maxRedemptions,
      eligibility,
      credit_expiry_days: expiryDays,
      status: body.status === 'draft' ? 'draft' : 'active',
      note: typeof body.note === 'string' ? body.note.trim().slice(0, 1000) || null : null,
      created_by: actor.id,
    })
    .select('*')
    .single();
  if (insErr || !campaign) {
    if (isMissingSchema(insErr)) return NextResponse.json({ error: 'Credit codes are not set up here (migration 269)' }, { status: 409 });
    return NextResponse.json({ error: insErr?.message ?? 'Could not create the campaign' }, { status: 500 });
  }

  try {
    if (kind === 'batch') {
      await createBatchCodes(service, campaign.id, count);
    } else {
      const { error: codeErr } = await service.from('credit_codes').insert({ campaign_id: campaign.id, code: promoCode });
      if (codeErr) throw new Error(codeErr.code === '23505' ? 'That code is already in use.' : codeErr.message);
    }
  } catch (err) {
    // No half-made campaign: without its codes it is useless and confusing.
    await service.from('credit_campaigns').delete().eq('id', campaign.id);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not create the codes' }, { status: 500 });
  }

  await logAdminAction(
    { id: actor.id, email: actor.email },
    {
      action: 'credits.campaign.create',
      targetType: 'credit_campaign',
      targetId: campaign.id,
      targetLabel: name,
      details: { kind, value_ttd: value, count: kind === 'batch' ? count : 1, code: promoCode, eligibility, ends_at: endsAt ?? null },
    }
  );

  return NextResponse.json({ ok: true, campaign });
}
