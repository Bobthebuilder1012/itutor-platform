// /api/credits/redeem — campaign codes.
//
//   GET  ?code=…   what the code is worth, for the confirm page. Reads only.
//   POST {code}    redeem it (redeem_credit_code, migration 269)
//
// Redemption happens only on POST, from a button press. Link previews and QR
// scanners fetch URLs, so a GET that redeemed would use up single-use codes
// before their owner ever saw them.
//
// Guessing: a code that does not exist counts toward a 15-minute lockout after
// credit_settings.code_attempt_limit misses — on the preview as well as on
// redemption, or the preview would be an unlimited guessing oracle.

import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getCreditSettings } from '@/lib/credits/settings';
import { REDEEM_MESSAGES, REDEEM_STATUS, normaliseCode } from '@/lib/credits/codes';
import { isMissingSchema } from '@/lib/supabase/schemaErrors';

export const dynamic = 'force-dynamic';

function ipHash(req: NextRequest): string | null {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '';
  if (!ip) return null;
  return createHash('sha256').update(`${ip}:${process.env.CRON_SECRET ?? 'itutor'}`).digest('hex').slice(0, 32);
}

function refuse(reason: string) {
  return NextResponse.json(
    { ok: false, reason, error: REDEEM_MESSAGES[reason] ?? 'That code could not be redeemed.' },
    { status: REDEEM_STATUS[reason] ?? 400 }
  );
}

export async function GET(req: NextRequest) {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to redeem a code', signed_in: false }, { status: 401 });

  const code = normaliseCode(req.nextUrl.searchParams.get('code') ?? '');
  if (!code) return refuse('not_found');

  const admin = getServiceClient();
  const settings = await getCreditSettings(admin);
  if (!settings?.campaign_codes_enabled) return refuse('codes_disabled');

  const { count: misses } = await admin
    .from('credit_code_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('succeeded', false)
    .eq('reason', 'not_found')
    .gt('attempted_at', new Date(Date.now() - 15 * 60 * 1000).toISOString());
  if ((misses ?? 0) >= settings.code_attempt_limit) return refuse('locked_out');

  const { data: row, error } = await admin
    .from('credit_codes')
    .select('id, status, max_uses, use_count, campaign:credit_campaigns!campaign_id(name, value_ttd, status, starts_at, ends_at, credit_expiry_days)')
    .eq('code', code)
    .maybeSingle();
  if (error && isMissingSchema(error)) return refuse('codes_disabled');

  const campaign = row ? (Array.isArray(row.campaign) ? row.campaign[0] : row.campaign) : null;
  if (!row || !campaign || campaign.status === 'draft') {
    await admin.from('credit_code_attempts').insert({
      user_id: user.id,
      ip_hash: ipHash(req),
      code: code.slice(0, 32),
      succeeded: false,
      reason: 'not_found',
    });
    return refuse('not_found');
  }

  const now = Date.now();
  const state =
    row.status === 'void' || campaign.status === 'ended' || (campaign.ends_at && Date.parse(campaign.ends_at) <= now)
      ? 'ended'
      : campaign.status === 'paused'
        ? 'paused'
        : Date.parse(campaign.starts_at) > now
          ? 'not_started'
          : row.max_uses !== null && row.use_count >= row.max_uses
            ? 'already_used'
            : 'redeemable';

  const { data: mine } = await admin
    .from('credit_redemptions')
    .select('id')
    .eq('code_id', row.id)
    .eq('user_id', user.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    code,
    campaign: campaign.name,
    amount_ttd: Number(campaign.value_ttd),
    expires_in_days: campaign.credit_expiry_days,
    state: mine ? 'already_redeemed' : state,
    message: mine ? REDEEM_MESSAGES.already_redeemed : state === 'redeemable' ? null : REDEEM_MESSAGES[state],
  });
}

export async function POST(req: NextRequest) {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to redeem a code' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === 'string' ? normaliseCode(body.code) : '';
  if (!code || code.length > 32) return refuse('not_found');

  const admin = getServiceClient();
  const { data, error } = await admin.rpc('redeem_credit_code', {
    p_user: user.id,
    p_code: code,
    p_ip_hash: ipHash(req),
  });
  if (error) {
    if (isMissingSchema(error)) return refuse('codes_disabled');
    console.error('[credits/redeem] failed:', error.message);
    return NextResponse.json({ error: 'Could not redeem the code. Please try again.' }, { status: 500 });
  }

  const result = data as { ok: boolean; reason?: string; amount_ttd?: number; campaign?: string; expires_in_days?: number | null };
  if (!result.ok) return refuse(result.reason ?? 'not_found');
  return NextResponse.json({
    ok: true,
    amount_ttd: Number(result.amount_ttd),
    campaign: result.campaign,
    expires_in_days: result.expires_in_days ?? null,
  });
}
