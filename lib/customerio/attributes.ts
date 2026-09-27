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

import { createHash } from 'crypto';

/** The profiles columns this mapping reads. */
export interface SyncableProfile {
  id: string;
  email: string;
  role?: string | null;
  full_name?: string | null;
  display_name?: string | null;
  username?: string | null;
  country?: string | null;
  region?: string | null;
  school?: string | null;
  form_level?: string | null;
  subjects_of_study?: string[] | null;
  teaching_levels?: string[] | null;
  tutor_type?: string | null;
  teaching_mode?: string | null;
  billing_mode?: string | null;
  tutor_verification_status?: string | null;
  is_suspended?: boolean | null;
  is_dev_account?: boolean | null;
  rating_average?: number | null;
  rating_count?: number | null;
  phone_number?: string | null;
  signup_ref?: string | null;
  first_touch?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;

  /**
   * NOT a profiles column on this database. The Profile TypeScript interface
   * declares it and migration 226 defines it, but it has never been applied —
   * `notification_preferences` exists nowhere in the public schema. It stays
   * optional here so the consent mapping below is ready the day 226 lands,
   * and it is deliberately absent from PROFILE_SYNC_COLUMNS, because naming a
   * non-existent column in a PostgREST select fails the entire query.
   */
  notification_preferences?: {
    lessons: boolean;
    reminders: boolean;
    marketing: boolean;
    sms: boolean;
  } | null;
}

/**
 * Facts that do not live on the profiles row and must be fetched alongside it.
 */
export interface ProfileExtras {
  /**
   * A tutor's subject names, from the tutor_subjects join table. `tutor_subjects`
   * is a table, not a profiles column — the Profile interface's array field of
   * that name has no database backing.
   */
  tutorSubjects?: string[] | null;
}

/**
 * Pull subject names out of a PostgREST embedded `subjects(name)` selection.
 *
 * Accepts both an object and an array. tutor_subjects -> subjects is many-to-one
 * so PostgREST returns a single object, but the untyped client infers an array,
 * and the two disagree — a cast picking either one would be a guess that fails
 * silently by yielding no subjects at all. Handling both is cheaper than being
 * wrong, and survives a future generated-types change.
 */
export function subjectNamesFrom(embedded: unknown): string[] {
  const candidates = Array.isArray(embedded) ? embedded : [embedded];
  const names: string[] = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const name = (candidate as { name?: unknown }).name;
    if (typeof name === 'string' && name.length > 0) names.push(name);
  }

  return names;
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

export function buildCustomerAttributes(
  profile: SyncableProfile,
  extras: ProfileExtras = {}
): Record<string, unknown> {
  const prefs = profile.notification_preferences;

  // Tutors carry their teaching subjects, everyone else their study subjects.
  // Flattened to one `subjects` attribute so a single segment can target a
  // subject regardless of role.
  const subjects =
    profile.role === 'tutor'
      ? extras.tutorSubjects ?? undefined
      : profile.subjects_of_study ?? undefined;

  return compact({
    email: profile.email,
    // Customer.io treats `id` as the identifier; sending it as an attribute too
    // keeps the Supabase UUID visible when reading a profile in their UI.
    id: profile.id,

    first_name: profile.display_name ?? profile.full_name?.split(' ')[0] ?? undefined,
    full_name: profile.full_name ?? undefined,
    username: profile.username ?? undefined,
    phone: profile.phone_number ?? undefined,

    role: profile.role ?? undefined,
    country: profile.country ?? undefined,
    region: profile.region ?? undefined,
    school: profile.school ?? undefined,
    grade_level: profile.form_level ?? undefined,
    subjects: subjects && subjects.length > 0 ? subjects : undefined,

    teaching_levels:
      profile.teaching_levels && profile.teaching_levels.length > 0
        ? profile.teaching_levels
        : undefined,
    tutor_type: profile.tutor_type ?? undefined,
    teaching_mode: profile.teaching_mode ?? undefined,
    tutor_verification_status: profile.tutor_verification_status ?? undefined,
    rating_average: profile.rating_average ?? undefined,
    rating_count: profile.rating_count ?? undefined,

    // A child on parent_required billing cannot buy anything themselves, so a
    // "complete your purchase" campaign must be able to exclude them.
    billing_mode: profile.billing_mode ?? undefined,

    // Suspended and dev accounts are sent as attributes rather than withheld,
    // so a campaign can exclude them by segment. Withholding the row instead
    // would make an unsuspension invisible to Customer.io until the next edit.
    is_suspended: profile.is_suspended ?? false,
    is_dev_account: profile.is_dev_account ?? false,

    signup_ref: profile.signup_ref ?? undefined,
    utm_source: (profile.first_touch?.utm_source as string | undefined) ?? undefined,
    utm_campaign: (profile.first_touch?.utm_campaign as string | undefined) ?? undefined,

    created_at: toUnixSeconds(profile.created_at),
    profile_updated_at: toUnixSeconds(profile.updated_at),

    // `unsubscribed` is a Customer.io reserved attribute: setting it true stops
    // every campaign for that profile. Mapping our own marketing preference
    // onto it means consent is enforced by Customer.io itself rather than by
    // each campaign author remembering to add a filter.
    //
    // Only sent when the preference is explicitly false. Sending `false` for a
    // user who has no recorded preference would resurrect anyone who had
    // unsubscribed via Customer.io's own footer link on the next sync.
    unsubscribed: prefs?.marketing === false ? true : undefined,
    marketing_opt_in: prefs?.marketing ?? undefined,
    sms_opt_in: prefs?.sms ?? undefined,
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
 * Columns the sync selects. Kept beside the mapping so the two cannot drift.
 *
 * Every name here is verified to exist on public.profiles. PostgREST fails the
 * WHOLE query on one unknown column, so an aspirational entry does not degrade
 * gracefully — it takes the entire sync down. Two fields the Profile interface
 * advertises are deliberately absent:
 *   - tutor_subjects: a join table, fetched separately (see ProfileExtras)
 *   - notification_preferences: migration 226 was never applied here
 */
export const PROFILE_SYNC_COLUMNS = [
  'id',
  'email',
  'role',
  'full_name',
  'display_name',
  'username',
  'country',
  'region',
  'school',
  'form_level',
  'subjects_of_study',
  'teaching_levels',
  'tutor_type',
  'teaching_mode',
  'billing_mode',
  'tutor_verification_status',
  'is_suspended',
  'is_dev_account',
  'rating_average',
  'rating_count',
  'phone_number',
  'signup_ref',
  'first_touch',
  'created_at',
  'updated_at',
].join(', ');
