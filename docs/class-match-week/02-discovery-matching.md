# Part 2 — Discovery and matching

**Spec reference:** v2 sections 3, 5, 7, 8
**Depends on:** Phase 1 (sessions to match against)
**Blocks:** Phase 3

---

## Why this is second

This is the path in. Without it there is no way for a parent to encounter a
session at all.

It also produces the campaign's most valuable data even when it converts nobody.
Someone who answers five questions and leaves has still told you their child's
level, subjects and availability — the clearest signal available about which
subjects to recruit teachers for next time. That data only exists if the
anonymous submission storage in §2.4 is built properly.

**Partial overlap with Phase 1 is possible.** Role selection, the questionnaire
and the portal shell have no dependency on sessions existing.

---

## 2.1 Portal shell

Class Match Week runs as a section of iTutor, not a separate product.

- Structure reuses live-site card layouts, typography, spacing and navigation
- Only the **skin** changes — accent colour, badges, banner treatment
- Two pages only: Dashboard and Explore
- A persistent portal link back to iTutor

The rule is same components, new skin. That keeps the build cheap and still reads
as its own thing.

### The matcher must run server-side — this is architectural, not an optimisation

**Anonymous visitors read zero rows.** Every SELECT policy on `groups`,
`group_sessions` and `group_session_occurrences` is `TO authenticated`. Across the
repo: 245 `{authenticated}` policies, **none naming `anon`**. RLS with no matching
policy returns empty **silently, with no error** — so this fails as "no results",
not as an exception anyone will notice.

Run the matcher through `getServiceClient()` (`lib/supabase/server.ts`) in a
server component and pass results to client components as props. Two working
examples of the pattern: `app/feedback/student/[sessionId]/page.tsx` (closest fit
— reads with the service client, hands scalar props to a client form) and
`app/communities/subject/[communityId]/page.tsx` (helpers take the admin client as
their first argument, which is the reusable convention). All existing
`getServiceClient()` pages set `export const dynamic = 'force-dynamic'`.

**There is no precedent for a fully anonymous service-client page.** Every
existing one authenticates first and redirects on no user. This portal would be
the first URL-as-credential surface. The nearest doctrine in the repo is
`supabase/migrations/229_calendar_feed_tokens.sql` — long random revocable bearer
token in a dedicated table, minted server-side, no user write grant. Cite it
rather than re-deriving the reasoning.

### On component reuse — narrower than it sounds

There is no single card layer. There are four card implementations across three
incompatible visual systems, and two are broken against production:

- `app/classes/page.tsx` filters `status = 'active'`, a value that **does not
  exist** — production has only `PUBLISHED` and `ARCHIVED`. The page has never
  rendered a row and nothing links to it.
- `components/student/TutorGroupCard.tsx` renders a hardcoded "Free" badge and
  has **no price field at all** — a live defect on the tutors page today.

Reuse `components/tutor/public/PublicClassCard.tsx` (fully tokenised),
`ClassesSection.tsx`, and `lib/utils/scheduleFormat.ts`. **Rebuild the results
card.**

---

## 2.2 Role selection

Before any questions, the user picks **parent** or **student**.

This sets the wording of every subsequent question — "your child" versus "you" —
and is **never asked again**, including at signup in Phase 3.

**Open, and it blocks Phase 3.** There are **zero parent accounts** in
production: `profiles.role` is tutor 184, student 180, null 9, admin 1.
`parent_child_links` and `parent_child_invites` are both empty. `app/signup/page.tsx`
defaults `parentAccountsEnabled` to **false** and hides the parent card. A visitor
who picks "I'm a parent" reaches a signup screen offering only Student and Tutor.

Confirm `PARENT_ACCOUNTS_ENABLED` will be true before Phase 3, or drop the
question.

---

## 2.3 The five-question form

**Structure:**

