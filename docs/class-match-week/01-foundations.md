# Part 1 — Foundations and teacher supply

**Spec reference:** v2 sections 11, 12, 15
**Depends on:** nothing
**Blocks:** every other phase

---

## Why this is first

**Nothing downstream can be tested without sessions.** The matching engine, the
results page and the reservation flow all need real sessions in the database.

**Teachers need lead time in the real world.** Sessions are created by people who
must be persuaded to schedule something. That runs on a calendar, not a sprint.

**And the catalogue is thin.** Eleven eligible teachers, twenty-one eligible
classes, thirteen of them matchable. Every additional class published before the
week materially changes what the campaign can offer.

---

## 1.1 Data model

### A Class Match Week session is a one-off, and gets its own table

**This resolves an ambiguity that would otherwise split §1.3, §1.5 and §1.6
three different ways.**

The existing schedule model is split across two tables and neither fits:

| | Rows | Has | Lacks |
|---|---|---|---|
| `group_sessions` | 36 | duration, recurrence, link column | status, `cancelled_at` |
| `group_session_occurrences` | 1190 | status, `cancelled_at`, scheduled time | duration, link |

§1.3 needs duration and a Meet link, which exist only on the series. §1.5 needs
cancellation, which exists only on the occurrence. §1.6 built against the wrong
one returns 1190 rows instead of a teacher's handful.

**A campaign session happens once. Nothing about it recurs.** It is
occurrence-shaped, but it does not belong in `group_session_occurrences` either,
because those 1190 rows are the real class schedule and every reader of that
table — calendars, reminders, attendance, the class stream — would start picking
up campaign sessions unless each one filters.

**New table — `class_match_sessions`:**

- `group_id` — the linked published class (required)
- Title or topic
- `scheduled_at`, `duration_minutes`
- `meet_link`
- `max_attendees` (nullable — unlimited by default)
- `status` — draft, published, cancelled
- `cancelled_at`
- `created_at`, `published_at`

Duration, link, cancellation and the teacher's list all resolve against one
record. The cost is that reminder and join handling built for occurrences may
need to accept this type too — check how much of that is service-level before
duplicating any of it.

### Fields created now even though nothing writes to them until later

Adding columns later is easy; recovering data never captured is impossible.

- **Reservation**: user, session, created-at, status
- **Join click**: user, session, **timestamp**
- **Submission**: user or anonymous token, role, level, subjects, availability,
  support needed, teacher preferences

### Discount configuration (per session)

- Percentage — fixed tiers 10, 15, 20. Minimum 10.
- Qualifying classes
- Redemption window — 7 to 30 days
- Price duration — finite month count

### Coupons extend `group_promotions` — they are not a new system

An existing discount layer is already wired into checkout. Building a parallel
one would mean two discount paths through the same Stripe checkout.

**Attribution is already solved.** `group_enrollments.promotion_id` exists and is
written at checkout, so the join between discount cost and enrolment revenue
comes for free. This supersedes the earlier instruction to add an enrolment
reference to a new coupon table.

**Migration 231 (`231_group_promotions_per_user.sql`) has been written and adds:**

- `user_id` (nullable) — NULL is a promotion offered to everyone, which is every
  row that existed before; set means a personal coupon
- `expires_at` — the absolute claim deadline, resolved from `duration_days` when
  the coupon is issued. `duration_days` is the teacher's configured *window*, a
  relative value on the offer; a coupon is issued at an unpredictable moment, so
  it needs the resolved deadline stored per row
- `redeemed_at` — written by Phase 3, inert until then
- `price_duration_months` — how long the reduced price holds once enrolled, a
  different quantity from how long the coupon stays claimable. Finite by design:
  the savings figure is price × discount × months and has no answer for an
  unbounded duration
- a fourth `kind` value, `'personal-coupon'`
- `CHECK ((kind = 'personal-coupon') = (user_id IS NOT NULL))` — an owner-less
  personal coupon cannot be stored at all

### The leak this closed

The checkout resolver selected on `group_id + active` alone, took the first
applicable row, and ran on the **admin client** — so RLS did not scope it. The
read policy was `USING (active = true)` with no membership or user check. And
there was no user column at all, so a per-user coupon was not merely unfiltered,
it was inexpressible: inserted as an ordinary row it would have discounted the
class for every buyer.

