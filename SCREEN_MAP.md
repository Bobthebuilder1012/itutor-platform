# SCREEN_MAP — Figma frames to app routes

Status: **logic rows approved 2026-11-01. Parent frames mapped. Student half and
Alejandro's parent frames still need node ids — see "Pending" at the end.**

This maps every frame in the parent Figma file to the route it replaces, lists the
routes that have no frame, and flags the rows that are a change in behaviour rather
than a reskin. Read the **Logic changes** section before approving: four of those
rows change the information architecture, not just the styling.

## Sources

| File | Key | What is mapped here |
| --- | --- | --- |
| iTutor Parent App – Mobile & Desktop | `REIXBW9zxJbO6kNERt8Q3b` | All 80 frames, section `160:8515`, page "Parent v2 – Phone" (`42:657`) |
| Student UI | `rwytRx6xmRHf4AMzpxAznd` | **Not yet mapped** — see "Student app" at the end |

Node ids below are the `div.phone` frame for each screen: the frame to pass to
`get_design_context` and `get_screenshot`. The file is an html.to.design import, so
each screen sits in a `figure` with a `figcaption` holding its name.

Legend: **RESKIN** = same data, same route, new look. **LOGIC** = behaviour, routing
or data changes too. **NEW** = no route exists today.

---

## 1 · Main tabs — 16 frames  ← the flow selected to build first

| Frame | Node | Replaces | Kind |
| --- | --- | --- | --- |
| Home – payment failed + request | `160:1828` | `/parent/dashboard` (state: failed payment + pending request) | RESKIN |
| Home – all paid | `160:2057` | `/parent/dashboard` (state: nothing needs action) | RESKIN |
| Home – new parent (no classes) | `160:2208` | `/parent/dashboard` (empty state) | RESKIN |
| Explore | `160:2328` | `/parent/classes` ("Find Classes") | **LOGIC** |
| Explore – Maths | `160:2633` | `/parent/classes?subject=…` | **LOGIC** |
| Explore – English | `160:2751` | `/parent/classes?subject=…` | **LOGIC** |
| Explore – Physics | `160:2868` | `/parent/classes?subject=…` | **LOGIC** |
| Explore – Chemistry | `160:2985` | `/parent/classes?subject=…` | **LOGIC** |
| Explore – Biology | `160:3085` | `/parent/classes?subject=…` | **LOGIC** |
| Explore – SEA | `160:3185` | `/parent/classes?subject=…` | **LOGIC** |
| Explore – search "phys" | `160:3285` | `/parent/classes` (search active) | **LOGIC** |
| Explore – no results | `160:3406` | `/parent/classes` (empty result) | **LOGIC** |
| Classes – upcoming | `160:3622` | `/parent/subscriptions` + `/parent/approvals` merged | **LOGIC** |
| Classes – past | `160:3831` | `/parent/subscriptions` (past) | **LOGIC** |
| Billing | `160:4095` | `/parent/billing` ("Enrolment & payment history") | RESKIN |
| Billing – all paid | `160:4257` | `/parent/billing` (nothing owed) | RESKIN |

## 2 · Class pages — 12 frames

All twelve are the same screen with different subjects, so they build as **one**
component against `/parent/classes/[groupId]` (and the child-scoped
`/parent/children/[childId]/classes/[groupId]`). Use one as the visual target and the
rest to check subject-colour and schedule variations.

| Frame | Node | | Frame | Node |
| --- | --- | --- | --- | --- |
| Class – spanish | `160:4405` | | Class – sea | `160:4744` |
| Class – pob | `160:4481` | | Class – enga | `160:4810` |
| Class – geo | `160:4547` | | Class – engb | `160:4876` |
| Class – maths | `160:4613` | | Class – physics | `160:4941` |
| Class – addmaths | `160:4679` | | Class – physics4 | `160:5009` |
| Class – chem | `160:5075` | | Class – bio | `160:5140` |

All → `/parent/classes/[groupId]` · RESKIN

## 3 · Tutor profiles — 12 frames

Same again: twelve subjects of one screen → `/parent/tutors/[tutorId]` · RESKIN.

`160:5210` coutain · `160:5272` tamara · `160:5332` maloney · `160:5392` persad ·
`160:5452` ali · `160:5512` joseph · `160:5572` singh · `160:5631` henry ·
`160:5690` charles · `160:5751` imran · `160:5812` ramnarine · `160:5872` baksh

Note `/tutors/[id]` accepts a username **or** a uuid, and usernames are not
case-unique — keep whatever the current page resolves with.

## 4 · Enrol and pay — 10 frames

