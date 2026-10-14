// The credit programme's admin settings (credit_settings, one row, migration
// 268). Read through here, never straight from the table, so every check sees
// the same values and a missing table reads as "both programmes off".
//
// Cached per server instance for 30 seconds: settings change rarely, and the
// reads sit on hot paths (every checkout, every webhook). A change applies to
// the next check after that — never retroactively, because grants copy the
// credit value onto themselves when they are issued.

import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingSchema } from '@/lib/supabase/schemaErrors';
import type { CreditSettings } from '@/lib/credits/types';

const TTL_MS = 30_000;

let cached: { at: number; value: CreditSettings | null } | null = null;

const COLUMNS =
  'referrals_enabled, referrals_enabled_at, campaign_codes_enabled, referrals_required, ' +
  'credit_value_ttd, min_qualifying_cash_ttd, min_cash_charge_ttd, hold_days, ' +
  'max_rewards_per_user, flag_conversions_threshold, expiry_days, code_attempt_limit, ' +
  'updated_by, updated_at';

function normalise(row: Record<string, unknown>): CreditSettings {
  const num = (v: unknown) => Number(v ?? 0);
  const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    referrals_enabled: row.referrals_enabled === true,
    referrals_enabled_at: (row.referrals_enabled_at as string | null) ?? null,
    campaign_codes_enabled: row.campaign_codes_enabled === true,
    referrals_required: num(row.referrals_required),
    credit_value_ttd: num(row.credit_value_ttd),
    min_qualifying_cash_ttd: num(row.min_qualifying_cash_ttd),
    min_cash_charge_ttd: num(row.min_cash_charge_ttd),
    hold_days: num(row.hold_days),
    max_rewards_per_user: numOrNull(row.max_rewards_per_user),
    flag_conversions_threshold: num(row.flag_conversions_threshold),
    expiry_days: numOrNull(row.expiry_days),
    code_attempt_limit: num(row.code_attempt_limit),
    updated_by: (row.updated_by as string | null) ?? null,
    updated_at: String(row.updated_at ?? ''),
  };
}

/**
 * The settings row, or null when migration 268 is not applied here (treat as
 * both programmes off). Throws only on a real database failure.
 */
export async function getCreditSettings(
  admin: SupabaseClient,
  opts: { fresh?: boolean } = {}
): Promise<CreditSettings | null> {
  if (!opts.fresh && cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const { data, error } = await admin.from('credit_settings').select(COLUMNS).eq('id', true).maybeSingle();
  if (error) {
    if (isMissingSchema(error)) {
      cached = { at: Date.now(), value: null };
      return null;
    }
    throw new Error(`credit_settings read failed: ${error.message}`);
  }
  const value = data ? normalise(data as unknown as Record<string, unknown>) : null;
  cached = { at: Date.now(), value };
  return value;
}

/** Drop this instance's cached copy (after an admin edit). */
export function invalidateCreditSettings(): void {
  cached = null;
}

/** True when credits exist at all here: the tables are present. */
export function creditsAvailable(settings: CreditSettings | null): settings is CreditSettings {
  return settings !== null;
}
