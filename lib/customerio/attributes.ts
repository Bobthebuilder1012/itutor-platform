// =====================================================
// PROFILE -> CUSTOMER.IO ATTRIBUTES
// =====================================================
// One pure function, deliberately isolated: this mapping decides what personal
// data leaves the platform, so it should be reviewable in a single screen
// without reading any transport or scheduling code around it.
//
// Adding an attribute is cheap. Removing one is not — Customer.io keeps
// attributes on the profile after you stop sending them, and segments built on
// a removed attribute go quietly wrong rather than erroring.
//
// THE INPUT IS A VIEW, NOT THE PROFILES TABLE. customerio_profiles_v1
// (migration 259) flattens the activation facts that live on groups,
// enrolments and parent links into one row per customer. Reading them here
// individually would mean four more round trips per profile and a different
// answer depending on which ones happened to succeed.

import { createHash } from 'crypto';

/**
 * One row of public.customerio_profiles_v1.
 *
 * Every field is a column of that view, which is created by a migration
 * shipped alongside this file — so unlike a hand-written list of `profiles`
 * columns, the two cannot drift without the migration failing first.
 */
export interface CustomerIoProfileRow {
  customer_id: string;
  email: string;

  first_name?: string | null;
  full_name?: string | null;
  display_name?: string | null;
  username?: string | null;
  phone_number?: string | null;

  /** profiles.role. NULL for profiles that never chose one. */
  account_type?: string | null;

  marketing_consent?: boolean | null;
  marketing_consent_at?: string | null;
  marketing_consent_source?: string | null;
  terms_accepted?: boolean | null;

  created_at?: string | null;
  updated_at?: string | null;
  /**
   * Latest change to ANYTHING synced for this customer, including facts on
   * other tables. This — not updated_at — is what the sync watermark stores.
   */
  activation_updated_at?: string | null;

  country?: string | null;
  region?: string | null;
  school?: string | null;
  education_level?: string | null;
  form_level?: string | null;
  teaching_levels?: string[] | null;
  subjects_of_study?: string[] | null;
  tutor_type?: string | null;
  teaching_mode?: string | null;
  billing_mode?: string | null;
  tutor_verification_status?: string | null;
  rating_average?: number | null;
  rating_count?: number | null;
  signup_ref?: string | null;
  first_touch?: Record<string, unknown> | null;
  is_suspended?: boolean | null;
  is_dev_account?: boolean | null;

  primary_subject?: string | null;
  tutor_subject_names?: string[] | null;

  profile_complete?: boolean | null;

  classes_joined_count?: number | null;

  child_id?: string | null;
  child_name?: string | null;
  child_level?: string | null;
  child_primary_subject?: string | null;
  child_classes_joined_count?: number | null;
  children_count?: number | null;

  classes_created_count?: number | null;
  published_classes_count?: number | null;

  first_class_id?: string | null;
  first_class_name?: string | null;
  class_has_schedule?: boolean | null;
  class_has_start_date?: boolean | null;
  class_has_banner?: boolean | null;
  class_first_session_at?: string | null;
  class_next_session_at?: string | null;
  class_end_date?: string | null;

  last_viewed_class_id?: string | null;
  last_viewed_class_name?: string | null;
  last_viewed_tutor_name?: string | null;
  last_viewed_subject?: string | null;
  last_class_viewed_at?: string | null;
}

/**
 * What the mapping needs that the row cannot supply.
 *
 * The database does not know NEXT_PUBLIC_APP_URL, and hardcoding an origin in
 * a migration would send production links from every preview branch, fixable
 * only by another migration. So class URLs are composed here.
 */
export interface AttributeContext {
  appUrl: string;
}