- One question per screen with a visible progress bar
- Estimated time stated up front — *takes about 90 seconds*
- Single-select auto-advances on tap, after a short beat
- Multi-select requires explicit Continue
- **Back navigation is mandatory** — subjects depend on level

**Questions:**

| # | Question | Type |
|---|---|---|
| 1 | Level | Single select — **SEA, Form 1, Form 2, Form 3, Form 4, Form 5, CAPE** (seven options) |
| 2 | Subjects | Multi-select, conditional on level |
| 3 | Availability | Multi-select, six time blocks |
| 4 | Type of support needed | Max two selections |
| 5 | What matters in a teacher | Max two selections |

**On Q4 and Q5:** selecting *Not sure yet* clears and locks the other options.
Once two are chosen, the remainder grey out rather than silently swapping.

### Q1 is simplified to match the data's vocabulary

- **CAPE Unit 1 and Unit 2 collapse into a single CAPE option.** The unit is not
  stored at level; it lives in the subject string. Splitting at Q1 could never
  match on level. The parent still selects their unit at Q2.
- **The CSEC suffix is dropped from Form 4 and Form 5**, because the level column
  carries no such distinction — values are `FORM_4` and `FORM_5`, never
  `FORM_4_CSEC`. Note this is *not* what strands the `CSEC (14–16)` rows; those
  are handled by the §1.2b dual mapping, which works the same whichever label the
  option carries.

**Q1 has seven options.** Any grid, conditional-inventory branch or definition of
done phrased around eight is from a pre-edit draft.

**Four of the seven have no supply**: SEA (0), Form 1 (1 class, series expired),
Form 2 (0), Form 3 (0). Short-circuit Form 2 and Form 3 straight to the no-match
screen rather than collecting three more answers before a guaranteed dead end.

**All matching runs through the level normalisation layer in
[01-foundations §1.2b](./01-foundations.md)** — not against `form_level` directly,
and not against the `GroupFormLevel` union, which does not contain the values
production holds.

### Q2 is the hard one

Presented as a **search field with popular subjects as chips beneath it**. The
chips prevent a blank screen at the highest-drop-off step; search narrows for
people who know what they want.

**A canonical vocabulary already exists.** `public.subjects` has 134 rows — the
synonym map maps onto it rather than being authored from scratch. Two traps:

- **`subjects.level` is corrupted.** 131 of 134 rows say `'CSEC'`, including all
  77 whose `curriculum` is CAPE. Zero rows say `'CAPE'`. **Key on
  `subjects.curriculum`, never `subjects.level`.**
- **`lib/subjects.ts` is dead code** — 89 entries, zero imports. The live
  vocabulary is the database table.

**Class subject strings are not clean, and there is no normalisation layer for
them.** `groups.subject` is nullable free text with no foreign key and no check
constraint. Mathematics alone fragments into four non-matching strings —
`Mathematics`, `CSEC Mathematics`, `CSEC Additional Mathematics`,
`CAPE Pure Mathematics Unit 1`. A Q2 option labelled "Mathematics" matches SEA but
**not** the Form 4 `CSEC Mathematics` classes. Decide whether to add a subject
normalisation layer or to match on raw strings and accept the fragmentation.

**Build the synonym map** — *Add Maths*, *POB*, *POA*, *EDPM*, *Lit*, *Maths*.
Without it a real subject returns nothing and the parent concludes iTutor does not
offer it. Silent failure, no error, they leave.

**State Q2's option source**, because the two choices fail differently. Derived
from live inventory, a Form 1 parent is offered *CSEC Additional Mathematics* — a
data-entry error exposed mid-campaign. From a static curriculum list, that class
becomes permanently unmatchable. Pick one and name the casualties.

---

## 2.4 Anonymous submission storage

**The form completes before any account exists.** Answers are stored server-side
against a token held in a first-party cookie, and must survive a full navigation
away from the site and back, because Phase 3's signup handoff depends on it.