| Frame | Node | Replaces | Kind |
| --- | --- | --- | --- |
| Approve request | `160:5935` | `/parent/approvals` ("Booking requests") | RESKIN |
| Decline request | `160:6149` | `/parent/approvals` (decline path) | RESKIN |
| Checkout – card declined | `160:6325` | `/payments/checkout` (error state) | RESKIN |
| Checkout – new card | `160:6403` | `/payments/checkout` | RESKIN |
| Checkout – Maths | `160:6467` | `/payments/checkout` | RESKIN |
| Droove is enrolled | `160:6533` | `/student/subscriptions/[enrollmentId]/confirmed` equivalent | RESKIN |
| Class page – enrolled | `160:6574` | `/parent/classes/[groupId]` (enrolled state) | RESKIN |
| Verified by iTutor sheet | `160:6641` | bottom sheet on tutor profile | **NEW** |
| How iTutor verifies | `160:6740` | — | **NEW** |
| Pay by card – Stripe payment form | `198:1840` | `<StripePaymentForm />` | RESKIN |

**The Stripe screen is a restyle only.** Reuse `/api/payments/stripe/initiate` and the
existing Payment Element; match the tokens with the Stripe Appearance API. Do not
build a card input, and do not touch the LuniPay refund code.

## 5 · Payments and receipts — 4 frames

| Frame | Node | Replaces | Kind |
| --- | --- | --- | --- |
| Payment detail – failed | `160:6787` | `/parent/transactions` (detail) | RESKIN |
| Payment detail – active | `160:6856` | `/parent/transactions` (detail) | RESKIN |
| Receipt – paid | `160:6916` | receipt view | RESKIN |
| Payment history | `160:6964` | `/parent/transactions` ("Transaction history") | **LOGIC** |

## 6 · Fix failed payment — 6 frames

| Frame | Node | Replaces | Kind |
| --- | --- | --- | --- |
| Fix payment – new card | `160:7006` | — | **NEW** |
| Fix payment – saved card | `160:7074` | — | **NEW** |
| Fix payment – old card selected | `160:7126` | — | **NEW** |
| Processing | `160:7170` | — | **NEW** |
| Success | `160:7183` | — | **NEW** |
| Failed again | `160:7223` | — | **NEW** |

There is no dedicated retry route today; a failed charge is surfaced on
`/parent/billing` and `/parent/subscriptions`. This flow needs a route of its own.

## 7 · Pause and cancel — 5 frames

| Frame | Node | Replaces | Kind |
| --- | --- | --- | --- |
| Pause or cancel | `160:7288` | `/parent/subscriptions` | RESKIN |
| Confirm pause | `160:7370` | `/parent/subscriptions` | RESKIN |
| Confirm cancel | `160:7460` | `/parent/subscriptions` | RESKIN |
| After pause | `160:7549` | `/parent/subscriptions` | RESKIN |
| After cancel | `160:7610` | `/parent/subscriptions` | RESKIN |

Pause/resume logic already exists (`lib/payments/subscriptionPause.ts`). UI only.

## 8 · Account — 11 frames

| Frame | Node | Replaces | Kind |
| --- | --- | --- | --- |
| Notifications – all | `160:7672` | `/parent/notifications` | RESKIN |
| Notifications – unread | `160:7760` | `/parent/notifications` (filter) | RESKIN |
| Account menu | `160:7794` | — (Profile tab root) | **NEW** |
| Settings | `160:7984` | `/parent/settings` | RESKIN |
| Profile | `160:8114` | `/parent/settings` (profile section) | RESKIN |
| Security | `160:8159` | `/parent/settings` (security section) | RESKIN |
| Payment methods | `160:8189` | `/parent/settings` (payment methods) | RESKIN |
| Add a card | `160:8223` | Stripe SetupIntent | RESKIN |
| Notification settings | `160:8265` | `/parent/settings` (notifications) | RESKIN |
| Droove | `160:8307` | `/parent/children/[childId]` | RESKIN |
| Signed out | `160:8376` | `/login` | RESKIN |

## 9 · Help — 4 frames

| Frame | Node | Replaces | Kind |
| --- | --- | --- | --- |
| Help and support | `160:8398` | `/help` (global, not parent-scoped) | RESKIN |
| Contact support | `160:8465` | `/help` | RESKIN |
| Billing help | `160:8484` | `/help` | RESKIN |
| Pause or cancel help | `160:8501` | `/help` | RESKIN |

---

## Routes Arjun's file does not cover — resolved

Arjun's file is the parent app. For routes it lacks, **Alejandro's second parent
design** (in the Student UI file, `rwytRx6xmRHf4AMzpxAznd`) supplies the frame.
Decisions below are approved; node ids are pending the index file.

| Route | Source frame | Source file | Status |
| --- | --- | --- | --- |
| `/parent/calendar` | `P11-2` | Alejandro (Student UI) | node id **pending** |
| `/parent/messages` | `MP01`–`MP05` | Alejandro (Student UI) | node ids **pending** |
| `/parent/feedback` | `P15-1` | Alejandro (Student UI) | node id **pending** |
| `/parent/children` (list) | `P14-1` | Alejandro (Student UI) | node id **pending** |
| Sign-up | `PO01`–`PO07` | Alejandro (Student UI) | node ids **pending** |
| Login | `LG01`–`LG04` | Alejandro (Student UI) | node ids **pending** |