**Two independent fixes were required**, because fixing RLS alone would not have
touched the admin-client path. Both have landed:

- `lib/payments/groupSubscriptionCheckout.ts` now filters by owner, expiry and
  redemption.
- Five class-badge read sites are scoped with `.is('user_id', null)` — a personal
  coupon must never render as a class-wide discount.
- The promotions GET and DELETE endpoints are scoped the same way, so a supplied
  id cannot deactivate a coupon the caller was never shown.
- The dead `get_group_promotions` RPC call was **removed** rather than created.
  It never existed in the database and always fell through to a direct query; a
  later implementation that forgot the filter would silently reopen the leak.

**Production had drifted from migration 166** — it ran a policy named "Anyone can
read active promotions" plus a duplicate tutor policy, three policies where the
file defines two. Migration 231 drops all four known names before recreating.
Anyone editing it should keep that.

---

## 1.2 Eligibility gate — resolved

```
not suspended
AND active Meet video connection
AND >=1 published class
AND that class is priced monthly
```

Reuses `is_suspended`, `tutor_video_provider_connections` and the existing class
records. No new concept required.

**Filter on `pricing_model`, not `pricing_mode`.** `pricing_model` is populated on
100% of rows; `pricing_mode` is NULL on 6 of 38 published classes. More
importantly the `GroupPricingMode` union declares
`'PER_SESSION' | 'PER_COURSE' | 'FREE'` while 29 published rows carry `MONTHLY` —
code written against that type compiles and silently matches nothing.

**Ignore the legacy `pricing` column entirely.** It is the string `'free'` on all
41 rows and nothing should read it.

### Accepted risk — unverified teachers

**Verification is deliberately not part of the gate.** Requiring it reduces the
catalogue to two teachers, which is not a campaign.

The risk is recorded plainly: **ten of the twelve gate-passing teachers are
unverified**, in a campaign whose stated purpose is establishing trust with
families new to iTutor. A poor first session damages the platform more than an
empty slot would.

Two facts bear on it. Those teachers already have published classes, so the
campaign is not exposing families to anyone they could not already encounter. And
a reviewer role and dashboard already exist, so reviewing eleven named
individuals remains available as a late intervention.

---

## 1.2b Level normalisation layer

`form_level` is not an enum. It carries two vocabularies at once — enum-style
values alongside free-text display labels with en-dashes and parenthesised age
ranges — and neither free-text value appears in the `GroupFormLevel` union.

**Both free-text values were platform-owned and no longer appear in eligible
supply.** The eligible catalogue is now `FORM_4`, `FORM_5`, `CAPE` and `FORM_1`
only. Keep the layer — the column is unconstrained and new values will arrive —
but it is no longer a headline requirement, and the `CSEC (14–16)` dual-mapping
rule has no production row to act on.

**Three rules the layer needs:**

1. **Normalise on read**, against the data rather than the TypeScript union.
2. **`CSEC (14–16)` maps to both Form 4 and Form 5** where it appears. One class
   surfacing under two level selections is correct, not a bug.
3. **An unrecognised value makes the class ineligible, and is logged.** Without
   this the layer silently drops classes and nobody finds out.

**Two traps for whoever writes it:**

- The separator in `CSEC (14–16)` and `SEA (10–12)` is **EN DASH (U+2013)**.
  A rule written with an ASCII hyphen matches zero rows. Copy literals from the
  database; never retype them. Prefer prefix matching.
- **The learner vocabulary shares no strings with the class vocabulary.**
  `profiles.form_level` for students reads `'Form 4'`, `'Form 5'`, `'Lower 6'`,
  `'Upper 6'`, `'SEA'`. Exact overlap with the class side is **zero**, and CAPE
  has no learner-side token at all. The map must be **bidirectional**, and the
  normalised level must be a set, not a scalar: `CAPE → {Lower 6, Upper 6}`.

---

## 1.2c Well-formedness check at session creation

The normalisation layer handles what can be translated. This check refuses what
is absent — no translation can invent a subject that was never entered.

**Block campaign session creation where the selected class has:**

- No subject (one eligible class currently has none)
- No `group_sessions` row, or no row with a non-empty `recurrence_days`
- No unexpired series: apply `(ends_on IS NULL OR ends_on >= current_date)`

