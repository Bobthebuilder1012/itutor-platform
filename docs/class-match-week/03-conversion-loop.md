# Part 3 — Conversion loop

**Spec reference:** v2 sections 6, 8.4, 10.2, 12.3, 12.4
**Depends on:** Phase 2 (results page to reserve from)
**Blocks:** Phase 4 dashboards, which have nothing to display without this

---

## Why this is third

This is where the campaign makes money. At the end of this phase a parent can go
from never having heard of iTutor to a paid enrolment with a discount applied,
without a developer intervening.

It also contains **the single highest-risk piece of engineering in the build**, in
§3.1. Everything upstream — the banner, the questionnaire, the matching logic, the
grouped cards — is machinery for producing one tap on Reserve. This phase is where
that tap gets spent or lost.

---

## 3.1 Signup handoff

**Read this section carefully. It is the part most likely to be built wrong and
hardest to notice.**

**Sequence:**

```
Questionnaire (anonymous)
  → Results visible without an account
  → Tap Reserve
  → Sign up or sign in
  → Return to the card
  → Tap Reserve again
  → Confirmation
```

**Three things must survive the round trip:**

1. The questionnaire answers
2. The specific session slot that was tapped
3. The return destination

**The failure mode:** Google sign-in navigates away from iTutor entirely and
returns. Anything held in page memory is gone. Answers and the pending session id
must live in a first-party cookie or a server-side record keyed by a token,
claimed on return and attached to the new user id. Cookie mechanics are in
[02-discovery-matching §2.4](./02-discovery-matching.md).

**Test explicitly on iOS Safari**, where storage rules are stricter. A silent
failure here looks like ordinary drop-off in analytics and will not be diagnosed
for weeks.

### The return-destination plumbing is broken in three places

All three are live today and all three break this flow. Fix them before building
on top.

- **Two different param names.** `middleware.ts` sets `?next=`; the login and
  signup pages read only `?redirect=`. Only the auth callback reads both, so a
  `?next=` destination is silently dropped at the login page. **Use `?redirect=`.**
- **`complete-role` drops the destination on its auto-resolve path.**
  `app/signup/complete-role/page.tsx` computes a guarded `returnTo`, then calls
  `router.replace(data.redirect)` from `/api/auth/resolve-role` without ever
  consulting it. Any user complete enough for that endpoint to answer is thrown to
  a dashboard before restoration runs. Prefer `returnTo`, or restore from the
  cookie token on the dashboard rather than depending on the URL.
- **Open redirect — fixed, keep it fixed.** The login and signup pages pushed
  `decodeURIComponent(redirectUrl)` with no validation; `/signup?redirect=//evil.example`
  worked. `lib/utils/safeRedirect.ts` now holds the rule and all five call sites
  use it. Note the guard validates the **decoded** value, because
  `useSearchParams().get()` has already decoded once and validating before the
  second decode lets a doubly-encoded value through. This matters here because
  Phase 3 puts campaign URLs carrying `?redirect=` into paid ads.

### "Return to the card" must be defined precisely

Otherwise the second tap becomes a hunt:

- Results page restored
- Scrolled to that teacher's card
- Card expanded
- The specific slot they chose highlighted
- Reserve visually emphasised

Not the top of the results page.

---

## 3.2 Signup screen

- **Google sign-in at the top.** Most users will take this path.
- Email and password creation below it.
- **Sign-in offered alongside sign-up** — many people tapping Reserve already have
  accounts from a previous term. The same state-restoration requirements apply.
- **Role is never asked.** It came from Phase 2 — see the parent-account caveat in
  [02-discovery-matching §2.2](./02-discovery-matching.md), which is a hard
  prerequisite for this screen behaving sensibly.
- **No phone number collected.**

**Email verification:**

- **Google sign-in is exempt.** Google has already confirmed ownership.
- Email-and-password signups verify before reserving.

**Consequence to plan for:** email becomes the only contact channel. Reminders are
the only thing standing between a reservation and attendance, and attendance is
how the campaign converts.

---

## 3.3 Reservation

On reserving, the system:

- Records the reservation against the account
- Shows confirmation
- Adds the session to the dashboard with date, time and access information
- Prevents duplicate reservations for the same session
- Decrements remaining spaces where a cap exists

**Confirmation copy:**

> Your free session has been reserved.
> You will meet Ms Singh for "How to Score Higher in CSEC IT" on Tuesday,
> September 1 at 6:00 p.m.

**Overlapping reservations:** parents may reserve multiple sessions. Where two
clash in time, **warn and let them proceed**, naming the clashing session. Without
this, families discover the clash on the day, miss one, and the teacher records a
no-show that was not their fault.

**Decide which enrolment status a reservation produces.** `group_enrollments`
carries live rows in `SECURED_PENDING_PAYMENT`, but `ENROLLED_STATUSES` in
`lib/server/attendance.ts` lists only `ACTIVE`, `GRACE` and `SECURED` — so a
reservation written in the status the existing secure-spot flow already produces
returns `not_enrolled` at the join click. Reconcile the two, or the reserve button
grants nothing.

---

## 3.4 Attendance and coupon issuance

**Attendance is recorded when the join button is clicked.** No teacher
confirmation, no time-window enforcement.

