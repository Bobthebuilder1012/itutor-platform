# Part 4 — Launch readiness

**Spec reference:** v2 sections 4, 9, 13, 14, 17
**Depends on:** Phase 3 (nothing to display without reservations and coupons)
**Blocks:** nothing

---

## Why this is fourth

Everything here reads as core in the spec, and functionally most of it is. But all
of it is improvement to a loop that already closes at the end of Phase 3. If time
runs short, this is the first phase where items can be cut individually rather than
the campaign breaking.

**One exception: the export in §4.6 is not optional.** The team will want it daily
during a live week, and without it nobody can tell whether the campaign is working
while there is still time to act.

---

## 4.1 Learner dashboard

**Savings hero, at the top:**

> You saved $N — keep attending classes to save more!

**Calculation:** `price_monthly × discount percentage × price_duration_months`,
summed across coupons — read from the **snapshot on the coupon**, not live from the
class, so the figure does not drift when a teacher edits a price mid-week.

### Read `price_monthly`. Three traps, all confirmed in production

- **`pricing_mode` is NULL on 6 of 38 published classes**, and its TypeScript union
  omits `MONTHLY` though 29 published rows carry that value. Code written against
  the type compiles and matches nothing. Gate eligibility on **`pricing_model`**.
- **The legacy `pricing` column is the string `'free'` on every row.** Anything
  reading it for money produces `NaN`.
- **`price_monthly` is missing from at least one existing select list**, so a naive
  copy of existing query code resolves it to **zero** — which is exactly the live
  bug on the class page today, rendering "TT$0" on classes priced up to TT$480/mo.
  Copy the column list deliberately.

Every paid class in production is monthly, so the formula holds for the whole
eligible catalogue — but only if the right column is read.

### Imminent session strip

When a session starts within **two hours**, a pinned strip takes the top of the
screen above the savings hero:

> Ms Singh starts in 90 minutes — Join

This is a state, not a reordering. Savings lead for the majority of visits where
nothing is imminent. Join clicks are the attendance metric, so burying that button
suppresses the number the campaign is judged on.

### Below the hero

- Upcoming reserved sessions with times and access information
- Sessions attended count
- Coupons earned, **with expiry dates surfaced** — the combined savings figure hides
  expiry, and expiry is the sharpest conversion lever available
- Teachers viewed, as a **revisitable list rather than a count** — nobody takes pride
  in how many profiles they opened; they want to get back to the teacher they liked
- Link back to their matches

### Two accepted risks, recorded so nobody relitigates them

1. The figure combines unlocked and redeemed savings, so it displays money the user
   has not saved on classes they have not bought. Worth a look from whoever handles
   consumer-protection questions.
2. *Keep attending to save more* rewards accumulating sessions. Combined with
   join-click attendance and no reservation cap, this incentivises coupon
   collection. The cost is the denominator — if a share of attendees are collecting
   coupons, enrolment conversion looks worse than it is. Mitigated by the cohort
   split in §4.6.

---

## 4.2 Teacher dashboard

**Headline metric: enrolments attributed to Class Match Week.** This is what makes
teachers want to do it again.

**Per session:** reservation count, date and time, join button, and after it runs,
who joined and how many coupons it generated.

**Campaign view:** coupons issued, coupons redeemed, enrolments attributed.

**What teachers see about attendees: count, levels and names. Not contact details.**

Contact details before the session would hand a teacher a list of warm leads with
phone numbers, for classes they have not been paid for. A teacher could run the
free session and continue with those families privately, off-platform, after iTutor
paid to acquire them. Count and levels cover preparation; names add warmth; contact
details are not needed for anything the teacher does on the day.

**Known gap — the child's name.** For student accounts the profile name is the
student. For parent accounts it is the parent, and a parent-child account structure
is out of scope. A teacher will see *Michelle Ramdeen, Form 5* and a boy called Kai
will join. One optional first-name field at reservation would close this without any
profile structure.

**Render `coalesce(display_name, full_name)`** — two eligible teachers have a handle
rather than a name in `full_name`.

---

## 4.3 Site-wide banner and countdown

A pinned bar at the top of every page. One line — on mobile it competes with the
site header.

**Four states, not one:**

| State | Behaviour |
|---|---|
| Before | Counts down to start. *Starts in 4 days.* |
| During | Counts down to end. *Ends in 2 days.* |
| After | The bar stays. The message must change — a dead countdown linking to expired sessions makes the site look abandoned |
| Dismissed | **[OPEN]** whether it can be dismissed and whether it returns |

**Recommended for the after state:** redemption windows run 7–30 days past each
session, so for up to a month afterwards there are attendees holding coupons that
are quietly expiring. The bar is the natural place to chase them — *your 20%
discount with Ms Singh expires in 9 days.*

**Recommended role and state awareness:** a visitor who has done nothing sees the
sign-up prompt; someone who completed the form sees *view your matches*; someone
with reservations sees their next session; a signed-in teacher sees the
create-a-session prompt. That last variant also solves where the teacher
call-to-action lives, since a mobile pinned bar has no room for two lines.

**Campaign dates are [OPEN]** — the countdown is built now and configured when they
are confirmed. They need somewhere to live; see the campaign-entity gap in
[01-foundations](./01-foundations.md).

---

## 4.4 Reminder emails

