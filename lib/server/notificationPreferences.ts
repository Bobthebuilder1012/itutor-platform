// Notification preferences — handover §10.6.
//
// WHICH CHANNELS ARE ACTUALLY SUPPRESSIBLE
// §10.6 names two channels, push and email. The in-app list is a third thing and
// is deliberately NOT suppressible: the design's own wording is "everything stays
// visible in this list either way". A parent who muted approval outcomes and then
// cannot find out what happened to a request has lost the record, not the noise.
// So notifyInApp always writes, and only push and email consult preferences.
//
// WHAT IS NOT A CATEGORY IS NOT SUPPRESSIBLE
// The six categories are exactly the things the platform sends. Anything outside
// them — currently the §7 self-pay security alert — always sends, by
// construction rather than by an exception list. That alert tells a parent
// someone may have used their account; a preference set months earlier must not
// silence it.
//
// Three categories §10.6 explicitly rules out are absent: digest (§21 — none
// exists), attendance (§6 — no email, no push) and parent session reminders
// (§22 — student and tutor only). Offering a switch for a channel that does not
// exist is a lie told by a checkbox.

import type { SupabaseClient } from '@supabase/supabase-js';

export const NOTIFICATION_CATEGORIES = [
  {
    key: 'booking_request',
    label: 'Booking requests',
    detail: 'A child asks to join a class',
  },
  {
    key: 'approval_outcome',
    label: 'Approval outcomes',
    detail: 'Approved, declined or expired',
  },
  { key: 'payment', label: 'Payments', detail: 'Charges, failures and refunds' },
  {
    key: 'feedback_received',
    label: 'Feedback received',
    detail: 'A tutor files feedback',
  },
  {
    key: 'feedback_requested',
    label: 'Feedback requested',
    detail: 'Someone asks a tutor for an update',
  },
  {
    key: 'subscription',
    label: 'Subscription changes',
    detail: 'Paused, resumed or cancelled',
  },
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]['key'];
export type NotificationChannel = 'push' | 'email';

const CATEGORY_KEYS = NOTIFICATION_CATEGORIES.map((c) => c.key) as readonly string[];

export function isCategory(value: string): value is NotificationCategory {
  return CATEGORY_KEYS.includes(value);
}

/**
 * Maps a notifications.type to its preference category.
 *
 * Types absent from this map are intentionally unsuppressible. Adding a type
 * here is what makes it mutable, so the decision is explicit at the point of
 * adding rather than implied by a default.
 */
export const TYPE_TO_CATEGORY: Record<string, NotificationCategory> = {
  parent_approval_request: 'booking_request',
  booking_request: 'booking_request',
  parent_approval_outcome: 'approval_outcome',
  booking_confirmed: 'approval_outcome',
  booking_declined: 'approval_outcome',
  seat_unavailable_refunded: 'payment',
  payment_succeeded: 'payment',
  payment_failed: 'payment',
  payment_refunded: 'payment',
  new_feedback: 'feedback_received',
  feedback_requested: 'feedback_requested',
  subscription_payment_succeeded: 'subscription',
  subscription_grace_started: 'subscription',
  subscription_suspended: 'subscription',
  subscription_cancellation_scheduled: 'subscription',
  subscription_cancellation_finalized: 'subscription',
  subscription_reactivation: 'subscription',
  // Deliberately NOT mapped: self_pay_security_alert and anything else about
  // account security.
};

/**
 * Should this send on this channel?
 *
 * Defers to the SQL function so the rule has one definition — the send paths are
 * split between application code and database-side jobs, and two copies of "is
 * this muted" is how a parent ends up muted in one place and not the other.
 * Fails OPEN: an unreadable preference must not silently stop a parent being
 * told their child asked to join a class.
 */
export async function shouldNotify(
  admin: SupabaseClient,
  params: {
    userId: string;
    category: string;
    channel: NotificationChannel;
    /** Set for anything about a specific child, so per-child mutes apply. */
    childId?: string | null;
  }
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc('should_notify', {
      p_user_id: params.userId,
      p_category: params.category,
      p_channel: params.channel,
      p_child_id: params.childId ?? null,
    });
    if (error) {
      console.error('[notificationPreferences] should_notify failed:', error.message);
      return true;
    }
    return data !== false;
  } catch (e) {
    console.error('[notificationPreferences] should_notify threw:', e);
    return true;
  }
}

/** Convenience for send paths that only know the notification type. */
export async function shouldNotifyForType(
  admin: SupabaseClient,
  params: {
    userId: string;
    type: string;
    channel: NotificationChannel;
    childId?: string | null;
  }
): Promise<boolean> {
  const category = TYPE_TO_CATEGORY[params.type];
  // Unmapped type = not a category = always sends.
  if (!category) return true;
  return shouldNotify(admin, { ...params, category });
}

// ---------------------------------------------------------------------------
// Reading and writing, for the preferences screen
// ---------------------------------------------------------------------------

export type PreferenceMatrix = Record<
  NotificationCategory,
  { push: boolean; email: boolean }
>;

export function defaultMatrix(): PreferenceMatrix {
  const out = {} as PreferenceMatrix;
  for (const c of NOTIFICATION_CATEGORIES) out[c.key] = { push: true, email: true };
  return out;
}

/**
 * The current state, built from defaults down. Absence of a row is "on", so this
 * starts everything enabled and only turns off what has been explicitly stored.
 */
export async function getPreferences(
  admin: SupabaseClient,
  userId: string
): Promise<{ matrix: PreferenceMatrix; mutes: Array<{ childId: string; category: NotificationCategory }> }> {
  const matrix = defaultMatrix();

  const { data: prefRows } = await admin
    .from('notification_preferences')
    .select('category, channel, enabled')
    .eq('user_id', userId);

  for (const r of (prefRows ?? []) as unknown as Array<{
    category: string;
    channel: NotificationChannel;
    enabled: boolean;
  }>) {
    if (isCategory(r.category) && (r.channel === 'push' || r.channel === 'email')) {
      matrix[r.category][r.channel] = r.enabled;
    }
  }

  const { data: muteRows } = await admin
    .from('notification_child_mutes')
    .select('child_id, category')
    .eq('parent_id', userId);

  const mutes = ((muteRows ?? []) as unknown as Array<{ child_id: string; category: string }>)
    .filter((m) => isCategory(m.category))
    .map((m) => ({ childId: m.child_id, category: m.category as NotificationCategory }));

  return { matrix, mutes };
}

export async function setPreference(
  admin: SupabaseClient,
  params: {
    userId: string;
    category: NotificationCategory;
    channel: NotificationChannel;
    enabled: boolean;
  }
): Promise<{ ok: boolean; reason?: string }> {
  const { error } = await admin.from('notification_preferences').upsert(
    {
      user_id: params.userId,
      category: params.category,
      channel: params.channel,
      enabled: params.enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,category,channel' }
  );
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function setChildMute(
  admin: SupabaseClient,
  params: {
    parentId: string;
    childId: string;
    category: NotificationCategory;
    muted: boolean;
  }
): Promise<{ ok: boolean; reason?: string }> {
  if (params.muted) {
    const { error } = await admin.from('notification_child_mutes').upsert(
      { parent_id: params.parentId, child_id: params.childId, category: params.category },
      { onConflict: 'parent_id,child_id,category' }
    );
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  }

  const { error } = await admin
    .from('notification_child_mutes')
    .delete()
    .eq('parent_id', params.parentId)
    .eq('child_id', params.childId)
    .eq('category', params.category);

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
