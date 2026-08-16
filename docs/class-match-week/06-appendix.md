# Appendix — every open item in one place

Collected from all five phases so nothing has to be hunted for. Ordered by what
stops work.

---

## Resolved since the first draft

Kept visible rather than deleted, because both were listed as hard prerequisites and
someone will look for them.

| Item | Resolution |
|---|---|
| **`group_promotions` checkout query has no user filter** | **Fixed.** Migration 231 adds `user_id`, `expires_at`, `redeemed_at`, `price_duration_months`, a `'personal-coupon'` kind, and a CHECK making an owner-less personal coupon unstorable. Checkout filters by owner; five class-badge read sites and the promotions GET/DELETE are scoped; the dead `get_group_promotions` RPC call was removed rather than created. Production had drifted from migration 166 — three policies live where the file defined two — so 231 drops all four known names before recreating. **Must be applied before the code that selects the new columns deploys.** |
| **Staging sends real mail** | **Fixed, but not as originally planned.** Flagging `is_dev_account` would have done nothing: it is read only in four tutor-listing filters, never in an email path, and `emailService` had no suppression of any kind. `sendEmail` now honours `EMAIL_ALLOWLIST` — comma-separated, `@domain` entries match a whole domain, unset means no filtering so production is unchanged. **Set it on staging before any seeding.** |

---

## Hard prerequisites — fix before the work they gate

| # | Item | Gates | Part |
|---|---|---|---|
| 1 | **Anonymous visitors read zero rows.** Every SELECT policy on `groups`, `group_sessions`, `group_session_occurrences` is `TO authenticated`; no policy anywhere names `anon`. Fails silently as "no results" | Phase 2's entire definition of done | 2 |
| 2 | **Attendance is inert on production.** Migration 220 unapplied, `session_attendance_log` missing columns the code writes, errors swallowed by design, zero rows | Phase 3 join-click metric and coupon issuance | 3 |
| 3 | **Zero parent accounts exist.** `PARENT_ACCOUNTS_ENABLED` is false and the parent card is hidden at signup | Phase 3 signup for the campaign's primary persona | 2, 3 |
| 4 | **Return-destination plumbing broken in two remaining places** — `?next=` vs `?redirect=`, and `complete-role` dropping `returnTo` on its auto-resolve path | Phase 3.1 state restoration | 3 |

---

## Blocking decisions

| # | Item | Blocks | Part |
|---|---|---|---|
| 5 | **Commission treatment** — pre-discount, post-discount, or waived via the 0% override. Base rate is a flat 7%, so pre/post moves only $7 on a $100 discount; the override moves $35 | Phase 3 checkout logic | 3 |
| 6 | **Campaign dates** | Countdown configuration — and they have nowhere to live until a campaign entity exists | 4 |
| 7 | **Which schedule source matching reads** — `group_sessions` directly, or `resolveScheduleEntries()`. Three eligible classes disagree between the two | Phase 2 matching engine | 2 |
| 8 | **Which source §1.2c's well-formedness check reads.** The blocked count swings between 8 and 23 on this choice alone | Phase 1 session creation | 1 |

---

## Needed before launch

| # | Item | Part |
|---|---|---|
| 9 | What "Notify me" actually fires on — released seat, class opening, another session, or a reminder | 5 |
| 10 | "Popular" subject definitions per level — hardcode for the first run | 2 |
| 11 | Q2's option source — live inventory or static curriculum list. Each fails differently; name the casualties | 2 |
| 12 | Submission claim/merge rule at sign-in. Schema decision, cannot be deferred past Phase 2 | 2 |
| 13 | Whether past sessions disappear from Explore or remain visible as ended | 4 |
| 14 | Whether the banner can be dismissed, and whether it returns | 4 |
| 15 | Which enrolment status a reservation produces, reconciled with `ENROLLED_STATUSES` | 3 |
| 16 | Whether a campaign/opt-in entity is added, or the session row *is* the opt-in record | 1 |
| 17 | How a class rejected by the manual audit is kept out — no "excluded from campaign" field exists | 1 |
| 18 | Which column Phase 1.3 writes the Meet link to. The two options fail differently | 1 |

---

## Recommended, awaiting a decision

