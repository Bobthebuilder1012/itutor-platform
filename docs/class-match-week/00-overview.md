# Part 0 — Overview and sequencing

**Companion to:** Class Match Week Product Specification v2
**Figures measured against production on 2026-08-16.**

---

## 1. Supply reality — read before planning anything

The eligibility gate, measured:

| Clause | Teachers surviving |
|---|---|
| role = tutor | 184 |
| + not suspended | 184 |
| + active Meet connection | 92 |
| + ≥1 published monthly-priced class | 12 |
| **+ excluding platform-owned test classes** | **11** |

**Eleven teachers. Twenty-one eligible classes.**

**The binding constraint is the published-class catalogue, not the eligibility
gate.** Ninety-two tutors have working Meet connections; twelve have published a
class; eleven of those are not us. Class Match Week cannot be larger than the
platform it runs on.

Adding verification to the gate would cut this to **two teachers and five
classes** — see §3.1.

### 1.1 The catalogue is not twenty-one usable classes

Twenty-one is the eligible count. Two further constraints reduce what can
actually be matched:

- **Eight classes have no usable schedule.** Matching relaxes availability but
  never subject or level, so those eight can only ever be fallback stock.
  **Thirteen are exact-match capable.**
- **Thirteen is also the number with a future occurrence.** Several classes have
  a recurrence pattern configured but have exhausted their generated
  occurrences, and one series expired on 2026-07-03. A class with a pattern and
  no future date is not bookable supply.

The catalogue after exclusion, by level:

| Level | Classes | Tutors |
|---|---|---|
| `FORM_4` | 9 | 6 |
| `FORM_5` | 8 | 6 |
| `CAPE` | 3 | 3 |
| `FORM_1` | 1 (series expired 2026-07-03) | 1 |

**Four of the questionnaire's seven levels have no supply at all**: SEA, Form 1
(expired), Form 2 and Form 3.

### 1.2 `form_level` is not an enum

It carries free-text display labels alongside enum-style values, and the
`GroupFormLevel` TypeScript union contains neither of the free-text ones. A
normalisation layer is required before any level comparison — see
[01-foundations §1.2b](./01-foundations.md).

**Both free-text values were platform-owned and are gone from the catalogue.**
`CSEC (14–16)` and `SEA (10–12)` no longer appear in eligible supply. The
normalisation layer is still required, because the column is unconstrained and
new values will arrive, but it is no longer load-bearing for launch. Demote it
accordingly in the Phase 1 definition of done.

### 1.3 What this means for the build

**The no-match state is the primary path, not an exception.** Measured across
level × availability, **33 of 42 combinations return nothing (78.6%)** on the
pre-exclusion catalogue; **83.3%** excluding platform data; roughly **85%** once
subject is included. Section 2.7 of the specification was written as a fallback
for an edge case. It carries the large majority of completed questionnaires and
must be built as a first-class screen. Full grid and assumptions in
[02-discovery-matching §2.7](./02-discovery-matching.md).

**Filling schedule gaps does not move that number.** Every unschedulable class
sits at CAPE, Form 4 or Form 5 — levels whose weekday cells already have supply.
Scheduling them adds zero new non-zero cells. It is still worth doing, because a
class with no schedule is broken for paying customers too, but the leverage
argument belongs to recruiting **Form 2, Form 3 and weekend supply**, which is
the only intervention that opens a closed cell.

**Capacity and the join queue have almost nothing to do.** Phase 5 gets thinner
accordingly.

**Sorting and deduplication concerns are largely moot.** Of the level+subject
cells with a schedulable class, all but one return exactly one teacher. Design
the single-result state as primary.

---

## 2. Sequencing logic

**Supply before demand.** Unchanged, and now urgent for a different reason: the
catalogue is thin enough that every additional published class materially
changes what the campaign can offer.

**Capture data from day one, report on it later.** The export UI can be built
last; the fields cannot. Anything not captured while the campaign runs is lost
for that run.

**Close the money loop before polishing it.** Phase 3 ends at a completed paid
enrolment with a discount applied. Phases 4 and 5 improve a loop that already
works, so they can be trimmed under time pressure without the campaign becoming
pointless.

---

## 3. The phases

| Phase | Covers | Can the campaign run without it? |
|---|---|---|
| **1** | Foundations and teacher supply | No |
| **2** | Discovery and matching | No |
| **3** | Conversion loop | No — no revenue |
| **4** | Launch readiness | Technically yes, badly |
| **5** | Deferrable features | Yes |

**Minimum shippable campaign: Phases 1–3 plus the export from Phase 4.**

### 3.1 Eligibility gate — resolved

```
not suspended
AND active Meet video connection
AND >=1 published class
AND that class is priced monthly
```

**Verification is not required.** A deliberate decision, taken knowing that ten
of the twelve gate-passing teachers are unverified. Requiring it reduces the
catalogue to two teachers and five classes.

