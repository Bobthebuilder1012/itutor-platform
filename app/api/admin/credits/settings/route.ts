// /api/admin/credits/settings — the credit programme's rules (credit_settings,
// migration 268). Every number in the referral and campaign-code programmes
// lives here; none is hard-coded.
//
//   GET    the settings, plus whether this admin may edit them
//   PATCH  {field: value, ...}   change any subset; every change is audited
//
// A change applies to the next check. Grants copy the credit value onto
// themselves when issued, so lowering it never touches credits already earned.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/services/adminAudit';
import { requireCreditAdmin } from '@/lib/credits/adminAccess';
import { getCreditSettings, invalidateCreditSettings } from '@/lib/credits/settings';
import type { CreditSettings } from '@/lib/credits/types';

export const dynamic = 'force-dynamic';

type Rule =
  | { kind: 'bool' }
  | { kind: 'int'; min: number; nullable?: boolean }
  | { kind: 'money'; min: number; exclusiveMin?: boolean };

const RULES: Record<string, Rule> = {
  referrals_enabled: { kind: 'bool' },
  campaign_codes_enabled: { kind: 'bool' },
  referrals_required: { kind: 'int', min: 1 },
  credit_value_ttd: { kind: 'money', min: 0, exclusiveMin: true },
  min_qualifying_cash_ttd: { kind: 'money', min: 0 },
  min_cash_charge_ttd: { kind: 'money', min: 0 },
  hold_days: { kind: 'int', min: 0 },
  max_rewards_per_user: { kind: 'int', min: 1, nullable: true },
  flag_conversions_threshold: { kind: 'int', min: 1 },
  expiry_days: { kind: 'int', min: 1, nullable: true },
  code_attempt_limit: { kind: 'int', min: 1 },
};

function readField(field: string, rule: Rule, value: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (rule.kind === 'bool') {
    return typeof value === 'boolean' ? { ok: true, value } : { ok: false, error: `${field} must be true or false` };
  }
  if (value === null || value === '') {
    if (rule.kind === 'int' && rule.nullable) return { ok: true, value: null };
    return { ok: false, error: `${field} is required` };
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return { ok: false, error: `${field} must be a number` };
  if (rule.kind === 'int') {
    if (!Number.isInteger(n)) return { ok: false, error: `${field} must be a whole number` };
    if (n < rule.min) return { ok: false, error: `${field} must be at least ${rule.min}` };
    return { ok: true, value: n };
  }
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) {
    return { ok: false, error: `${field} can have at most two decimal places` };
  }
  if (rule.exclusiveMin ? n <= rule.min : n < rule.min) {
    return { ok: false, error: `${field} must be ${rule.exclusiveMin ? 'more than' : 'at least'} ${rule.min}` };
  }
  return { ok: true, value: Math.round(n * 100) / 100 };
}

export async function GET() {
  const { error, admin } = await requireCreditAdmin();
  if (error) return error;

  const settings = await getCreditSettings(getServiceClient(), { fresh: true });
  if (!settings) return NextResponse.json({ unavailable: true });
  return NextResponse.json({ settings, canEdit: admin.canWrite });
}

export async function PATCH(req: NextRequest) {
  const { error, admin } = await requireCreditAdmin({ write: true });
  if (error) return error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Send the fields to change' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(body)) {
    const rule = RULES[field];
    if (!rule) return NextResponse.json({ error: `Unknown setting: ${field}` }, { status: 400 });
    const parsed = readField(field, rule, value);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    update[field] = parsed.value;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
  }

  const service = getServiceClient();
  const before = await getCreditSettings(service, { fresh: true });
  if (!before) {
    return NextResponse.json({ error: 'Credits are not set up on this environment (migration 268)' }, { status: 409 });
  }

  // The nightly reconcile only converts payments made after the latest
  // switch-on, so a payment made while the programme was off never earns a
  // reward retroactively.
  if (update.referrals_enabled === true && !before.referrals_enabled) {
    update.referrals_enabled_at = new Date().toISOString();
  }
  update.updated_by = admin.id;
  update.updated_at = new Date().toISOString();

  const { error: updErr } = await service.from('credit_settings').update(update).eq('id', true);
  if (updErr) {
    console.error('[admin/credits/settings] update failed:', updErr.message);
    return NextResponse.json({ error: 'Could not save the settings' }, { status: 500 });
  }
  invalidateCreditSettings();
  const after = await getCreditSettings(service, { fresh: true });

  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of Object.keys(RULES)) {
    const from = before[field as keyof CreditSettings];
    const to = after?.[field as keyof CreditSettings];
    if (from !== to) changed[field] = { from, to };
  }
  await logAdminAction(
    { id: admin.id, email: admin.email },
    { action: 'credits.settings.update', targetType: 'credit_settings', details: { changed } }
  );

  return NextResponse.json({ settings: after, canEdit: true });
}