**Do not test `start_time`.** It is `time NOT NULL` by schema, so the predicate
can never fire — naming it in the rule is dead weight that implies a guard that
does not exist. Schedulability is decided entirely by `recurrence_days` being
non-empty. Note it is never NULL either; the defect is a non-null empty array
`{}`, so a null check finds nothing.

**Say which source the check reads.** The blocked count swings between eight and
twenty-three depending on whether it means "has a recurrence pattern", "has any
session row", or "has a future occurrence".

**Message the teacher with what to fix**, and link them to the class. §1.3 has no
branch for a failure here — add one, or a blocked teacher has no way out.

That this costs supply is deliberate. A class with no schedule is broken for
paying customers too, not just for Class Match Week.

**Do not extend this check to level.** Level is the normalisation layer's job.
Note the tension with rule 3 above, and resolve it explicitly: block creation on
an *unrecognised* level, since the layer cannot handle it, but not on values the
layer resolves.

---

## 1.2d Manual catalogue audit — before the week

Twenty-one rows. It can be checked by hand, and should be.

Known issues to start from:

- One `FORM_5` class has no subject at all
- One `FORM_1` class carries the subject *CSEC Additional Mathematics* — almost
  certainly a data-entry error, and its series expired on 2026-07-03
- Eight eligible classes are not exact-match capable
- Two classes advertise a **different weekday** in `schedule_display` than their
  `recurrence_days` produce. Times match; only the day is wrong. Both pass every
  automated check, and a parent who filters on Tuesday and lands on a page saying
  Thursday is a trust failure the campaign cannot absorb.

**A presence check cannot catch any of these.** §1.2c removes exactly one class,
on subject grounds. Add a consistency check comparing the weekday word in
`schedule_display` against `recurrence_days`, and make this audit a named-owner
sign-off with an explicit accept or reject per class.

There is currently **no "excluded from campaign" field** on `groups`. State how a
rejected class is kept out.

**On leverage — filling schedule gaps does not improve coverage.** Every
unschedulable class sits at CAPE, Form 4 or Form 5, levels whose weekday cells
already have supply, so scheduling them adds no new non-zero cells. Do it because
those classes are broken for paying customers. The intervention that moves the
no-match rate is recruiting **Form 2, Form 3 and weekend supply**.

---

## 1.3 Session creation flow

1. Select one of their published, monthly-priced classes — subject to §1.2c
2. Add the session title or topic
3. Set date, start time and end time
4. Meet link is generated — **name the column, see below**
5. Optionally set a maximum number of attendees
6. Configure the discount
7. Publish

**Inherited automatically, never re-entered:** teacher name, teacher image,
subject, student level, regular class day and time, class price, teacher profile,
paid-class enrolment link.

### Meet links are per-series and lazy — this is not free

`lib/services/videoProviders.ts` is the **1:1** path. Group classes use
`lib/services/groupMeetingLink.ts`: **one link per series, minted lazily on first
join, cached 30 days**. The existing creation endpoint writes no meeting fields.
Production: `group_sessions.meeting_join_url` is NULL on **36 of 36** rows;
`groups.meeting_link` is populated on only six eligible classes.

**Phase 1.3 must name the column it writes**, because the two choices fail
differently:

- Writing `group_sessions.meeting_join_url` alone leaves the reminder email's
  join link null for every class with no `groups.meeting_link` — the cron reads
  only the class-level column and otherwise falls back to a generic page.
- Writing `groups.meeting_link` alone means the in-app join button ignores it and
  mints a different room.

A per-occurrence link is impossible under the current model — one weekly series
expands to as many as 104 occurrences sharing a link. Note also that the resolver
anchors its calendar event at `new Date()`, not the scheduled slot, and that
nothing here backfills existing sessions.

Rooms are created against **the teacher's own Google account** via their OAuth
token. There is no platform Google account.

### Session length

**The 30-minute default matches nothing in production.** Real durations across
all 36 series: 60 minutes on 21, 120 on 13, 90 on 2, and **30 on none**. Sixty is
the database default, the API fallback and the modal value. Roughly 40% of live
series deliberately exceed 60 minutes.

Keep 30 minutes as the *campaign* default — a taster is not a lesson — but
understand that a >60-minute warning fires on a large share of normal practice
and will train teachers to click through it. Either drop the warning or raise the
threshold above 120.

