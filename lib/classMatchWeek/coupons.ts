/**
 * Campaign coupon issuance and reads, on top of `group_promotions`
 * (migrations 231 + 233).
 *
 * A campaign coupon is a `kind = 'personal-coupon'` row scoped to one user —
 * the table CHECK enforces that a personal coupon always has an owner, and
 * the checkout resolver plus RLS already scope reads to that owner, so a
 * coupon issued to one attendee produces no discount for anyone else.
 *
 * The monthly price is SNAPSHOTTED onto the row at issue (docs 03 §3.4):
 * the savings figure quoted to the family must not drift when a teacher
 * edits `groups.price_monthly` mid-week. The live price is only a fallback
 * for reads of rows that predate the snapshot column.
 *
 * Service client first argument, as everywhere in lib/classMatchWeek —
 * callers authenticate, these helpers just read and write.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClassMatchSession } from './types';

/** What the dashboards render for one coupon. */
export type UserCoupon = {
  id: string;
  groupId: string;
  groupName: string;
  teacherName: string;
  discount: number;
  expiresAt: string | null;
  redeemedAt: string | null;
  priceDurationMonths: number | null;
  /** TT$ saved over the discounted months; null when the class has no price. */
  savingsValue: number | null;
};

/**
 * Issue the join-click coupon for a session, idempotently.
 *
 * If the user already holds an active, unredeemed personal coupon for this
 * session's class, that row is returned untouched — clicking the join link
 * twice, or joining two tasters for the same class, must not stack coupons.
 * Otherwise a new personal-coupon row is inserted with the session's terms
 * and `expires_at` resolved from the teacher's redemption window.
 *
 * Throws on write failure — the join route deliberately catches and
 * swallows, because a family standing at the classroom door beats a
 * bookkeeping write.
 */
export async function issueCouponForJoin(
  admin: SupabaseClient,
  args: { session: ClassMatchSession; userId: string }
): Promise<{ coupon: any; alreadyExisted: boolean }> {
  const { session, userId } = args;

  const { data: existing } = await admin
    .from('group_promotions')
    .select('*')
    .eq('kind', 'personal-coupon')
    .eq('user_id', userId)
    .eq('group_id', session.group_id)
    .eq('active', true)
    .is('redeemed_at', null)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) return { coupon: existing, alreadyExisted: true };

  // Snapshot the class's monthly price at issue time. Null price is allowed —
  // the coupon still exists, the savings figure just cannot be quoted.
  const { data: group } = await admin
    .from('groups')
    .select('price_monthly')
    .eq('id', session.group_id)
    .maybeSingle();

  const expiresAt = new Date(
    Date.now() + session.redemption_window_days * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: coupon, error } = await admin
    .from('group_promotions')
    .insert({
      group_id: session.group_id,
      tutor_id: session.tutor_id,
      // The CHECK requires kind='personal-coupon' <=> user_id set; these two
      // fields move together or the insert is rejected.
      kind: 'personal-coupon',
      user_id: userId,
      discount: session.discount_percent,
      active: true,
      expires_at: expiresAt,
      price_duration_months: session.price_duration_months,
      price_monthly_snapshot: (group as { price_monthly: number | null } | null)?.price_monthly ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return { coupon, alreadyExisted: false };
}

/**
 * Every personal coupon a user holds — redeemed and expired included, so the
 * dashboard can show "used" and "expired" states rather than rows vanishing.
 * Newest first.
 *
 * `savingsValue` is (snapshot price ?? live price) × discount% ×
 * price_duration_months — the full amount saved over the discounted period.
 * Null when neither price exists or the price is 0: a class with no price
 * renders no money line, never "TT$0 saved" and never the word Free.
 */
export async function listUserCoupons(
  admin: SupabaseClient,
  userId: string
): Promise<UserCoupon[]> {
  const { data: promoData } = await admin
    .from('group_promotions')
    .select('*')
    .eq('kind', 'personal-coupon')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const promos = (promoData ?? []) as Array<{
    id: string;
    group_id: string;
    tutor_id: string;
    discount: number;
    expires_at: string | null;
    redeemed_at: string | null;
    price_duration_months: number | null;
    price_monthly_snapshot: number | null;
  }>;
  if (promos.length === 0) return [];

  const groupIds = [...new Set(promos.map((p) => p.group_id))];
  const tutorIds = [...new Set(promos.map((p) => p.tutor_id))];

  const [{ data: groupData }, { data: profileData }] = await Promise.all([
    admin.from('groups').select('id, name, price_monthly').in('id', groupIds),
    admin.from('profiles').select('id, display_name, full_name').in('id', tutorIds),
  ]);

  const groupById = new Map(
    ((groupData ?? []) as Array<{ id: string; name: string; price_monthly: number | null }>).map(
      (g) => [g.id, g]
    )
  );
  const teacherNameById = new Map(
    (
      (profileData ?? []) as Array<{
        id: string;
        display_name: string | null;
        full_name: string | null;
      }>
    ).map((p) => [p.id, p.display_name || p.full_name || 'iTutor teacher'])
  );

  return promos.map((p) => {
    const group = groupById.get(p.group_id);
    const price = p.price_monthly_snapshot ?? group?.price_monthly ?? null;
    const months = p.price_duration_months ?? null;
    const savingsValue =
      price && price > 0 && months
        ? Math.round(price * (p.discount / 100) * months * 100) / 100
        : null;
    return {
      id: p.id,
      groupId: p.group_id,
      groupName: group?.name ?? '',
      teacherName: teacherNameById.get(p.tutor_id) ?? 'iTutor teacher',
      discount: p.discount,
      expiresAt: p.expires_at,
      redeemedAt: p.redeemed_at,
      priceDurationMonths: months,
      savingsValue,
    };
  });
}
