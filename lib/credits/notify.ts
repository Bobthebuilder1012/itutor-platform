// In-app notifications for the credit programme. The push fan-out is
// automatic (an AFTER INSERT trigger on notifications, migration 123).
//
// The three types used here were added to notifications_type_check by
// migration 268. An unlisted type fails the insert silently, so the error is
// checked and logged rather than trusted to a try/catch.

import type { SupabaseClient } from '@supabase/supabase-js';

type CreditNotificationType = 'referral_converted' | 'referral_reward' | 'credit_month_ended';

async function rewardsPath(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle();
  return data?.role === 'parent' ? '/parent/rewards' : '/student/rewards';
}

export async function notifyCredits(
  admin: SupabaseClient,
  params: {
    userId: string;
    type: CreditNotificationType;
    title: string;
    message: string;
    link?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const link = params.link ?? (await rewardsPath(admin, params.userId));
    const { error } = await admin.from('notifications').insert({
      user_id: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      link,
      is_read: false,
      metadata: params.metadata ?? null,
    });
    if (error) console.error(`[credits/notify] ${params.type} insert failed:`, error.message);
  } catch (e) {
    console.error('[credits/notify] threw:', e);
  }
}

/** "You earned …" copy, honest about a hold period. */
export function rewardMessage(creditValueTtd: number, rewards: number, holdDays: number): string {
  const value = `TT$${(creditValueTtd * rewards).toFixed(2)}`;
  return holdDays > 0
    ? `${value} in credits is on its way. It becomes spendable in ${holdDays} day${holdDays === 1 ? '' : 's'}.`
    : `${value} in credits has been added to your wallet.`;
}

export function firstNameAndInitial(fullName: string | null | undefined): string {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'A friend';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
