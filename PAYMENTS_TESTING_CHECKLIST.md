# Payments — End-to-End Testing Checklist

Run against staging (`thjsdcbzlvjradczhgso.supabase.co`, the
`feature/payment-integration` Vercel preview). Tick each box. Anything
that fails → log it under "Issues found" at the bottom and fix before
live.

Notation:
- **DB**: verify with SQL (Supabase SQL editor or REST).
- **UI**: verify in the browser.
- **Logs**: verify in Vercel logs (`vercel logs --since 30m`).

> Cross-platform note: any PowerShell command in this doc has a `bash`
> equivalent immediately below it. Pick whichever your shell can run.

---

## §0 — Pre-flight

- [ ] **Migrations in sync** — `npx supabase migration list` shows
      local = remote and the highest number matches the latest file
      in `supabase/migrations/`.
- [ ] **Env vars present on preview**:
  - [ ] `LUNIPAY_SECRET_KEY=sk_test_…`
  - [ ] `LUNIPAY_WEBHOOK_SECRET=whsec_…` matches the LuniPay test
        endpoint exactly
  - [ ] `PAID_CLASSES_ENABLED=true`
  - [ ] `NEXT_PUBLIC_APP_URL` is the Vercel preview URL
  - [ ] `CRON_SECRET` set
  - [ ] `PAYOUT_GRACE_HOURS` (optional — defaults to 168)
- [ ] **LuniPay test webhook** registered against the preview URL with
      events: `checkout.session.completed`, `checkout.session.expired`,
      `payment.succeeded`, `payment.failed`. Status `Active`.
- [ ] **Test users**:
  - [ ] Student A — verified email, `billing_mode='self_allowed'`
  - [ ] Student B — verified email, `billing_mode='parent_required'`,
        `parent_id` populated
  - [ ] Parent P — linked as B's parent
  - [ ] Tutor T1 — verified, paid sessions enabled, has at least one
        subject with `price_per_hour_ttd > 0`
  - [ ] Tutor T2 — verified but never had a paid session (used in §15)
  - [ ] Admin — `profiles.role='admin'`
- [ ] **DB sanity** — paste these and confirm all return values:
  ```sql
  SELECT to_regclass('public.payout_batches'),
         to_regclass('public.lunipay_webhook_events'),
         to_regclass('public.session_reminders'),
         to_regclass('public.payout_ledger'),
         to_regclass('public.tutor_balances'),
         to_regclass('public.tutor_payout_accounts');
  -- All six non-null.

  SELECT column_name FROM information_schema.columns
  WHERE table_name='payments' AND column_name LIKE 'lunipay%';
  -- Expect 4 columns: lunipay_checkout_session_id/payment_id/
  -- payment_intent_id/checkout_url.

  SELECT proname FROM pg_proc WHERE proname IN (
    'flip_owed_to_release_ready', 'mark_payout_batch_paid',
    'release_payout', 'complete_booking_payment',
    'get_payer_for_student'
  );
  -- Expect 5 rows.
  ```

---

## §1 — Tutor bank-details form

- [ ] Sign in as Tutor T1 → `/tutor/settings` → **Payouts** tab loads.
- [ ] Form initially empty (no bank on file).
- [ ] Try to save with required fields blank → 400 "payout_name,
      account number, bank name, and branch are required".
- [ ] Fill all fields, save → success message, page hydrates with
      values after reload.
- [ ] **DB**: row in `tutor_payout_accounts` with all 5 fields
      populated, `tutor_id = <tutor uid>`.
- [ ] Edit and save again → row updates, no duplicate row created.
- [ ] **Deep link**: `/tutor/settings?section=payouts` lands directly
      on Payouts tab.

---

## §2 — Student happy path + commission verification

- [ ] Sign in as Student A → tutor T1's profile → pick a 1-hour future
      slot at TTD price `P` (note the price for fee math below) →
      **Book session**.
- [ ] Browser is redirected to `https://www.lunipay.io/checkout/...`
      with a "Test mode" banner visible.