Email is the only contact channel — no phone number is collected. Reminders are the
only thing standing between a reservation and attendance, and attendance is how the
campaign converts.

**Recommended:** 24 hours and 1 hour before each session.

**Two things to check before building.** The reminder cron reads only the
class-level meeting link, so a join link resolves to a generic page for any class
without one — which is most of them (see
[01-foundations §1.3](./01-foundations.md)). And `EMAIL_ALLOWLIST` must be set on
staging before any reminder is exercised there, or the test mails real people.

### Built

Three emails, all in the platform's email design system (`lib/email/design`):

| Email | When | Family |
| --- | --- | --- |
| Reservation confirmation | On a successful `POST /api/class-match/reserve` | `booking-confirmation` |
| 24-hour reminder | 23–24h before the taster | `session-reminder` |
| 1-hour reminder | 30–90 min before the taster | `session-reminder` |

Copy lives in `lib/classMatchWeek/reminderEmails.ts`; the reminders are sent by
`/api/cron/class-match-reminders`, registered every five minutes.

**The join link is the join route, not the Meet URL.** The concern above is real
but does not apply to a taster: a `class_match_sessions` row carries its own
`meet_link`, and `/api/class-match/sessions/[id]/join` records the join click,
issues the coupon and only then redirects to the room. Emailing the raw Meet link
would take the family to class and lose both the metric and the discount. That
route now redirects a signed-out click to `/login?redirect=`… rather than
answering 401 with JSON, because it is a button in an email.

**Only the 1-hour reminder carries a live Join button.** The join window opens two
hours ahead, so at 24 hours the button would answer "not yet"; that email links to
the portal instead.

**Sends are recorded, not queued** (migration 237, `class_match_reminder_sends`).
Nothing needs scheduling — the taster times and the seat holders are both known,
so the only fact the cron cannot derive is what it has already sent. The
`UNIQUE (session_id, user_id, kind)` is the deduplication. The ledger row is
written only after a successful send, so a failure retries on the next run: a
reminder sent twice is an annoyance, one never sent is a family who does not turn
up.

**A cancellation email is written but not wired.** §1.3's floor is that a
cancelled taster stops showing as upcoming and no automatic email is sent.
`cancellationEmail()` exists so that when we choose to do better than the floor,
the copy has already been reviewed.

---

## 4.5 Explore page

- **Day tabs across the week** as primary navigation — a seven-day event reads better
  as days than as a single list, particularly on mobile
- Filters above: level, subject, time of day, discount
- Same grouped-by-teacher cards as the results page
- **Filters prefill from questionnaire answers** where the user has them, and can be
  cleared

**Prefill subject, level and time of day — but leave the day tabs unselected.**
Otherwise someone who answered "weekday evenings" has four days of sessions hidden
from them.

**Design the empty-day state deliberately.** With eleven teachers, day tabs may show
one or two sessions each, and some days none.

**Do not assume `/api/groups` filters work.** Six of its twelve declared filter
params are parsed, destructured and never applied — including `formLevel`,
`minPrice` and `maxPrice`. Its price sort reads `price_per_session ?? price_per_course`
and ignores `price_monthly`, so with every eligible class on monthly pricing it sorts
every row as zero.

**[OPEN]** Whether sessions that have already run disappear or remain visible as
ended.

---

## 4.6 Admin export

**Two files, delivered through an admin page with a download button.**

**Main export — one flat file.** Row grain: **one row per reservation**. Submission
answers repeat across a user's rows; coupons attach to the row for the session that
earned them.

A user who completed the questionnaire but reserved nothing **still gets one row**,
with session columns blank. Otherwise non-reservers vanish from the export, and they
are a group worth looking at.

Columns: name, email, role, level, subjects, availability, support needed, teacher
preferences, recommended sessions, reserved session, join-clicked status and
timestamp, coupon issued, discount percentage, coupon status, savings value, linked
paid class, enrolment status, **sessions booked count**.

That last column is the cohort field — it lets attendees who booked one session be
measured separately from those who booked five, so coupon farming shows as a visible
pattern rather than dragging the headline conversion rate.

**Two columns have no source yet.** "Recommended sessions" requires an impression
record, and nothing in Phase 1's data model stores what any student was shown — if
recommendations are computed on the fly, the export cannot reproduce them. "Sessions
booked count" should be derived from the reservation table; say so explicitly.
Resolve both before Phase 2 ships the writes, or they are unrecoverable for this run.

**Anonymous submissions — separate table.** People who completed the questionnaire
and never signed up have no name or contact; half the columns would be blank in the
main file. Their level, subjects and availability are the clearest demand signal
available — the best guide to which subjects to recruit teachers for next time. Given
four of seven levels currently have no supply, this table is the campaign's most
actionable output.

**Access:** date range selector or all-time toggle, and **proper access control**. The
file contains contact details tied to children's names and levels. A download button
is only as safe as the page it sits on.

**Metrics the export must answer:** questionnaire completion rate, reservations per
viewer, join rate per reservation, enrolment rate per attendee split by cohort,
revenue attributed against discount cost, cost per enrolment.

---

## Definition of done

- The dashboard shows a correct savings figure read from the coupon snapshot, and
  the imminent-session strip appears and disappears on schedule
- A teacher can see reservation counts before a session and coupon counts after
- The banner renders correctly in all four states, including after the campaign ends
- The export downloads, includes non-reservers, and answers all six metrics without
  manual work