**A new table is required.** Nothing in production stores pre-account state —
every candidate table is keyed to an existing account with a NOT NULL profile id.
Key on the token, with a **nullable** profile id.

### Cookie mechanics — three ways to get this wrong

- **A Server Component cannot set cookies in Next 14.** `getServerClient()`
  implements only a `get` adapter and can never write; the repo has hit this wall
  twice already. Copy `app/auth/callback/route.ts` — a POST Route Handler calling
  `cookies().set({...})`. Reading via `cookies().get(name)` in the page is fine.
- **Do not put `revalidate` on the portal route.** Reading `cookies()` opts into
  dynamic rendering, and a cached HTML response cannot carry a per-visitor
  `Set-Cookie`. Mark it `dynamic = 'force-dynamic'`.
- **Specify the attributes as acceptance criteria:** `HttpOnly; Secure;
  SameSite=Lax; Path=/` plus an explicit `Max-Age` covering the campaign window.
  Without `Max-Age` it dies on browser restart. A script-written cookie is capped
  at 24 hours by Safari ITP after a cross-site navigation — which is exactly the
  WhatsApp-to-iOS path this campaign runs on. Server-set `HttpOnly` cookies are
  exempt.
- **Token generator:** `randomBytes(32).toString('base64url')`, the established
  convention.

### "One submission per user" names an entity that does not exist at write time

The submission is written before an account exists. Three paths are undefined:

1. Two browsers produce two tokens and two submissions from one person — overwrite
   semantics silently defeated
2. Anonymous submission, then sign-in to an account that already has one — two
   rows, no stated winner, and a `UNIQUE(user_id)` constraint would *throw*
   rather than merge
3. Cookie cleared before sign-in — orphaned row, still counted in reporting

**This cannot be deferred.** It is a schema decision, Phase 2 ships the writes,
and the admin export double-counts on path 1 and loses leads on path 3.

**Rule:** the unique key is on **token**, not `user_id`. On sign-in the
token-keyed row is adopted onto the account, overwriting any pre-existing
account-keyed submission (last write wins). Orphaned token rows are retained for
reporting, flagged unclaimed.

---

## 2.5 Matching engine

Simple filtering. No scoring.

A session matches when **subject + level + availability** all align, where
availability is compared against **the schedule of the regular paid class**, not
the sample session time. The child must be able to attend the ongoing class after
the taster — matching them to a free session they can attend and a paid class they
cannot is worse than no match.

### Read the schedule from `group_sessions`, not `groups`

Every field on `groups` a developer would reach for first is null across the whole
eligible catalogue:

| Field | Populated |
|---|---|
| `recurrence_rule` | 0 |
| `session_frequency` | 0 |
| `availability_window` | 0 |
| `session_length_minutes` | 0 |
| `recurrence_type` | all — but carries no day or time |

**The real schedule is `group_sessions.recurrence_days` (integer array),
`start_time` and `duration_minutes`.** Without this note the first person to
implement matching finds null everywhere and concludes availability matching is
impossible.

**Three filters the raw query needs and does not get for free:**

- `array_length(recurrence_days, 1) > 0` — this is the only real schedulability
  test. `start_time` is `time NOT NULL`, so filtering on it matches every row.
- `(ends_on IS NULL OR ends_on >= current_date)` — one eligible series expired on
  2026-07-03 and is the only Form 1 class in the catalogue.
- Deduplication. `group_sessions` contains exact duplicates differing only in
  `ends_on`, so a per-slot render gives the parent two identical Reserve buttons.
  **`sessionRowsToEntries()` in `lib/utils/scheduleFormat.ts` already collapses
  these** — reuse it.

**Consider reading through `resolveScheduleEntries()`** rather than querying
directly. The live class page prefers `schedule_data`, then `group_sessions`, then
occurrences — and three eligible classes disagree between the two sources. A
parent who filters on Tuesday and clicks through to a page saying Thursday is a
trust failure the campaign cannot absorb. Decide the source and state it; the
no-match headline is robust to the choice, but per-cell counts are not.