Monthly-only and Meet-only cost nothing. Production contains no `PER_SESSION` or
`PER_COURSE` classes at all, and no Zoom connections of any status.

**Caveat on the Meet clause.** It proves a connection row exists, not that link
generation works. All 92 rows marked `connected` have `token_expires_at` in the
past; all retain a refresh token, so refresh should succeed, but the gate tests a
self-reported status column that no successful API call has to have set. Exercise
token refresh for the eleven teachers before launch — otherwise the supply figure
could collapse on the day with no prior signal, surfacing as a bare 500.

---

## 4. Blocking items — status

| Item | Status |
|---|---|
| Meet link: supplied or generated? | **Partly resolved** — generated, but see below |
| Google Meet tier | **Resolved** — per-teacher personal accounts; warning past 60 minutes |
| What "approved teacher" means | **Resolved** — gate above, verification dropped |
| Class price field | **Resolved** — `pricing_model` authoritative, all paid classes MONTHLY |
| `group_promotions` per-user leak | **Resolved** — migration 231, see [01-foundations §1.1](./01-foundations.md) |
| Staging sends real mail | **Resolved** — `EMAIL_ALLOWLIST`, see §5 |
| Commission pre- or post-discount | **Open** — call-site decision, blocks Phase 3 checkout |
| Campaign dates | **Open** — blocks countdown configuration |

**On Meet links — "nothing to build" is wrong for group classes.**
`lib/services/videoProviders.ts` is the 1:1 session path. Group classes go
through `lib/services/groupMeetingLink.ts`, which works differently: **one link
per series, minted lazily on first join, cached 30 days**, not generated at
creation. `group_sessions.meeting_join_url` is NULL on 36 of 36 rows, and only
six of the eligible classes carry a `groups.meeting_link`. Phase 1.3 must name
the column it writes. Detail in [01-foundations §1.3](./01-foundations.md).

Two remain genuinely open. Neither blocks Phase 1.

---

## 5. Known production issues affecting this build

**Staging mail — resolved, but not the way the earlier draft assumed.**
`is_dev_account` exists on staging with zero profiles flagged, and 294 of 307
profiles carry external addresses. **Flagging profiles would have achieved
nothing**: `is_dev_account` is read in exactly four places, all tutor-listing
filters (`app/api/tutors/listed-ids`, `app/api/groups`, find-tutors, the tutor
profile page). No email path consults it, and `lib/services/emailService.ts` had
no allowlist, environment gate or suppression of any kind — its only no-op path
fires when `RESEND_API_KEY` is absent, and staging has a key.

`sendEmail` now honours an **`EMAIL_ALLOWLIST`** environment variable:
comma-separated, an entry beginning with `@` matches a whole domain, comparison
is case-insensitive, and **unset means no filtering** so production is unchanged.
Set it on staging before any seeding. It is also stronger than the flag would
have been, because it covers recipients who have no profile row at all.

**Anonymous visitors read zero rows.** Every SELECT policy on `groups`,
`group_sessions` and `group_session_occurrences` is `TO authenticated`. Across
the repo there are 245 `{authenticated}` policies and **none naming `anon`**. RLS
with no matching policy returns empty **silently, with no error**. The campaign
matcher must run server-side. See
[02-discovery-matching §2.1](./02-discovery-matching.md).

**The TypeScript type contradicts production.** `GroupPricingMode` is declared
`'PER_SESSION' | 'PER_COURSE' | 'FREE'`, but 29 published rows carry
`pricing_mode = 'MONTHLY'`. Any campaign filter written against that type
compiles and silently matches nothing. **Filter on `pricing_model`**, which is
100% populated and whose sibling union does include MONTHLY.

**`groups.timezone` is populated and wrong.** NOT NULL, reads `'UTC'` on all 41
rows, while classes are Trinidad local. The occurrence generator ignores the
column and hard-codes Trinidad. Never read it; hard-code Trinidad as the
generator does.

**A live pricing bug, unrelated to this campaign.** Not the one earlier drafts
described. The `Number(group.pricing)` → `NaN` path is **dead** — all three of
its consumers sit behind `!isMonthly`, and every paid class is MONTHLY. The real
defect is that `price_monthly` is missing from the `.select()` in
`app/student/groups/[groupId]/page.tsx`, so the monthly branch resolves to zero
and the page renders **"TT$0"** and **"Subscribe — TT$0/mo"** on 27 classes, some
priced at TT$480/mo. Byte-identical on `main` and `staging`. Fix the select, not
the NaN. Route separately.

---

## 6. Parallelisation

Phases 1 and 2 can overlap. Role selection, the questionnaire and the portal
shell have no dependency on sessions existing — only the matching engine and
results page do.

Nothing in Phase 3 can start before Phase 2's results page exists, because the
reservation flow begins from a card on that page.