- [ ] Pay with `4242 4242 4242 4242`, any future expiry, any CVC.
- [ ] Lands on `/payments/success?session_id=cs_test_…`. May briefly
      show "Confirming your payment…".
- [ ] Receipt renders: subject, tutor name, duration, scheduled time,
      amount, fee breakdown.
- [ ] **DB** (filter by recent `lunipay_checkout_session_id`):
  - [ ] `payments`: `provider='lunipay'`, `status='succeeded'`,
        `paid_at` recent, `booking_id` populated, `lunipay_payment_id`
        populated, `payer_id = <Student A id>`.
  - [ ] `bookings`: `status='CONFIRMED'`, `payment_status='paid'`,
        `payment_required=true`.
  - [ ] `sessions`: row exists with `join_url` populated (Google Meet
        URL).
  - [ ] `payout_ledger`: row with `status='owed'`, `tutor_id = T1`,
        `batch_id=NULL`.
  - [ ] `tutor_balances`: `pending_ttd` increased by the payout
        amount.
  - [ ] `lunipay_webhook_events`: row for this `session_id`,
        `event_type='checkout.session.completed'`.
  - [ ] `notifications`: 2 rows (Student A `payment_succeeded`, Tutor
        T1 `booking_confirmed`).
- [ ] **Commission math** — using the price `P` you picked:
  - Expected rate: `<$100 → 10%`, `$100–199.99 → 15%`, `$200+ → 20%`.
  - Expected `platformFee = round(P * rate, 2)` and
    `payoutAmount = round(P − platformFee, 2)`.
  - [ ] `payments.platform_fee_ttd` = expected platformFee
  - [ ] `payments.tutor_payout_ttd` = expected payoutAmount
  - [ ] `payout_ledger.amount_ttd` = expected payoutAmount
  - [ ] `tutor_balances.pending_ttd` increase = expected payoutAmount
  - [ ] **Repeat** with a price that crosses each tier boundary —
        ideally `$99.99`, `$100.00`, `$199.99`, `$200.00`. Each one
        passes the four bullets above.
- [ ] `/student/bookings` Upcoming tab shows the new booking with Meet
      link.
- [ ] `/tutor/sessions` shows it.

---

## §3 — Multiple bookings, same student + tutor

- [ ] Still as Student A, book a second session with T1 on a
      **different day**, complete payment.
- [ ] **DB**: 2 distinct `bookings` rows, 2 `payments` rows, 2
      `payout_ledger` rows, all linked to the right sessions. No
      duplicate session_ids in `payout_ledger`.
- [ ] `tutor_balances.pending_ttd` = sum of both payouts.
- [ ] `/student/bookings` shows both. `/tutor/wallet` activity tab
      shows both.

---

## §4 — Parent / payer flow

> **Status**: `direct-book` and the webhook currently hardcode
> `payer_id = studentId` and **do not** consult `profiles.billing_mode`
> or call `get_payer_for_student`. This section is split into a
> regression check (current behavior) and a forward-looking check that
> only applies once the parent flow is wired up. Mark the second part
> N/A if the wiring still hasn't shipped.

**Regression — confirm current behavior**

- [ ] Sign in as Student B (`billing_mode='parent_required'`) and
      attempt a paid booking with T1.
- [ ] **DB**: `payments.payer_id = Student B` (not Parent P).
- [ ] **DB**: `bookings.payer_id = Student B`.
- [ ] Notification of `payment_succeeded` goes to Student B.
- [ ] Note this in "Issues found" if the business intent is for the
      parent to pay — that's a feature gap, not a passing test.

**Forward-looking — only if parent payer is wired**

- [ ] Same setup, but now expect: `payments.payer_id = Parent P`,
      checkout opens for Parent P (re-auth required if Student B
      initiated), email/notification goes to Parent P.
- [ ] Refund test in §12 directs the refund back to Parent P.

---

## §5 — Webhook-down resilience (finalize fallback)

- [ ] In LuniPay test webhooks → **Disable** the endpoint.
- [ ] Repeat steps in §2 with Student A (skip the commission tier
      sweep).
- [ ] Success page sits on "Confirming your payment…" for ~8s, then
      auto-resolves to receipt.
