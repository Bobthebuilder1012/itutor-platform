// /api/admin/credit-codes/[campaignId] — one campaign.
//
//   GET    ?q=…&page=…         the campaign, its numbers, a page of codes
//                              (searchable) and the redemption log
//          ?export=csv          every code: code, value, status, redeemed by, redeemed at
//          ?all=1               every code (for QR downloads and the print sheet)
//   PATCH  {action}             pause | resume | end | void_unused
//          {action:'edit', name?, note?, starts_at?, ends_at?, max_redemptions?, value_ttd?}
//          value_ttd only for a promo, and only for FUTURE redemptions: each
//          redemption copied the value it was granted.
//
// Writes need role 'admin' and are audited.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/services/adminAudit';
import { requireCreditAdmin } from '@/lib/credits/adminAccess';

export const dynamic = 'force-dynamic';

const PAGE = 100;

type Params = { params: Promise<{ campaignId: string }> };

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: NextRequest, { params }: Params) {
  const { error } = await requireCreditAdmin();
  if (error) return error;
  const { campaignId } = await params;
  const admin = getServiceClient();

  const { data: campaign } = await admin.from('credit_campaigns').select('*').eq('id', campaignId).maybeSingle();
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  const sp = req.nextUrl.searchParams;

  // Every redemption, for names and the CSV.
  const { data: redemptions } = await admin
    .from('credit_redemptions')
    .select('id, code_id, user_id, amount_ttd, redeemed_at, reversed_at, reverse_reason')
    .eq('campaign_id', campaignId)
    .order('redeemed_at', { ascending: false })
    .limit(10000);
  const userIds = Array.from(new Set((redemptions ?? []).map((r) => r.user_id)));
  const people = new Map<string, { name: string; email: string | null }>();
  for (let i = 0; i < userIds.length; i += 200) {
    const { data } = await admin.from('profiles').select('id, full_name, email').in('id', userIds.slice(i, i + 200));
    for (const p of data ?? []) people.set(p.id, { name: p.full_name ?? p.email ?? 'Unknown', email: p.email ?? null });
  }
  const byCode = new Map<string, typeof redemptions>();
  for (const r of redemptions ?? []) {
    const list = byCode.get(r.code_id) ?? [];
    list.push(r);
    byCode.set(r.code_id, list);
  }

  if (sp.get('export') === 'csv' || sp.get('all') === '1') {
    const codes: Array<{ id: string; code: string; status: string; use_count: number }> = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await admin
        .from('credit_codes')
        .select('id, code, status, use_count')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: true })
        .range(from, from + 999);
      codes.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    if (sp.get('all') === '1') return NextResponse.json({ codes: codes.map((c) => ({ code: c.code, status: c.status, used: c.use_count })) });

    const lines = ['code,value_ttd,status,redeemed_by,redeemed_by_email,redeemed_at'];
    for (const c of codes) {
      const reds = byCode.get(c.id) ?? [];
      if (reds.length === 0) {
        lines.push([c.code, campaign.value_ttd, c.status, '', '', ''].map(csvCell).join(','));
      }
      for (const r of reds) {
        const who = people.get(r.user_id);
        lines.push(
          [c.code, r.amount_ttd, r.reversed_at ? 'reversed' : 'redeemed', who?.name ?? '', who?.email ?? '', r.redeemed_at]
            .map(csvCell)
            .join(',')
        );
      }
    }
    const filename = `${campaign.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-codes.csv`;
    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  const q = (sp.get('q') ?? '').trim().toUpperCase();
  const page = Math.max(1, Number(sp.get('page')) || 1);
  let codeQuery = admin
    .from('credit_codes')
    .select('id, code, status, use_count, max_uses, created_at', { count: 'exact' })
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (q) codeQuery = codeQuery.ilike('code', `%${q}%`);
  const { data: codes, count } = await codeQuery;

  const { data: stats } = await admin.rpc('credit_campaign_stats');
  const s = ((stats ?? []) as Array<Record<string, unknown>>).find((x) => x.campaign_id === campaignId) ?? {};

  return NextResponse.json({
    campaign: { ...campaign, value_ttd: Number(campaign.value_ttd) },
    stats: {
      codes_issued: Number(s.codes_issued ?? 0),
      codes_redeemed: Number(s.codes_redeemed ?? 0),
      redemptions: Number(s.redemptions ?? 0),
      value_redeemed: Number(s.value_redeemed ?? 0),
      value_spent: Number(s.value_spent ?? 0),
      value_outstanding: Number(s.value_outstanding ?? 0),
      value_expired: Number(s.value_expired ?? 0),
      value_clawed_back: Number(s.value_clawed_back ?? 0),
    },
    codes: (codes ?? []).map((c) => {
      const latest = (byCode.get(c.id) ?? [])[0];
      return {
        ...c,
        redeemed_by: latest ? people.get(latest.user_id)?.name ?? 'Unknown' : null,
        redeemed_at: latest?.redeemed_at ?? null,
      };
    }),
    codes_total: count ?? 0,
    page,
    page_size: PAGE,
    redemptions: (redemptions ?? []).slice(0, 200).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      name: people.get(r.user_id)?.name ?? 'Unknown',
      email: people.get(r.user_id)?.email ?? null,
      amount_ttd: Number(r.amount_ttd),
      redeemed_at: r.redeemed_at,
      reversed_at: r.reversed_at,
      reverse_reason: r.reverse_reason,
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error, admin: actor } = await requireCreditAdmin({ write: true });
  if (error) return error;
  const { campaignId } = await params;
  const service = getServiceClient();

  const { data: campaign } = await service.from('credit_campaigns').select('*').eq('id', campaignId).maybeSingle();
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? '');
  const now = new Date().toISOString();
  let details: Record<string, unknown> = { action };

  if (action === 'pause' || action === 'resume' || action === 'end') {
    const status = action === 'pause' ? 'paused' : action === 'resume' ? 'active' : 'ended';
    if (campaign.status === 'ended' && action !== 'end') {
      return NextResponse.json({ error: 'An ended campaign cannot be restarted. Create a new one.' }, { status: 409 });
    }
    await service.from('credit_campaigns').update({ status, updated_at: now }).eq('id', campaignId);
    details = { action, from: campaign.status, to: status };
  } else if (action === 'void_unused') {
    const { data: voided } = await service
      .from('credit_codes')
      .update({ status: 'void' })
      .eq('campaign_id', campaignId)
      .eq('use_count', 0)
      .eq('status', 'active')
      .select('id');
    details = { action, voided: (voided ?? []).length };
  } else if (action === 'edit') {
    const update: Record<string, unknown> = { updated_at: now };
    const changed: Record<string, { from: unknown; to: unknown }> = {};
    const set = (field: string, value: unknown) => {
      update[field] = value;
      changed[field] = { from: (campaign as Record<string, unknown>)[field], to: value };
    };
    if (typeof body.name === 'string' && body.name.trim().length >= 2) set('name', body.name.trim().slice(0, 120));
    if (typeof body.note === 'string') set('note', body.note.trim().slice(0, 1000) || null);
    for (const field of ['starts_at', 'ends_at'] as const) {
      if (body[field] === undefined) continue;
      if (body[field] === null || body[field] === '') {
        if (field === 'starts_at') return NextResponse.json({ error: 'A campaign needs a start date' }, { status: 400 });
        set(field, null);
        continue;
      }
      const t = Date.parse(String(body[field]));
      if (!Number.isFinite(t)) return NextResponse.json({ error: `${field} is not a date` }, { status: 400 });
      set(field, new Date(t).toISOString());
    }
    const startsAt = (update.starts_at ?? campaign.starts_at) as string;
    const endsAt = (update.ends_at === undefined ? campaign.ends_at : update.ends_at) as string | null;
    if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      return NextResponse.json({ error: 'The end date must be after the start' }, { status: 400 });
    }
    if (body.max_redemptions !== undefined) {
      const v = body.max_redemptions === null || body.max_redemptions === '' ? null : Number(body.max_redemptions);
      if (v !== null && !(Number.isInteger(v) && v >= 1)) {
        return NextResponse.json({ error: 'Maximum redemptions must be a whole number' }, { status: 400 });
      }
      set('max_redemptions', v);
    }
    if (body.value_ttd !== undefined) {
      if (campaign.kind !== 'promo') {
        return NextResponse.json({ error: 'A batch’s value is fixed; create a new batch instead.' }, { status: 400 });
      }
      const v = Math.round(Number(body.value_ttd) * 100) / 100;
      if (!(v > 0) || v > 10_000) return NextResponse.json({ error: 'Enter a TT$ value' }, { status: 400 });
      set('value_ttd', v);
    }
    await service.from('credit_campaigns').update(update).eq('id', campaignId);
    details = { action, changed };
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  await logAdminAction(
    { id: actor.id, email: actor.email },
    { action: `credits.campaign.${action}`, targetType: 'credit_campaign', targetId: campaignId, targetLabel: campaign.name, details }
  );

  const { data: fresh } = await service.from('credit_campaigns').select('*').eq('id', campaignId).maybeSingle();
  return NextResponse.json({ ok: true, campaign: fresh, details });
}