Alejandro's file also carries a fuller parent design `P01`–`P15`. **Only the frames
above are used.** Arjun's file remains the parent app everywhere it has a frame —
Alejandro's parent screens are not a competing source for Home, Explore, Classes,
Billing or Profile.

### Dropped and deferred

| Route | Decision |
| --- | --- |
| `/parent/coming-soon` | **DROP** |
| `/parent/children/[childId]/classes/[groupId]` | **DROP** — duplicate of `/parent/classes/[groupId]` |
| `/parent/matches` | **Keep the old UI for now.** Not rebuilt in this pass; revisit once Explore lands |
| `/parent/approvals` | **Redirect** → Classes tab |
| `/parent/subscriptions` | **Redirect** → Classes tab |
| `/parent/transactions` | **Fold into** Billing as a sub-screen |

---

## Logic changes — APPROVED as designed (2026-11-01)

These are not reskins. All six were approved; the resolution is recorded with each.

**1. Classes replaces Approvals and Subscriptions.** APPROVED. `/parent/approvals`
and `/parent/subscriptions` are **replaced** by one Classes tab with an
Upcoming / Past toggle (`160:3622` / `160:3831`). **Both old routes redirect** to the
new Classes tab — they are not kept as separate pages. Booking requests become a
section inside Upcoming.

**2. The nav drops from 8 items to 5.** APPROVED. New `BottomNav`:
**Home · Explore · Classes · Billing · Profile**. Where the displaced items go:

| Was a top-level nav item | Now lives under |
| --- | --- |
| Approvals | Classes (Upcoming) |
| Subscriptions | Classes |
| Children | **Profile** |
| Settings | **Profile** |
| Transactions | **Billing** |
| Feedback | Profile (frame pending — see Alejandro's `P15-1`) |

**3. "Explore" is a new concept for parents.** APPROVED. Parent Explore **reuses
`ExploreMarketplace`'s data and logic behind a parent wrapper** — not a reimplementation
and not a second data path. Only the presentation is parent-specific. Keep its existing
queries, filters and the groups RLS behaviour as they are.

**4. Billing and Transactions overlap.** APPROVED. One Billing tab (`160:4095`) with
**Transactions as a sub-screen** (`160:6964`). `/parent/transactions` folds into Billing.

**5. Fix failed payment is a new route under Billing.** APPROVED. Six frames
(section 6) become a route nested under Billing, entered from **two places**: the
Home "Needs action" card (`160:1828`) and the **dot on the Billing tab** in the
bottom nav (`BottomNav` supports this via `badge` on a `NavItem`).

**6. Dark to light.** The current parent app is dark (`itutor-card` `#0F0F0F`); the
design system is light-only and defines no dark theme. Every parent screen rebuilt
this way flips theme. That is expected, but it means a half-migrated parent app will
be visibly two-toned until the flow is complete — which is what
`NEXT_PUBLIC_NEW_UI_ENABLED` is for.

---

## Pending — what this map still needs

### Why the first student pass failed

I looked inside section `2:2705`, which holds only a single empty wrapper frame
(`2:439`). **Correction: the student screens are top-level frames on page `0:1`,
not nested in that section.** That is why nothing came back. No student node ids
were guessed on the strength of the wrong lookup.

What is known from the spec (`55:33589`), which is organised by topic rather than by
frame: the student part (`55:13631`) covers eight groups — Home and entry
(`55:13636`), Squad hub and membership (`55:16641`), Sessions and focus
(`55:19682`), Progress and sharing (`55:21611`), Share cards (`55:23992`), Teacher
support (`55:24117`), Referrals and credit (`55:26034`), Messaging (`55:27199`).
State variations are in section `31:8798`, and the per-screen spec panels in
`55:33589` are the behavioural source of truth for the student app.

### Blocked on two inputs

1. **`student-figma-index.md`** — the node-id index for the student file and for
   Alejandro's parent frames (`P11-2`, `MP01`–`MP05`, `P15-1`, `P14-1`,
   `PO01`–`PO07`, `LG01`–`LG04`). Not yet received.
2. **Figma MCP re-authentication** — the connection dropped during the account
   change and `whoami` still reports signed out. Needed both to resolve node ids and
   to run `get_design_context` / `get_screenshot` per frame while building.

All 37 routes under `app/student/` remain unmapped until then. None have been
guessed.

---

## Build order once approved

1. **Main tabs** (section 1) — establishes shell, header, bottom nav, Home, Explore,
   Classes, Billing.
2. Class pages and Tutor profiles (2, 3) — one component each.
3. Enrol and pay (4) including the Stripe restyle.
4. Payments, Fix failed payment, Pause and cancel (5, 6, 7).
5. Account and Help (8, 9).

Every screen gets loading, empty and error states. The new UI renders only when
`isNewUiEnabled()` is true; the old UI stays the default.
