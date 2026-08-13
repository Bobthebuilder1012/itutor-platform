// Per-child billing settings — handover §7 and §10.5.
//
// Three controls live on the parent_child_links row (migration 224):
//   requires_approval    the approval gate itself
//   billing_mode         'self_allowed' = the §7 self-pay toggle is on
//   monthly_spend_limit  a rolling calendar-month cap, null for none
//
// THE PRECEDENCE MATTERS AND IS NOT OBVIOUS
// §10.5: "At the limit, force approval regardless of the toggle." So the spend
// limit OVERRIDES self-pay, not the other way round. A parent who hands a child
// their own card and also sets a $1,500 ceiling means both things — and the
// ceiling is the one they will be angry about if it is ignored.

import type { SupabaseClient } from '@supabase/supabase-js';

export type ChildBillingSettings = {
  linkId: string;
  parentId: string;
  childId: string;
  billingMode: 'parent_required' | 'self_allowed';
  requiresApproval: boolean;
  monthlySpendLimit: number | null;
  selfPayEnabledAt: string | null;
  selfPayEnabledBy: string | null;
};

export async function getChildBilling(
  admin: SupabaseClient,
  childId: string
): Promise<ChildBillingSettings | null> {
  const { data } = await admin
    .from('parent_child_links')
    .select(
      'id, parent_id, child_id, billing_mode, requires_approval, monthly_spend_limit, self_pay_enabled_at, self_pay_enabled_by'
    )
    .eq('child_id', childId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const row = data as unknown as {
    id: string;
    parent_id: string;
    child_id: string;
    billing_mode: 'parent_required' | 'self_allowed';
    requires_approval: boolean;
    monthly_spend_limit: number | string | null;
    self_pay_enabled_at: string | null;
    self_pay_enabled_by: string | null;
  } | null;

  if (!row) return null;

  return {
    linkId: row.id,
    parentId: row.parent_id,
    childId: row.child_id,
    billingMode: row.billing_mode,
    requiresApproval: row.requires_approval,
    monthlySpendLimit: row.monthly_spend_limit == null ? null : Number(row.monthly_spend_limit),
    selfPayEnabledAt: row.self_pay_enabled_at,
    selfPayEnabledBy: row.self_pay_enabled_by,
  };
}

/** First instant of the current calendar month, in UTC. */
function monthStartIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * What has actually been paid for this child this calendar month.
 *
 * Counts paid bookings only — not requests, not pending checkouts. A pending
 * request has taken no money, and counting it would let a child exhaust the
 * ceiling with requests a parent then declines.
 */
export async function monthToDateSpend(
  admin: SupabaseClient,
  childId: string,
  now: Date = new Date()
): Promise<number> {
  const since = monthStartIso(now);

  const { data } = await admin
    .from('bookings')
    .select('price_ttd, frozen_price, payment_status, created_at')
    .eq('student_id', childId)
    .eq('payment_status', 'paid')
    .gte('created_at', since)
    .limit(500);

  const rows = (data ?? []) as unknown as Array<{
    price_ttd: number | string | null;
    frozen_price: number | string | null;
  }>;

  return rows.reduce((sum, r) => {
    const amount = Number(r.frozen_price ?? r.price_ttd ?? 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
}

export type SpendLimitVerdict = {
  limit: number | null;
  spent: number;
  remaining: number | null;
  /** True when the cap is reached, which forces approval (§10.5). */
  reached: boolean;
};

export async function checkSpendLimit(
  admin: SupabaseClient,
  settings: ChildBillingSettings,
  now: Date = new Date()
): Promise<SpendLimitVerdict> {
  if (settings.monthlySpendLimit == null) {
    return { limit: null, spent: 0, remaining: null, reached: false };
  }

  const spent = await monthToDateSpend(admin, settings.childId, now);
  const remaining = Math.max(0, settings.monthlySpendLimit - spent);

  return {
    limit: settings.monthlySpendLimit,
    spent,
    remaining,
    reached: spent >= settings.monthlySpendLimit,
  };
}

/**
 * Enables or disables self-pay, with the provenance §7's security email needs.
 *
 * Takes effect immediately and is not pending anything — §7 is explicit that
 * this is a tripwire, not a gate. The alert email is what catches a child who
 * flipped it, and it can only say "if this was not you" credibly because
 * self_pay_enabled_by is written here rather than claimed by the caller.
 */
export async function setSelfPay(
  admin: SupabaseClient,
  params: { childId: string; parentId: string; enabled: boolean }
): Promise<{ ok: boolean; reason?: string }> {
  const nowIso = new Date().toISOString();

  const { error } = await admin
    .from('parent_child_links')
    .update({
      billing_mode: params.enabled ? 'self_allowed' : 'parent_required',
      self_pay_enabled_at: params.enabled ? nowIso : null,
      self_pay_enabled_by: params.enabled ? params.parentId : null,
      // Turning self-pay on necessarily lifts the approval gate; turning it off
      // restores it. Leaving requires_approval untouched would produce a state
      // where a child pays their own way but every booking still waits on a
      // parent, which is neither setting.
      requires_approval: !params.enabled,
    })
    .eq('child_id', params.childId)
    .eq('parent_id', params.parentId);

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/**
 * §7 step 4: "Completing a password change and signing in turns self-pay back
 * off for every child on the account."
 *
 * This is the recovery path for the case the whole design is built around — a
 * child who enabled self-pay on their parent's unlocked phone. The parent
 * secures the account, and the setting reverts without them having to find it.
 * Idempotent, so calling it on an account with nothing enabled is a no-op.
 */
export async function revokeAllSelfPay(
  admin: SupabaseClient,
  parentId: string
): Promise<{ revoked: number }> {
  const { data, error } = await admin
    .from('parent_child_links')
    .update({
      billing_mode: 'parent_required',
      self_pay_enabled_at: null,
      self_pay_enabled_by: null,
      requires_approval: true,
    })
    .eq('parent_id', parentId)
    .eq('billing_mode', 'self_allowed')
    .select('child_id');

  if (error) {
    console.error('[childBilling] revokeAllSelfPay failed:', error.message);
    return { revoked: 0 };
  }
  return { revoked: data?.length ?? 0 };
}