/** Customer.io stores timestamps as unix seconds; an ISO string sorts wrong. */
function toUnixSeconds(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

/** Drop undefined so we never overwrite a populated attribute with a blank. */
function compact(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Trim a trailing slash so the composed URLs never contain a double one. */
function classUrl(appUrl: string, groupId: string): string {
  return `${appUrl.replace(/\/+$/, '')}/student/explore/${groupId}`;
}

export function buildCustomerAttributes(
  row: CustomerIoProfileRow,
  ctx: AttributeContext
): Record<string, unknown> {
  // Tutors carry their teaching subjects, everyone else their study subjects.
  // Flattened to one `subjects` attribute so a single segment can target a
  // subject regardless of role.
  const subjects =
    row.account_type === 'tutor'
      ? row.tutor_subject_names ?? undefined
      : row.subjects_of_study ?? undefined;

  return compact({
    email: row.email,
    // Customer.io treats `id` as the identifier; sending it as an attribute too
    // keeps the Supabase UUID visible when reading a profile in their UI.
    id: row.customer_id,

    first_name: row.first_name ?? undefined,
    full_name: row.full_name ?? undefined,
    username: row.username ?? undefined,
    phone: row.phone_number ?? undefined,

    role: row.account_type ?? undefined,
    country: row.country ?? undefined,
    region: row.region ?? undefined,
    school: row.school ?? undefined,
    grade_level: row.education_level ?? undefined,
    subjects: subjects && subjects.length > 0 ? subjects : undefined,

    teaching_levels:
      row.teaching_levels && row.teaching_levels.length > 0 ? row.teaching_levels : undefined,
    tutor_type: row.tutor_type ?? undefined,
    teaching_mode: row.teaching_mode ?? undefined,
    tutor_verification_status: row.tutor_verification_status ?? undefined,
    rating_average: row.rating_average ?? undefined,
    rating_count: row.rating_count ?? undefined,

    // A child on parent_required billing cannot buy anything themselves, so a
    // "complete your purchase" campaign must be able to exclude them.
    billing_mode: row.billing_mode ?? undefined,

    // Suspended and dev accounts are sent as attributes rather than withheld,
    // so a campaign can exclude them by segment. Withholding the row instead
    // would make an unsuspension invisible to Customer.io until the next edit.
    is_suspended: row.is_suspended ?? false,
    is_dev_account: row.is_dev_account ?? false,

    signup_ref: row.signup_ref ?? undefined,
    utm_source: (row.first_touch?.utm_source as string | undefined) ?? undefined,
    utm_campaign: (row.first_touch?.utm_campaign as string | undefined) ?? undefined,

    created_at: toUnixSeconds(row.created_at),
    profile_updated_at: toUnixSeconds(row.updated_at),

    // ---------------------------------------------------------------
    // ACTIVATION STATE
    // ---------------------------------------------------------------
    // These are the attributes every ladder's "send only if" test reads, and
    // they are the reason compact()'s drop-undefined rule must NOT apply to
    // them. A nudge that fires on `classes_created_count = 0` has to match a
    // tutor who has none — and when a tutor archives their last class the
    // count must be able to come back DOWN to zero. `?? undefined` would leave
    // the old value standing in Customer.io in both cases, so every counter
    // and every boolean below carries an explicit default.
    primary_subject: row.primary_subject ?? undefined,
    profile_complete: row.profile_complete ?? false,

    classes_joined_count: row.classes_joined_count ?? 0,
    classes_created_count: row.classes_created_count ?? 0,
    published_classes_count: row.published_classes_count ?? 0,

    first_class_id: row.first_class_id ?? undefined,
    first_class_name: row.first_class_name ?? undefined,
    first_class_url: row.first_class_id ? classUrl(ctx.appUrl, row.first_class_id) : undefined,
    class_has_schedule: row.class_has_schedule ?? false,
    class_has_start_date: row.class_has_start_date ?? false,
    class_has_banner: row.class_has_banner ?? false,
    class_first_session_at: toUnixSeconds(row.class_first_session_at),
    class_next_session_at: toUnixSeconds(row.class_next_session_at),

    // The parent block stays undefined when there is no child. Sending 0 for
    // child_classes_joined_count instead would make a childless tutor look
    // like a parent whose child has joined nothing — and that is exactly the
    // segment the Day-3 parent nudge targets.
    child_id: row.child_id ?? undefined,
    child_name: row.child_name ?? undefined,
    child_level: row.child_level ?? undefined,
    child_primary_subject: row.child_primary_subject ?? undefined,
    child_classes_joined_count: row.child_id
      ? row.child_classes_joined_count ?? 0
      : undefined,
    children_count: row.children_count ?? undefined,

    last_viewed_class_id: row.last_viewed_class_id ?? undefined,
    last_viewed_class_name: row.last_viewed_class_name ?? undefined,
    last_viewed_class_url: row.last_viewed_class_id
      ? classUrl(ctx.appUrl, row.last_viewed_class_id)
      : undefined,
    last_viewed_tutor_name: row.last_viewed_tutor_name ?? undefined,
    last_viewed_subject: row.last_viewed_subject ?? undefined,
    last_class_viewed_at: toUnixSeconds(row.last_class_viewed_at),

    // ---------------------------------------------------------------
    // CONSENT
    // ---------------------------------------------------------------
    // `unsubscribed` is a Customer.io reserved attribute: setting it true stops
    // every campaign for that profile. Mapping our own marketing preference
    // onto it means consent is enforced by Customer.io itself rather than by
    // each campaign author remembering to add a filter.
    //
    // Only sent when consent is explicitly false. Sending `false` for a user
    // who has no recorded preference would resurrect anyone who had
    // unsubscribed via Customer.io's own footer link on the next sync.
    unsubscribed: row.marketing_consent === false ? true : undefined,
    marketing_opt_in: row.marketing_consent ?? undefined,
    marketing_consent_source: row.marketing_consent_source ?? undefined,
  });
}

/**
 * Stable hash of an attribute payload, used as the skip check in the
 * reconciler. Keys are sorted because JSON.stringify preserves insertion order
 * and an unsorted hash would churn every time the mapping above is reordered.
 */
export function hashAttributes(attributes: Record<string, unknown>): string {
  const sorted = Object.keys(attributes)
    .sort()
    .map(key => [key, attributes[key]]);
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex').slice(0, 32);
}

/**
 * The relation the sync reads. A view, so `select('*')` is safe here in a way
 * it never was against `profiles`: the column list is fixed by migration 259
 * and cannot acquire a surprise, and buildCustomerAttributes above remains an
 * explicit allowlist, so a column added to the view cannot leak by accident.
 */
export const CUSTOMERIO_PROFILE_VIEW = 'customerio_profiles_v1';