- [ ] **DB**: identical shape to §2 except `lunipay_webhook_events` is
      empty for this session, and
      `payments.raw_provider_payload->>'source' = 'finalize'`.
- [ ] **Re-enable** the LuniPay webhook endpoint.

---

## §6 — 3DS / strong authentication

LuniPay test card requiring 3DS: `4000 0027 6000 3184`.

- [ ] Repeat §2 with the 3DS test card.
- [ ] LuniPay shows the 3DS challenge sheet → approve.
- [ ] Browser returns to `/payments/success?session_id=…`.
- [ ] **Same DB asserts as §2**.
- [ ] Repeat with the webhook **disabled** (force the finalize
      fallback to handle a 3DS-completed session). Confirm the
      finalize endpoint correctly recognizes `payment_status='paid'`
      from LuniPay and materializes the booking.
- [ ] Repeat with 3DS challenge **rejected** in LuniPay. Confirm:
  - [ ] No `payments` row created (or any created row is `cancelled`).
  - [ ] No `bookings` row.
  - [ ] Student lands back on checkout / sees a clear error.

---

## §7 — Decline path

- [ ] Repeat §2 with `4000 0000 0000 0002` (generic decline).
- [ ] LuniPay shows "Card declined". Student stays on checkout, can
      retry.
- [ ] **DB**: NO `payments` row created. NO `bookings` row created.

---

## §8 — LuniPay checkout session expiry

LuniPay test sessions expire after ~30 min (confirm exact value with
LuniPay docs).

- [ ] Initiate a booking → land on LuniPay checkout → close the tab,
      do nothing.
- [ ] Wait until the session is past its expiry (or trigger an expiry
      via LuniPay's "Send test event → `checkout.session.expired`" if
      the dashboard exposes that).
- [ ] **DB** for this session_id:
  - [ ] `payments.status='cancelled'`,
        `cancel_reason='session_expired'`.
  - [ ] No `bookings` row exists for this attempt.
  - [ ] `notifications` row of type `payment_failed` for the payer
        with link to `/payments/checkout?bookingId=…`.
- [ ] Student can immediately re-book the same slot — no "slot
      reserved" error.

---

## §9 — Idempotency replay

- [ ] After §2 succeeds, in LuniPay → Webhooks → click the event
      delivery → **Resend**.
- [ ] **Logs**: `[lunipay/webhook] Event <id> already processed`.
- [ ] **DB**: still ONE booking row, ONE payment row.
- [ ] Webhook returned 200 `{ status: 'duplicate' }`.

---

## §10 — Slot conflict at materialization

Force the conflict by inserting a competing booking while LuniPay is
holding the student's checkout session.

- [ ] Student A starts a booking with T1 at time `T` → land on LuniPay
      checkout. **Don't pay yet.**
- [ ] In SQL editor (use service role), insert a competing CONFIRMED
      booking. Replace the `<…>` placeholders — the columns shown
      below are the full set required by `bookings`:
  ```sql
  -- Pull a valid subject_id for T1 first
  SELECT subject_id FROM tutor_subjects WHERE tutor_id='<T1 uid>' LIMIT 1;

  -- Pick another student that isn't A (or use admin uid)
  INSERT INTO bookings (
    student_id, tutor_id, subject_id,
    requested_start_at, requested_end_at,
    confirmed_start_at, confirmed_end_at,
    duration_minutes, status, last_action_by,
    payer_id, payment_required, payment_status,
    price_ttd, currency, platform_fee_pct,
    requires_payment
  ) VALUES (
    '<some other student uid>', '<T1 uid>', '<subject_id from above>',
    '<T as ISO>', '<T+1h as ISO>',
    '<T as ISO>', '<T+1h as ISO>',
    60, 'CONFIRMED', 'student',
    '<some other student uid>', true, 'paid',
    100.00, 'TTD', 10,
    true
  );
  ```