**Name this "join clicked" in the database and in every internal report — not
"attended."** What is recorded is that someone opened the session link. If the team
reads it as attendance they will overstate campaign performance and draw the wrong
conclusion about whether to run this again.

**Store the timestamp.** One column, captured anyway. It allows clicks inside the
session window to be separated from those outside it later, producing a truthful
attendance number retroactively without changing the product.

### The attendance substrate is inert on production — fix before relying on it

Migration 220 is not applied to production. `session_attendance_log` there lacks
the columns `lib/server/attendance.ts` writes, and one of its reads targets a table
that does not exist. The upsert result is **never error-checked**, and the
mark-present route documents an intent to swallow errors so nothing surfaces to the
joining student. The table holds **zero rows**, consistent with every join click
writing nothing.

**Add a migration-parity step.** Otherwise Phase 3 ships a join-click metric that
records nothing and a coupon trigger that never fires, and both are discovered only
when coupon issuance produces zero events.

### Issuing the coupon

**On join click, issue the coupon as a `group_promotions` row scoped to that
user.** Migration 231 has landed and makes this expressible: set `user_id`, `kind =
'personal-coupon'`, `discount`, and `expires_at` resolved from the teacher's
redemption window. A `CHECK` guarantees an owner-less personal coupon cannot be
stored.

**Snapshot the price onto the coupon at issue.** The savings figure is
`price_monthly × discount × price_duration_months`; without a snapshot the export
drifts when a teacher edits the price mid-week.

**Attribution comes free.** `group_enrollments.promotion_id` is already written at
checkout, so the join between discount cost and enrolment revenue exists without
new plumbing.

**Redemption marking is this phase's job.** Migration 231 adds `redeemed_at` but
nothing writes it. The checkout resolver already filters `redeemed_at IS NULL`, so
until this phase writes it, a coupon remains reusable.

**The leak that made this dangerous is closed** — see
[01-foundations §1.1](./01-foundations.md). Checkout filters by owner, the read
sites are scoped, and the RLS policy requires `user_id IS NULL OR user_id =
auth.uid()`. Do not issue coupons against an environment where migration 231 has
not been applied.

### Precedence is undefined, and this phase must define it

Found while leak-testing 231 on staging. The resolver orders `created_at desc`
and takes the **first applicable** row — it has no notion of the *best* discount.
Two consequences, both live:

- **A personal coupon does not reliably beat a group-wide promotion.** A class
  carrying a standing early-bird or open-ended offer can out-rank the campaign
  coupon that was issued to bring the family back, purely on which row is newer.
- **Ties are nondeterministic.** In the staging test both rows landed with an
  identical `created_at` (same transaction), and which one won was arbitrary.
  Coupons issued in a batch — the likely shape of campaign issuance — will
  collide this way.

The attendee is told they unlocked a specific percentage, so the checkout has to
honour that number or the campaign's central promise breaks at the moment of
payment.

**Rule to implement:** a personal coupon owned by the buyer always outranks a
group-wide promotion; within the same class, higher discount wins; break
remaining ties deterministically on `id`. Order explicitly rather than relying on
`created_at`, which is not unique.

---

## 3.5 Enrolment handoff

The discount applies at the main site's existing checkout. No separate payment
system is built.

**Post-session prompt:**

> Ready to continue with Ms Singh?
> Enrol in her Form 5 CSEC Information Technology class.

The button goes directly to the existing enrolment or checkout page with the coupon
applied.

**Attribution:** the completed enrolment must record which session and which coupon
produced it. This is the number that decides whether Class Match Week runs again,
and it cannot be reconstructed later.

---

## Do not build in this phase

- Dashboards and reminder emails → Phase 4
- Join queue and Notify me → Phase 5

---

## Blocking item — commission

**Is iTutor's commission calculated on the pre-discount or post-discount price?**

A call-site decision, not a schema question — the calculator computes on whatever
charge amount it is given. But the rate changes what is being asked.

**The base rate is a flat 7%**, not the tiered schedule older documents assumed. On
a $500 class with a 20% discount, the parent pays $400:

| | Commission | Teacher nets |
|---|---|---|
| Pre-discount | $35 | $365 |
| Post-discount | $28 | $372 |

iTutor absorbs **$7 of a $100 discount**. That is a rounding gesture, not
cost-sharing.

**A per-tutor and global override layer exists with an explicit 0% option.**
Waiving commission on that class is worth $35 to the teacher — five times more —
and costs iTutor revenue it was only earning because the campaign existed. That is a
materially different proposition and should be decided alongside the pre/post
question, not after it.

Still blocks §3.5. The checkout logic cannot be written without an answer.

---

## Definition of done

- A visitor with no account completes the questionnaire, reserves a session, joins
  it, receives a coupon, and enrols with the discount applied — end to end, without
  developer intervention
- The full flow survives Google sign-in **on iOS Safari** with no loss of state
- The same flow works for an existing user signing in rather than signing up
- The `?redirect=` destination survives `complete-role` on both its paths
- Overlapping reservations produce a warning naming the clash
- A join click writes a row that is actually persisted — verified against the
  table, not the absence of an error
- A coupon issued to one user produces **no** discount for a different buyer of the
  same class
- A redeemed coupon cannot be redeemed twice
- A completed enrolment is traceable back to the specific session that produced it
