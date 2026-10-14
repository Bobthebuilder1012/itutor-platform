// Typed wrappers over the wallet functions in migration 268. The functions own
// every balance change; this file only calls them and turns their
// token-prefixed errors into something a route can answer with.

import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingSchema } from '@/lib/supabase/schemaErrors';
import type { CreditSpendContext } from '@/lib/credits/types';

export type CreditErrorCode = 'insufficient_credits' | 'key_released' | 'unavailable' | 'failed';

export class CreditError extends Error {
  constructor(public code: CreditErrorCode, message: string) {
    super(message);
    this.name = 'CreditError';
  }
}

function toCreditError(error: { code?: unknown; message?: string }): CreditError {
  const message = String(error.message ?? '');
  if (isMissingSchema(error)) return new CreditError('unavailable', 'Credits are not set up on this environment');
  if (message.startsWith('insufficient_credits:')) return new CreditError('insufficient_credits', message);
  if (message.startsWith('key_released:')) return new CreditError('key_released', message);
  return new CreditError('failed', message);
}

export interface WalletBalance {
  available: number;
  pending: number;
  reserved: number;
}

/** The user's balance, zeros when they have none, null when credits are not set up here. */
export async function getWallet(admin: SupabaseClient, userId: string): Promise<WalletBalance | null> {
  const { data, error } = await admin
    .from('credit_wallets')
    .select('available_ttd, pending_ttd, reserved_ttd')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (isMissingSchema(error)) return null;
    throw new Error(`credit_wallets read failed: ${error.message}`);
  }
  return {
    available: Number(data?.available_ttd ?? 0),
    pending: Number(data?.pending_ttd ?? 0),
    reserved: Number(data?.reserved_ttd ?? 0),
  };
}

/** Hold credits for a payment. Returns the spend id. Throws CreditError. */
export async function reserveCredits(
  admin: SupabaseClient,
  params: { userId: string; amountTtd: number; key: string; context: CreditSpendContext }
): Promise<string> {
  const { data, error } = await admin.rpc('reserve_credits', {
    p_user: params.userId,
    p_amount: Math.round(params.amountTtd * 100) / 100,
    p_key: params.key,
    p_context: params.context,
  });
  if (error) throw toCreditError(error);
  return data as string;
}

/** The payment was confirmed. Safe to call twice. */
export async function commitCredits(
  admin: SupabaseClient,
  spendId: string,
  subscriptionPaymentId?: string | null
): Promise<string> {
  const { data, error } = await admin.rpc('commit_credits', {
    p_spend_id: spendId,
    p_subscription_payment_id: subscriptionPaymentId ?? null,
  });
  if (error) throw toCreditError(error);
  return String(data);
}

/** The payment will not happen. A settled spend is left alone. Safe to call twice. */
export async function releaseCredits(admin: SupabaseClient, spendId: string): Promise<string> {
  const { data, error } = await admin.rpc('release_credits', { p_spend_id: spendId });
  if (error) throw toCreditError(error);
  return String(data);
}

/** Record the Stripe coupon that carries a reservation to an invoice. */
export async function attachCouponToSpend(
  admin: SupabaseClient,
  spendId: string,
  couponId: string,
  extraContext: Partial<CreditSpendContext> & Record<string, unknown> = {}
): Promise<void> {
  const { data: row } = await admin.from('credit_ledger').select('context').eq('id', spendId).maybeSingle();
  const context = { ...((row?.context as Record<string, unknown>) ?? {}), ...extraContext };
  const { error } = await admin
    .from('credit_ledger')
    .update({ stripe_coupon_id: couponId, context, updated_at: new Date().toISOString() })
    .eq('id', spendId);
  if (error) throw toCreditError(error);
}

/** Never throws: for release/commit attempts on a path that must not fail. */
export async function safely<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[credits] ${label} failed:`, err);
    return null;
  }
}