Where it does fire, it must be specific:

> Google may end this call after 60 minutes on free accounts.

A vague caution is not actionable. Because every room is created on a teacher's
personal account, the real ceiling is per-teacher and unknowable at build time.

---

## 1.4 Defaults

| Setting | Default | Editable |
|---|---|---|
| Session length | 30 minutes | Yes |
| Capacity | Unlimited — `class_match_sessions.max_attendees`, nullable | Yes |
| Sessions per teacher | — | Unlimited |

**Do not reuse `Group.max_students` for capacity.** It is
`integer NOT NULL DEFAULT 20` with `CHECK (max_students > 0 AND max_students <= 500)`.
NULL violates NOT NULL, 0 violates the check, and there is no free sentinel in
range — **unlimited is not representable**. Following that instruction literally
produces a 23502, then a "fix" of 500, and every seat check silently capping at
500 while the UI says unlimited. The new table's nullable `max_attendees` already
solves this.

**Give all four discount variables defaults too.** A teacher configuring
percentage, qualifying classes, redemption window and price duration on a *free*
session is filling in a lot of form for no immediate money. Publishing should be
one tap, with the rest behind a customise toggle. This is where teachers abandon.

---

## 1.5 Cancellation

A cancelled session is marked cancelled, its join button is disabled, and it stops
displaying as upcoming. **No automatic email is sent.**

This floor is not optional even though the email is. It exists so the platform
does not direct families to an empty room.

**The new table is what makes this cheap.** On the existing model it would be a
rewrite: the endpoint the tutor UI calls today **hard-deletes** the occurrence,
none of the three join surfaces reads occurrence status, and the link resolver
falls back past the occurrence to the group's series — so even a deleted
occurrence returns a live room. `class_match_sessions` carries its own `status`
and `cancelled_at`, and campaign join surfaces are new code that can check them.

**Still required:** the join guard must live at the route level. A Meet link is
series-scoped and cached for 30 days, so it cannot be revoked for one session.

---

## 1.6 Minimal teacher session list

Enough to see and manage what they have created. The full teacher dashboard is
Phase 4. Build it against `class_match_sessions`.

**Do not read `groups.timezone`.** It is NOT NULL and reads `'UTC'` on all 41
rows while classes are Trinidad local — rendering from it shows every class four
hours off. Hard-code Trinidad, as the occurrence generator already does.

---

## Do not build in this phase

- Teacher dashboard metrics and attributed-enrolment reporting → Phase 4
- Join queue and approval flow → Phase 5
- Anything learner-facing

---

## Open item — no campaign or opt-in entity exists

§1.2 and §1.3 step 1 both describe a teacher *joining* the campaign as a
persisted act, but the data model above contains no record of it. There is
nowhere to store opt-in timestamp, terms acceptance, or the gate snapshot, and a
teacher who opts in and creates nothing is invisible to funnel reporting. The
week's start and end dates also have nowhere to live, so a second Class Match
Week is a schema change rather than a row.

Either add `Campaign` and `CampaignParticipation`, or state that the session row
*is* the opt-in record and reword §1.2 and §1.3 accordingly.

Confirmed: no campaign, opt-in or coupon entity exists anywhere in the repo today.

---

## Definition of done

- A teacher can opt in, create a session from a published monthly-priced class,
  configure a discount, and publish it
- The well-formedness check blocks classes with no subject or no unexpired
  schedule, with a message naming what to fix and a route to fix it
- The level normalisation layer resolves every production value, maps
  bidirectionally to the learner vocabulary, and logs anything unrecognised
- The Meet link is generated without the teacher entering anything, and the
  document names the column it writes
- `class_match_sessions` exists and carries duration, link, status and
  cancellation on one record
- A cancelled session stops presenting as upcoming and its join route refuses
- Published sessions are queryable with all inherited fields resolved
- Every field in §1.1 exists
- **Migration 231 is applied and the leak test passes**: a coupon issued to one
  user produces no discount for a different buyer of the same class
- **`EMAIL_ALLOWLIST` is set on staging and a test send is confirmed suppressed**
  before any seeding
- Test data exists across several levels and subjects. Note staging holds only 9
  groups and 6 published-monthly classes, so it **cannot** rehearse the real
  catalogue — say so rather than treating a staging pass as coverage
