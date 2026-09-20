# Customer.io onboarding & activation — handoff

What the platform now sends, what it is called, and the places the original
brief and this database disagree. Everything below is live in code on
`feat/customerio-activation`; the campaign side is not built.

---

## 1. Identity

`customer_id` is the Supabase auth UUID (`profiles.id`), never the email. An
email change must not create a second profile, and every event below is keyed
the same way.

## 2. Profile attributes

Synced by `/api/cron/sync-customerio` (every 5 minutes) from the view
`public.customerio_profiles_v1`. Use these names in segments.

**Identity and contact:** `email`, `id`, `first_name`, `full_name`, `username`,
`phone`

**Role and context:** `role` (`tutor` | `student` | `parent` | `admin`, and
**may be null**), `country`, `region`, `school`, `grade_level`, `subjects`,
`teaching_levels`, `tutor_type`, `teaching_mode`,
`tutor_verification_status`, `rating_average`, `rating_count`,
`billing_mode`, `is_suspended`, `is_dev_account`

**Attribution:** `signup_ref`, `utm_source`, `utm_campaign`, `created_at`,
`profile_updated_at`

**Activation — what the ladders branch on:**

| Attribute | Meaning |
|---|---|
| `profile_complete` | Per role; rules in §5 |
| `primary_subject` | Teaching subject for tutors, study subject otherwise |
| `classes_joined_count` | Distinct classes where the person holds a real seat |
| `classes_created_count` | Non-archived classes they own |
| `published_classes_count` | Of those, published |
| `first_class_id` / `_name` / `_url` | Their first class, published ranked above draft |
| `class_has_schedule` | That class has sessions defined |
| `class_has_start_date` | That class has a first date — see §4 |
| `class_has_banner` | That class has a cover image |
| `class_first_session_at` / `class_next_session_at` | Unix seconds |
| `child_id` / `child_name` / `child_level` / `child_primary_subject` | Parent's primary child — oldest link |
| `child_classes_joined_count` | **Absent** when there is no child, never `0` |
| `children_count` | So a two-child parent is not treated as a one-child parent |
| `last_viewed_class_id` / `_name` / `_url` / `last_viewed_tutor_name` / `last_viewed_subject` / `last_class_viewed_at` | Most recent class view |

**Consent:** `marketing_opt_in`, `marketing_consent_source`, and the reserved
`unsubscribed`, which is set to `true` **only** when consent is explicitly
withdrawn. It is never sent as `false`, so someone who unsubscribed through
Customer.io's own footer is not resurrected by the next sync.

Counters and booleans are always sent, including zeros — a nudge conditioned on
`classes_created_count = 0` has to match a tutor who has none, and an archived
last class has to be able to take the count back down.

## 3. Events

| Event | Fires when | Props |
|---|---|---|
| `signup_completed` | Account created, both email and Google | `role` |
| `class_created` | A tutor's class row is committed | `group_id`, `subject`, `pricing_model`, `status` |
| `class_joined` | A real seat exists | `group_id`, `tutor_id`, `subject`, `membership`, `seat_source`, `is_paid`, `on_behalf_of` |
| `class_viewed` | A signed-in person opens a class page | `group_id`, `tutor_id`, `subject` |

**"Account Created" is `signup_completed`** — it already existed and already
forwarded. There is no second event for it.

**There is no `class_published` event.** "Created but not published" is
`classes_created_count > 0 AND published_classes_count = 0`, which is an
attribute test — and the brief's own rule is that a nudge re-checks the target
action immediately before sending, so an attribute is the better trigger.

`class_joined.membership` is `enrolled` or **`pending`**. A request awaiting
tutor approval is not an activation and does not count toward
`classes_joined_count`; the student ladder must branch on this, not assume
every `class_joined` means a seat.

`seat_source` is one of `free_join`, `tutor_approval`, `tutor_invite`,
`parent_approval`, `parent_enrol`, `subscription`, `secure_spot`, `cash`.

### Dedupe

Every event carries a server-minted `dedupe_key` enforced by a unique index, so
a retried request or a redelivered Stripe webhook cannot double-count.
`class_viewed` uses a 30-minute bucket, so refreshing a class page does not
re-trigger anything. The key is stripped before the event reaches Customer.io.

**`class_viewed` fires for signed-in users only.** Anonymous marketplace
traffic — which is most of it — cannot be deduped (the index is keyed on user)
and cannot be mailed, so it is recorded internally and not forwarded.

## 4. Where the brief and this platform disagree

Worth settling before the email copy is written.

1. **`class_has_start_date`.** There is deliberately no `groups.start_date`;
   migration 204 says so explicitly. It reads `group_sessions.starts_on`
   instead, so the Day-5 nudge means "add a schedule with a first date".

2. **The tutor ladder's Day-4 and Day-5 are in the wrong order for this
   product.** Publishing a class already requires at least one session — the
   publish endpoint refuses otherwise. So "published but no schedule" is
   unreachable, and a Day-5 "add your schedule" step placed after a Day-4
   "publish" step can never fire. Either swap them, or drop Day-5 and let
   `class_has_start_date` carry it.

3. **`last_active_at` does not exist** and there is no sessions table. Do not
   build a dormancy campaign on it. The nearest honest signal is the last
   recorded product event.

4. **`education_level`** is `form_level` here; for tutors it falls back to
   their first teaching level.

5. **A parent has one `child_*` block, not many.** There is no "primary child"
   in the data, so it is the oldest link. Both parents currently on staging
   have two children, so `children_count` is there to stop a two-child parent
   being addressed as though they had one. Genuine per-child messaging needs an
   event carrying `child_id`, not an attribute.

6. **`role` can be null** (three profiles today) and can be `admin`. Neither
   belongs in any of the three ladders — exclude them explicitly rather than
   relying on a default branch.

7. **`last_viewed_class_*` cannot be backfilled.** No view tracking existed
   before this work, so these are empty for all existing customers and fill
   only from launch onward.

8. **Marketing consent is new.** Existing accounts were backfilled to `true`
   on the basis that they are customers of a service they signed up for;
   `marketing_consent_source` distinguishes that from an explicit answer given
   on the signup form. There is no inbound webhook, so an unsubscribe made
   inside Customer.io stays in Customer.io and is not written back here.

## 5. `profile_complete` — confirm these

Product rules, not facts. They are the definition the view ships with:

- **Tutor:** has a bio, an avatar, and at least one subject
- **Student:** has a form level, and at least one subject
- **Parent:** has at least one linked child
- **Admin / no role:** always `false`

## 6. Before anything is switched on

- Automations stay **Draft** until the rendered emails are approved.
- The first live run must have `CUSTOMERIO_ALLOWED_EMAILS` set to a single
  inbox. Staging is a branch of production and holds ~300 real customer
  addresses; enabling with an empty allowlist loads all of them into a tool
  that can mail them.
- **Then read the note in `lib/customerio/sync.ts` about clearing the
  allowlist.** Running with it set marks every other profile as already
  delivered, and simply removing it later does not bring them back.
- The Track API key currently in `.env.local` was shared in plaintext and
  should be rotated before go-live.