- [ ] Student A returns to LuniPay and pays.
- [ ] **DB**:
  - [ ] `payments` row: `status='succeeded'`, `booking_id=NULL`,
        `cancel_reason='slot_taken_after_payment_needs_refund'`.
  - [ ] No NEW `bookings` row was created for Student A.
  - [ ] `notifications`: row to A, type `payment_failed`.
- [ ] Success page shows: "Your payment went through, but the time
      slot was no longer available. We will refund you shortly."

---

## §11 — Concurrent students racing the same slot

Different from §10 — no SQL forcing, just real concurrency.

- [ ] Open two **incognito** browser windows, sign in as Student A in
      one, Student B in the other.
- [ ] Both navigate to T1's profile, pick the **same** slot.
- [ ] Click **Book session** within ~1 second of each other.
- [ ] Both end up on LuniPay checkout. Pay in **both** (use the same
      test card).
- [ ] **Expected end state**:
  - [ ] Exactly **one** `bookings` row with `status='CONFIRMED'` for
        that slot.
  - [ ] One `payments` row in `succeeded` with `booking_id` populated.
  - [ ] One `payments` row in `succeeded` with `booking_id=NULL` and
        `cancel_reason='slot_taken_after_payment_needs_refund'` — the
        loser of the race.
  - [ ] The losing student got a `payment_failed` notification.
  - [ ] No double-booking, no overlapping CONFIRMED rows.
- [ ] Refund the loser via §12 to clean up.

---

## §12 — Refunds

- [ ] After §10 (and/or §11), sign in as admin → `/admin/refunds`.
- [ ] The slot-conflict payment(s) appear with **Slot conflict**
      badge.
- [ ] Click **Refund full amount** → confirm dialog → success message.
- [ ] **DB**:
  - [ ] `payments.status='refunded'`,
        `cancel_reason='refunded_by_admin'`.
  - [ ] `raw_provider_payload.refunds` is an array containing the
        LuniPay refund object
        (`{ id, status: 'SUCCEEDED', amount_cents, … }`).
  - [ ] `notifications`: row to payer, type `payment_refunded`.
- [ ] **LuniPay test dashboard**: a refund appears against the
      original payment.
- [ ] Reload `/admin/refunds` → refunded payment no longer listed.
- [ ] Try to refund via API a second time:

  PowerShell:
  ```powershell
  $h = @{ Authorization = "Bearer <admin JWT>" }
  Invoke-RestMethod -Method POST -Headers $h `
    -Uri "https://<preview>/api/admin/payments/<payment_id>/refund"
  ```

  bash:
  ```bash
  curl -X POST -H "Authorization: Bearer <admin JWT>" \
    "https://<preview>/api/admin/payments/<payment_id>/refund"
  ```

  → returns `{ status: 'already_refunded' }`. Idempotency holds.

---

## §13 — Release-window cron

This unblocks §14–§19 below.

- [ ] **Smoke test** the cron route directly:

  PowerShell:
  ```powershell
  $h = @{ Authorization = "Bearer <CRON_SECRET>" }
  Invoke-RestMethod -Headers $h `
    -Uri "https://<preview>/api/cron/flip-payouts-release-ready"
  ```

  bash:
  ```bash
  curl -H "Authorization: Bearer <CRON_SECRET>" \
    "https://<preview>/api/cron/flip-payouts-release-ready"
  ```

  Expect 200 with
  `{ ok: true, grace_hours: 168, result: { lines_flipped, … } }`.
- [ ] **Force a flip** for testing — pick a charged session and
      shorten the window via the RPC directly:
  ```sql
  -- Confirm there's an 'owed' row first
  SELECT pl.id, s.charged_at FROM payout_ledger pl
  JOIN sessions s ON s.id = pl.session_id
  WHERE pl.status='owed';

  -- Run with 0-hour grace so it picks up everything
  SELECT flip_owed_to_release_ready(0);
  ```
- [ ] **DB**: that ledger row is now `status='release_ready'`.
      Tutor's `tutor_balances.pending_ttd` decreased,
      `available_ttd` increased by the same amount. Sums reconcile.

---

## §14 — Tutor wallet (active tutor)

After §13:

- [ ] Sign in as Tutor T1 → `/tutor/wallet`.
- [ ] Hero: **Awaiting bank transfer** = the released amount. Pending
      shows whatever's still in escrow.
- [ ] Three-line summary card numbers match `tutor_balances` exactly:
  ```sql
  SELECT pending_ttd, available_ttd FROM tutor_balances
  WHERE tutor_id='<T1 uid>';
  SELECT COALESCE(SUM(amount_ttd), 0) FROM payout_ledger
  WHERE tutor_id='<T1 uid>' AND status='released';
  ```
- [ ] Recent activity list shows the released session with status
      pill **Awaiting transfer** (amber).
- [ ] Status filter on Transactions tab — "Awaiting transfer" filters
      to just that row.
- [ ] **Manage bank details** CTA navigates to
      `/tutor/settings?section=payouts`.

---

## §15 — Tutor wallet (zero-activity)

- [ ] Sign in as Tutor T2 (no paid sessions ever) → `/tutor/wallet`.
- [ ] Page renders without errors. No infinite spinner, no console
      stack trace.
- [ ] All three balance numbers display as `TT$ 0.00`.
- [ ] Activity / Transactions tabs render empty-state copy ("No
      activity yet" or similar) cleanly — no `Cannot read properties
      of undefined`.
- [ ] **Manage bank details** CTA still works even with no
      `tutor_payout_accounts` row.

---

## §16 — Admin payouts — export CSV

- [ ] Sign in as admin → `/admin/payouts`. Pending section shows T1
      with bank details and total.
- [ ] **Generate batch CSV** → CSV downloads (file name
      `itutor-payouts-<ts>.csv`). Open it:
  - [ ] Header row: `tutor_id,name,bank_name,branch,account_number,
        account_type,amount_ttd,reference`.
  - [ ] One row per tutor. `amount_ttd` matches DB. `reference` =
        `ITUTOR-<batch-uuid-first-8>`.
- [ ] **DB**:
  - [ ] `payout_batches` row inserted: `status='exported'`,
        `total_amount_ttd` = sum of CSV rows, `csv_filename` matches.
  - [ ] All eligible `payout_ledger` rows now have `batch_id=<this
        batch>` and `status` still `release_ready`.
- [ ] Pending section now empty for that tutor.
- [ ] Batch History section shows the new batch with status
      `exported`, Mark paid + Cancel buttons visible.

---

## §17 — Admin payouts — missing bank details skip

- [ ] In SQL: delete a tutor's `tutor_payout_accounts` row.
- [ ] Force a fresh release for that tutor (repeat §13 for one of
      their sessions).
- [ ] `/admin/payouts` Pending section shows them with amber "Missing
      — tutor must add bank details".
- [ ] Click **Generate batch CSV**.
  - [ ] If they were the *only* eligible tutor → response 400 "All
        eligible payouts are missing bank details".
  - [ ] If others were also eligible → CSV generated; the
        missing-bank tutor's lines stay `release_ready`,
        `batch_id=NULL`.
- [ ] Their lines reappear in Pending after the export.

---

## §18 — Admin payouts — cancel batch

- [ ] On a freshly generated `exported` batch, click **Cancel**.
- [ ] **DB**:
  - [ ] `payout_batches.status='cancelled'`, `cancelled_at` set.
  - [ ] All ledger items in that batch: `batch_id=NULL`, `status`
        still `release_ready`.
- [ ] Pending section repopulates with those tutors. They appear in
      the next export.

---

## §19 — Admin payouts — mark paid

- [ ] On a freshly generated `exported` batch, click **Mark paid** →
      confirm dialog → success.
- [ ] **DB** (single transaction via `mark_payout_batch_paid` RPC):
  - [ ] `payout_batches.status='paid'`, `paid_at` set.
  - [ ] All ledger items in batch: `status='released'`, `released_at`
        set.
  - [ ] For every tutor in the batch: `tutor_balances.available_ttd`
        decreased by their batch total. `pending_ttd` unchanged.
- [ ] Tutor wallet reflects the change:
  - [ ] Awaiting bank transfer drops by the paid amount.
  - [ ] Lifetime paid increases by same amount.
  - [ ] Activity list shows that session with status pill **Paid**
        plus batch ID + paid date in the row footer.
- [ ] Try to mark paid again on the same batch → API returns 400
      (RPC raises "Batch is not in exported status").

---

## §20 — RLS sanity

The Supabase client is **not** exposed on `window` in this app, so
test via REST directly. Grab a user's JWT from
`localStorage` → `sb-<project>-auth-token` → `access_token`.

- [ ] Tutor A reading another tutor's payout account → empty array:
  ```bash
  curl -s "https://<project>.supabase.co/rest/v1/tutor_payout_accounts?select=*" \
    -H "apikey: <ANON_KEY>" \
    -H "Authorization: Bearer <Tutor A JWT>" | jq length
  # Expect: 1 (their own row) — never another tutor's
  ```
- [ ] Student fetches admin pending payouts:
  ```bash
  curl -i -H "Authorization: Bearer <Student JWT>" \
    "https://<preview>/api/admin/payouts/pending"
  # Expect: HTTP/1.1 403
  ```
- [ ] Tutor fetches admin export endpoint:
  ```bash
  curl -i -X POST -H "Authorization: Bearer <Tutor JWT>" \
    "https://<preview>/api/admin/payouts/export"
  # Expect: HTTP/1.1 403
  ```
- [ ] Tutor reading payout_ledger only returns their own rows:
  ```bash
  curl -s "https://<project>.supabase.co/rest/v1/payout_ledger?select=tutor_id" \
    -H "apikey: <ANON_KEY>" \
    -H "Authorization: Bearer <Tutor A JWT>" | jq -r '.[].tutor_id' | sort -u
  # Expect: only Tutor A's uid
  ```

---

## §21 — Notification content

After §2:

- [ ] Inspect the two notification rows:
  ```sql
  SELECT type, title, message, link, user_id
  FROM notifications
  WHERE created_at > now() - interval '5 min'
  ORDER BY created_at DESC LIMIT 5;
  ```
- [ ] **Student `payment_succeeded`** row:
  - [ ] `message` includes the correct **amount** in TTD.
  - [ ] `message` references the **tutor's name** (not their UUID).
  - [ ] `link` opens the booking on `/student/bookings/<id>` (or the
        relevant student page) — click and confirm 200.
- [ ] **Tutor `booking_confirmed`** row:
  - [ ] `title` reads "New paid booking" or equivalent.
  - [ ] `message` includes duration/student name.
  - [ ] `link` opens `/tutor/bookings/<id>` — click and confirm 200.
- [ ] After §8 (expired session) — student got `payment_failed` with
      a working `link` back to checkout.
- [ ] After §10/§11 (slot conflict) — affected student got
      `payment_failed` mentioning the slot conflict.
- [ ] After §12 (refund) — payer got `payment_refunded` mentioning
      the refunded amount.

---

## §22 — Email delivery

- [ ] Run `vercel logs --since 30m | grep -i resend` (or open Resend
      dashboard → Activity).
- [ ] Confirm the following emails actually fire after §2:
  - [ ] Payment confirmation to student
  - [ ] Booking notification to tutor
- [ ] Open one of each email and confirm:
  - [ ] Sender = `RESEND_FROM_EMAIL`
  - [ ] Subject is sensible (no `undefined`, no UUIDs)
  - [ ] Amount, tutor/student name, scheduled time render correctly
  - [ ] Any "View booking" CTA points to the preview URL, not
        `localhost`
  - [ ] Plain-text fallback is not empty
- [ ] After §12 — refund email (if implemented) reaches the payer.
      If no refund email is wired, log it under "Issues found".

---

## §23 — `PAID_CLASSES_ENABLED=false` regression

If someone toggles the feature flag off in production, the platform
must fall back to free booking, not crash.

- [ ] Set `PAID_CLASSES_ENABLED=false` in Vercel preview env →
      redeploy (or override locally and run `npm run dev`).
- [ ] Sign in as Student A → book a slot with T1.
- [ ] **Expected**: NO redirect to LuniPay. Booking is created
      immediately as free.
- [ ] **DB**:
  - [ ] `bookings.status='CONFIRMED'`, `payment_required=false`,
        `payment_status='unpaid'`, `price_ttd=0`.
  - [ ] No `payments` row.
  - [ ] No `payout_ledger` row.
- [ ] `/student/bookings` shows the free booking.
- [ ] **Reset** `PAID_CLASSES_ENABLED=true` and redeploy before
      moving on.

---

## §24 — Reconciliation queries

Run after §1–§23 are complete. Numbers should reconcile.

- [ ] **Tutor balances reflect only money still on the platform**.
      `released` ledger rows represent money that has left the
      platform (paid to tutor's bank), so they are **excluded** from
      the equation. The remaining `owed` + `release_ready` rows must
      equal the sum of `pending_ttd + available_ttd`:
  ```sql
  SELECT
    (SELECT COALESCE(SUM(pending_ttd + available_ttd), 0)
       FROM tutor_balances)                            AS balances_total,
    (SELECT COALESCE(SUM(amount_ttd), 0)
       FROM payout_ledger
       WHERE status IN ('owed', 'release_ready'))      AS unpaid_ledger_total;
  -- balances_total == unpaid_ledger_total
  ```
- [ ] **Per-tutor lifetime paid** equals sum of released ledger rows:
  ```sql
  SELECT tb.tutor_id,
         tb.lifetime_paid_ttd,
         COALESCE(pl.released_total, 0) AS released_total
  FROM tutor_balances tb
  LEFT JOIN (
    SELECT tutor_id, SUM(amount_ttd) AS released_total
    FROM payout_ledger
    WHERE status='released'
    GROUP BY tutor_id
  ) pl ON pl.tutor_id = tb.tutor_id
  WHERE tb.lifetime_paid_ttd <> COALESCE(pl.released_total, 0);
  -- Expect: 0 rows
  ```
- [ ] **Stuck payments** (paid, no booking, not refunded):
  ```sql
  SELECT id, lunipay_checkout_session_id, paid_at, cancel_reason
  FROM payments
  WHERE status='succeeded' AND booking_id IS NULL
  ORDER BY paid_at DESC;
  -- After §12, this should be 0 rows.
  ```
- [ ] **Webhook coverage** — every webhook-materialized payment has a
      matching event row:
  ```sql
  SELECT COUNT(*) FROM payments p
  WHERE p.status='succeeded'
    AND COALESCE(p.raw_provider_payload->>'source','') <> 'finalize'
    AND NOT EXISTS (
      SELECT 1 FROM lunipay_webhook_events e
      WHERE e.payment_id = p.id
    );
  -- Expect: 0
  ```

---

## §25 — Edge cases worth a 60-second probe

(Items previously listed elsewhere have been pulled out into their
own sections; these are the leftovers.)

- [ ] **Student closes the LuniPay tab without paying**: no DB rows,
      no ghost booking. (Distinct from §8 — this is "abandoned
      pre-checkout", §8 is "session timed out".)
- [ ] **Same student rapidly clicks "Book session" twice**: at most
      one LuniPay session opens; if two open, only one ends up with
      a CONFIRMED booking — see §11.
- [ ] **Mobile**: run §2 on a phone (the LuniPay checkout iframe and
      the success-page polling can have viewport issues).
- [ ] **Network blip during success polling**: throttle to "Slow 3G"
      in DevTools after LuniPay redirect; the success page should
      retry and resolve, not hang forever.

---

## Issues found

| # | Date | Section | Severity | Description | Status |
|---|------|---------|----------|-------------|--------|
|   |      |         |          |             |        |

---

## Sign-off

- [ ] All sections above passed (or any failures fixed and re-tested).
- [ ] Reconciliation queries clean.
- [ ] No unexpected 5xx errors in
      `vercel logs --since 1h | grep " 5[0-9][0-9] "`.
- [ ] Ready to start `NEXT_STEPS_LUNIPAY_GO_LIVE.md` §3 (sandbox →
      live).

Tested by: ____________  Date: ____________