### Coverage

**Thirteen of twenty-one eligible classes are exact-match capable.** The other
eight can never be exact matches, because availability is relaxed in the fallback
but subject and level never are.

**They cannot be session-level fallback stock either** — §1.2c blocks campaign
session creation on exactly those classes, and a class that cannot have a session
cannot be session stock at any tier. If they are to appear as paid-class cards at
fallback tier 2, a schedule-less card variant must be specified, because the card
template requires a day and time these classes do not have. Otherwise they are out
of scope.

**Q4 and Q5 answers are stored but not used for matching** — and they cannot be.
On the eligible classes, `difficulty`, `goals`, `topic` and `availability_window`
are populated on none, and rating counts are zero. They are lead-capture questions
wearing a matching-question costume. Either say so and move them **after** the
results, or name the field each filters on and populate it first. Two provably
inert questions before any result is the most expensive drop-off in a five-screen
funnel.

---

## 2.6 Results page

**One card per teacher**, with that teacher's matching slots listed inside it.
Reserve is per slot.

**Card contents:** teacher name and image, subject, level, discount badge shown as
a range where sessions differ, per-slot title and date and time, regular paid class
day and time, class price, spaces remaining where a cap exists, Reserve per slot,
Notify me as a secondary link, View Teacher.

**Price renders `groups.price_monthly`, formatted as TT$ per month.** Never
`groups.pricing` — it is the literal string `'free'` on every eligible class.
Three eligible classes have `price_monthly = 0.00`; suppress those from paid-class
fallback rather than rendering an enrol CTA. State the currency and period on the
card; a parent comparing TT$120 against TT$450 needs it there, not behind a click.

**Render `coalesce(display_name, full_name)` for the teacher.** Two eligible
teachers have a handle rather than a name in `full_name`, one of them owning a
top-demand slot.

**Sorting:** two tiers — exact matches, then closest options. Within a tier,
soonest session first. **Do not sort by discount size**; it turns the page into
price comparison and pushes teachers to undercut each other.

**Design the single-result state as primary.** Of the level+subject cells with a
schedulable class, all but one return exactly one teacher. Grouping still matters
for the teacher with several slots, but the eight-sessions-one-teacher scenario
the grouping was designed for will not occur at this catalogue size.

**Budget a batched endpoint.** The nearest existing data path is N+1 — a
per-teacher groups call plus a per-teacher member-counts call.

---

## 2.7 No-match state — build this as a primary screen

**This is not an edge case. It is the most common outcome, and it is measurable.**

### The measured rate

Level × availability, distinct eligible classes per cell:

```
                  WD aft  WD eve  Sat am  Sat pm  Sun am  Sun pm
  SEA                0       0       0       0       0       0
  Form 1             1*      0       0       0       0       0
  Form 2             0       0       0       0       0       0
  Form 3             0       0       0       0       0       0
  Form 4             6       3       0       0       1       0
  Form 5             5       5       0       0       0       0
  CAPE               0       2       0       0       0       0
```

\* Form 1's only class expired 2026-07-03; applying the site's own filter drops it
to zero.

**Assumptions, which are load-bearing and belong in the document:**

- `recurrence_days` is `integer[]`, `{0..6}`, **0 = Sunday**
- Times are **AST wall-clock**. `start_time` carries no zone and `groups.timezone`
  reads `'UTC'` but is wrong — treating it as UTC shifts every class four hours
  earlier, putting a 6:00 PM class at 2:00 PM, during school
- **Half-open bands**, matching `timeBandOf()`: morning `05:00 ≤ t < 12:00`,
  afternoon `12:00 ≤ t < 17:00`, evening `17:00 ≤ t < 22:00`. Three classes start
  at exactly 17:00 and would otherwise match both bands or neither