| # | Item | Part |
|---|---|---|
| 19 | Subject synonym map — *Add Maths*, *POB*, *POA*, *EDPM*, *Lit* — built against `public.subjects`, keyed on `curriculum` | 2 |
| 20 | Subject normalisation layer, or an explicit decision to match raw strings and accept that Mathematics fragments into four | 2 |
| 21 | Level-relaxation step in the fallback. Relaxing availability changes nothing for the highest-volume queries | 2 |
| 22 | Qualifying-class floor — the session's own class always qualifies for the discount | 1 |
| 23 | Reminder schedule at 24 hours and 1 hour | 4 |
| 24 | Cohort split in reporting — separates one-session attendees from five-session ones | 4 |
| 25 | Child's first name captured at reservation | 4 |
| 26 | Post-week banner messaging for expiring coupons | 4 |
| 27 | Banner role and state awareness | 4 |
| 28 | Blocking sessions that clash with a teacher's own regular class | 1 |
| 29 | Drop the >60-minute warning or raise it above 120 — 40% of live series exceed 60 minutes deliberately | 1 |
| 30 | Exercise Meet token refresh for the eleven teachers pre-launch. All 92 `connected` rows have expired tokens | 0 |
| 31 | Weekday-consistency check comparing `schedule_display` against `recurrence_days` — two classes advertise the wrong day | 1 |
| 32 | Behaviour for non-functional Reserve buttons at the Phase 2 demo | 2 |

---

## Accepted risks — recorded, not open

Decided knowingly. Listed so nobody reopens them without the reasoning.

| Item | Consequence accepted | Part |
|---|---|---|
| Ten of twelve gate-passing teachers are unverified | A trust campaign running mostly on unvetted teachers. A reviewer role and dashboard exist if revisited — eleven reviews, not a backlog | 1 |
| The savings figure combines unlocked and redeemed and is labelled "you saved" | Displays money not yet saved on classes not yet bought | 4 |
| "Keep attending to save more" | Rewards session accumulation; mitigated by cohort reporting | 4 |
| Cancelled sessions send no notification | Floored by the requirement that the UI stops showing them as upcoming | 1 |
| Questionnaire options are not constrained to supply | The no-match screen carries roughly 83% of completed forms. SEA, Form 2 and Form 3 always fall through, and Form 1's only class has expired | 2 |
| A normalisation layer rather than cleaned data | Messy `form_level` values remain for everything else that reads them | 1 |
| Join-click counts as attendance | The metric is "opened the link"; name it that internally | 3 |
| Platform-owned classes excluded from the catalogue | Supply drops from twelve teachers to eleven and thirty classes to twenty-one, and the `CSEC (14–16)` and `SEA (10–12)` tiers disappear entirely | 0 |

---

## Outside this project, found during it

**A live pricing bug — not the one earlier drafts described.** The
`Number(group.pricing)` → `NaN` path is dead; all three consumers sit behind
`!isMonthly` and every paid class is MONTHLY. The real defect is `price_monthly`
missing from the `.select()` in `app/student/groups/[groupId]/page.tsx`, so the page
renders **"TT$0"** and **"Subscribe — TT$0/mo"** on 27 classes, some priced at
TT$480/mo. Byte-identical on `main` and `staging`. **Fix the select, not the NaN.**

**`profiles` is world-readable.** Policy `profiles_public_read_v2` grants
`SELECT … USING (true)` to `{public}` on every column of all 374 profiles, and
`profiles_update_own_or_recent_v5` grants a five-minute anonymous write window on
role-less rows. Route to whoever owns security.

**Two dead code paths that will mislead a reader.** `app/classes/page.tsx` filters
`status = 'active'`, a value production does not have, so it has never rendered a
row and nothing links to it. `components/student/TutorGroupCard.tsx` renders a
hardcoded "Free" badge with no price field at all — live on the tutors page today.

**`/api/groups` silently ignores six of its twelve filter params**, including
`formLevel`, `minPrice` and `maxPrice`, and its price sort ignores `price_monthly`.

**Repository root clutter.** Several hundred loose `.sql` and `.md` files, many
`_V2` / `_FIXED` / `_FINAL` variants of the same fix. It makes it genuinely hard to
tell which migrations are applied and which are abandoned. Note there is also a
**dead duplicate migrations tree** at `src/supabase/migrations/` that stops at 101 —
write only to `supabase/migrations/`. An archive directory would speed up any future
audit.
