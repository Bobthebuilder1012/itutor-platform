# Part 5 — Deferrable features

**Spec reference:** v2 section 10
**Depends on:** Phases 3 and 4
**Blocks:** nothing

---

## Why this is last

Neither feature here is on the path between a parent discovering the campaign and
paying for a class. Both improve the experience at the edges. If the schedule
tightens, this phase is the one to cut, and cutting it costs nothing structural.

**The join queue's reach problem is measurable, and it is severe.** Campaign
capacity is optional and defaults to unlimited, so the queue activates only for
teachers who set a number. With **eleven** eligible teachers in production, the
realistic number of capped sessions in the first campaign is very small — possibly
zero.

**Recommendation: do not build §5.1 for the first run.** The precedent is preserved
for later, and it is better precedent than expected: `require_join_requests` is not
a bare flag but a **real end-to-end approval flow** — join produces a pending row, a
tutor PATCH approves or denies, notifications fire, and there are roster and
dashboard queues plus checkout gates. Five of the eligible classes have it switched
on. Revisit if a second campaign runs against a larger catalogue.

**Note on the other half of that precedent.** `Group.max_students` does **not**
express unlimited — it is `NOT NULL DEFAULT 20` with `CHECK (0 < n <= 500)`. Campaign
capacity lives on `class_match_sessions.max_attendees`, which is nullable. See
[01-foundations §1.4](./01-foundations.md).

---

## 5.1 Join queue

**Learner side.** When a session is full, **Reserve becomes Ask to join.** Same
intent, now gated. Notify me remains separately visible with its own meaning.

**Teacher side.** A join queue in the session settings showing pending requests with
name, level and request time. Approve or decline.

**Approving raises the cap.** The cap is therefore advisory — a signal of how many
the teacher wants, with a request path for more. Expect most teachers to approve
rather than decline; declining takes more effort and feels worse.

**Email throttling:**

| Requests | Behaviour |
|---|---|
| 1–5 | Individual emails |
| 6 | One digest — *12 students are waiting for your response* |
| 7+ | Dashboard badge only, no further email |

The pending-count badge on the teacher's session card is the reliable half of this.
Email will be missed.

**Timing:** requests stay open until the session starts. The queue closes at start
time — no approvals during a running session.

**The approval email must contain the join link directly**, not a link back to the
dashboard. A late approval only works if the student can act in one tap.

**Declined and expired requests:** no message is sent.

**Two things to build regardless:**

1. **Never show the word "rejected."** These are frequently children, on a platform
   they are being asked to trust. Frame outcomes around the class rather than the
   person — *this session filled up*.
2. **The request must resolve in the student's own dashboard.** It cannot sit as
   "pending" indefinitely after the session has run. Same principle as the
   cancelled-session floor in Phase 1 — the interface should not display a state
   that is no longer true. This is a UI requirement, not a notification one, and it
   stands even though no message is sent.

**If this is built, pick one status vocabulary.** Two rival ones exist: the live
path writes `'pending'`, while a parallel dead stack writes `'pending_approval'`,
which both the roster filter and the dashboard queue would render invisible. Note
also that a working queue already exists — `group_waitlist_entries` plus
`waitlistService` and a `process_waitlist_offer` RPC with position, offer expiry and
cron promotion — so this may be rebuilding something.

---

## 5.2 Notify me

Appears always, as a secondary link beneath Reserve. **Requires a full account**, the
same as Reserve.

This is deliberate. It costs the same friction and delivers less, so nobody willing
to sign up will choose it to dodge commitment, and teacher headcounts stay honest.

Because capacity defaults to unlimited and sessions rarely fill, its only coherent
meaning is *interested in this teacher, not this slot*. **The label should reflect
that** — something closer to *keep me posted* than *notify me*, which implies a
reminder that will not come.

**[OPEN] — what it actually fires on.** Candidates, which are four different
products:

1. A reserved seat is released and space opens
2. The teacher's paid class opens for enrolment
3. The teacher schedules another Class Match Week session
4. A reminder shortly before a session the user has no seat for

The last is the odd one out. Reminding someone about a session they cannot attend is
mostly a way to annoy them, unless it doubles as *seats opened, join now*.

**Mechanics:** reserving supersedes Notify on the same session and clears it.
Releasing a seat drops the user back to Notify rather than to nothing.

---

## 5.3 Banner extras

Anything deferred from Phase 4's banner — role and state awareness, the
post-campaign expiring-coupon messaging, dismissal behaviour.

---

## Definition of done

- A full session shows Ask to join, and an approved request becomes a normal
  reservation
- The email throttle stops at the documented thresholds and does not resume
- No user-facing copy anywhere contains the word "rejected"
- No request remains displayed as pending after its session has run
- Notify me fires on whichever triggers are confirmed, and never on the others