**Roughly 83% of level × availability combinations return nothing**, rising to
about **85%** once subject is included. One good result: an explicit "outside all
six blocks" bucket returns zero rows, so Q3's six options cover 100% of current
supply.

### What the screen must do

Treat it with the same care as the results page, because more people will see it.

**Copy must lead with what exists, not with what does not.** The v1 wording reads
as an apology for an exception:

> We do not currently have a Class Match Week session that fits all your
> selections. Here are the closest available options.

At this catalogue size that framing makes the platform look empty at a parent's
first contact with it. Open with the available sessions and treat the mismatch as
context.

**Fallback order:** correct subject and level with a different schedule, then
existing paid classes with the correct subject and level. **Subject and level are
never relaxed. Only availability is flexible.**

**But availability is the wrong axis to relax**, and this is worth confronting.
Coverage misses come from subject and level, not timing. There is no Form 5
Mathematics class, no Form 4 or Form 5 English, and no Form 4/5 Biology, Chemistry
or Physics with a schedule anywhere in the eligible set. Form 5's entire
schedulable subject list is CSEC Economics, Geography, IT and Principles of
Business. Relaxing availability on a Form 5 Maths request changes zero results to
zero results — for the most likely request in Trinidad. Either add a
level-relaxation step, or accept a genuine dead end for the highest-volume queries.

**When relaxation does fire, name the mismatch.** Form 4 + CSEC Mathematics has no
weekday after-school slot and exactly one weekend slot: Sunday 9:00 AM. A parent
who answered "weekday evenings" must be told *this is Sunday morning, not the
weekday evening you chose* — not silently shown it.

**Where nothing exists for the subject at all**, still show something, and record
the request. That record is the demand signal telling iTutor which subjects to
recruit for. **There is no field for it** — Phase 1's entities contain nothing
representing an unmet request. Either state plainly that the submission row is the
record and no additional write happens, or add `match_outcome: exact | fallback |
none` to the submission.

---

## Do not build in this phase

- Reserve, sign-up, sign-in → Phase 3
- Explore page, banner, dashboards → Phase 4
- Notify me → Phase 5

**Reserve buttons render but need not function.** Pick one behaviour and state it
— disabled with "Reserving opens \<date\>", or enabled with a no-op toast. "Renders
but does nothing" reads as a bug to stakeholders at a demo. Same for View Teacher.

---

## Notes for the front end

**Performance matters more than usual.** A large share of users are on mid-range
Android over mobile data. Heavy animation libraries will stutter and turn the fun
into friction. CSS transitions and SVG cover most of it; save anything heavier for
the completion moment.

**Two platform costs to know about.** `AuthProvider` wraps the whole tree and
returns a spinner while loading, so the server-rendered HTML of every route is
"Loading…" — for a campaign portal shared on WhatsApp and Instagram, crawlers and
link-preview bots see a spinner. Either short-circuit when no auth cookie is
present, or mount the portal outside that subtree. Separately, middleware matches
every path and makes a blocking server-to-server fetch per page view **and per
`<Link>` prefetch** — on a one-question-per-screen flow with mandatory back
navigation, that is a serial origin round-trip per tap.

**The visual reference is Preply.** Green and school-themed animated icons,
reactive on selection, in iTutor's visual language. Gather reference screenshots
before this is built.

---

## Definition of done

- A visitor with **no account** can pick a role, complete five questions, and see
  matched sessions — verified with cookies cleared, since RLS returns empty
  silently rather than erroring
- Answers persist across a full page reload and a navigation away and back
- The results page never renders empty, for any combination of answers
- The no-match screen has been reviewed as a **primary** screen
- Grouped cards display correctly for a teacher with one session and with several
- Subject search resolves local abbreviations against `public.subjects`, keyed on
  `curriculum`. If a fixed count is wanted, list the abbreviations concretely and
  define an empty result landing on the no-match screen as a pass — several
  plausible ones (Physics, Chemistry, EDPM, Literature) have no eligible class
