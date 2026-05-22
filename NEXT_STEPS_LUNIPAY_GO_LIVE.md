# LuniPay → Go-Live Plan

End-to-end test plan for staging, the gaps that block real-money testing,
and the sequence to flip from sandbox to live.

---

## 0. Current state (what you have right now)

- **Booking flow**: payment-first. `/api/bookings/direct-book` creates a LuniPay
  checkout session, no DB rows. Browser is redirected to LuniPay.
- **Webhook**: `/api/payments/lunipay/webhook` materialises the booking + payment
  + meeting link on `checkout.session.completed`. Idempotent on
  `lunipay_checkout_session_id`.
- **Finalize fallback**: `/api/payments/lunipay/finalize?session_id=…` runs the
  same logic synchronously off the LuniPay session if the webhook is slow or
  missing. Called from the success page after an 8s poll.
- **Payouts pipeline**: tutor-side bank form, admin `/admin/payouts` page,
  bank-CSV export, mark-paid RPC. Migration 147 applied to staging.
- **Provider account**: LuniPay TEST mode (`sk_test_…`). Webhook configured
  against staging Vercel preview alias.

---

## 1. Known gaps (must fix before live)

### 1.1 Release-window automation MISSING

The existing `release_payout(p_session_id)` RPC (migration 136) flips
`payout_ledger.status` from `owed` → `released` directly. It is only called by
`/api/payments/lunipay/release`, which is **not invoked by any cron**.

The admin Payouts page (migration 147) filters `status = 'release_ready'`,
which nothing currently produces. **Result**: zero rows show up for the admin
to export, even after sessions complete.

**Fix (small migration + cron):**
1. New migration `148_payout_release_window.sql`:
   - RPC `flip_owed_to_release_ready(p_grace_hours int)` that, in one
     transaction:
     - selects `payout_ledger` rows with `status='owed'` whose
       `sessions.charged_at < now() - p_grace_hours * interval '1 hour'`
     - flips them to `release_ready`
     - shifts each tutor's `pending_ttd → available_ttd`.
2. New cron `/api/cron/flip-payouts-release-ready` calling the RPC daily
   (`vercel.json` schedule `0 4 * * *`).
3. Make grace hours configurable via env (`PAYOUT_GRACE_HOURS`, default
   `168` = 7 days, the LuniPay settlement floor).

### 1.2 Tutor wallet UI is not surfacing the new flow

`/tutor/wallet` (if it exists) should render `tutor_balances` with three lines:

| Label                  | Source                                    |
|------------------------|-------------------------------------------|
| Pending (in escrow)    | `tutor_balances.pending_ttd`              |
| Awaiting bank transfer | `tutor_balances.available_ttd`            |
| Lifetime paid          | `SUM(payout_ledger.amount_ttd) WHERE status='released'` |

If there's no wallet page, scope a small one before launch — tutors will ask.

### 1.3 LuniPay webhook URL hard-coupled to the preview alias

`https://itutor-platform-git-feature-pay-e642ab-…vercel.app/api/payments/lunipay/webhook`
is the staging URL. Production URL must be added to LuniPay (live mode) when
you flip the merchant account. Don't reuse the test endpoint.

### 1.4 Migration 147 not in production yet

Run before live: `npx supabase db push` against the production project
(separate `--project-ref` from staging).

### 1.5 RLS on `tutor_payout_accounts` writes

Mig 147 added admin SELECT, but the original mig 020 didn't define INSERT/
UPDATE policies. Tutors hit the API route (service-role), so it works today,
but if anyone later switches the form to direct-Supabase writes it'll fail
silently. Consider adding a tutor-write policy now to be safe:

```sql
CREATE POLICY "Tutors can upsert their payout account"
ON tutor_payout_accounts FOR ALL TO authenticated
USING  (tutor_id = auth.uid())
WITH CHECK (tutor_id = auth.uid());
```

### 1.6 No payout history visible to tutors

Tutors should be able to see batches their earnings landed in. Add to
`/tutor/wallet`:
- list of `payout_ledger` rows with their `batch_id`, `released_at`,
  `amount_ttd`, status badge.

### 1.7 CSV format is generic

Current columns: `tutor_id, name, bank_name, branch, account_number,
account_type, amount_ttd, reference`. Trinidad bulk-payment files (RBC,
Republic, First Citizens) use proprietary columns and fixed-width formats.
Confirm the **specific** bank format before first real payout and update
`app/api/admin/payouts/export/route.ts`.

### 1.8 Refund path for `slot_conflict_needs_refund` is manual

The webhook + finalize correctly mark the payment with
`cancel_reason='slot_taken_after_payment_needs_refund'` and notify the student,
but **no refund is issued**. Either:
- add `/api/admin/payments/[paymentId]/refund` calling
  `lunipay.refunds.create(...)`, or
- handle manually from the LuniPay dashboard for now and document that.

---

## 2. End-to-end testing — STAGING (sandbox)

Run all of these against the preview deployment after the 1.1 fix is shipped.

### 2.1 Pre-flight DB state

```sql
-- All present?
SELECT to_regclass('public.payout_batches'),
       to_regclass('public.lunipay_webhook_events'),
       to_regclass('public.session_reminders');

-- Lunipay columns present?
SELECT column_name FROM information_schema.columns
WHERE table_name='payments' AND column_name LIKE 'lunipay%';
```

Expected: all non-null, four `lunipay_*` columns.

### 2.2 Test cards (LuniPay sandbox / Stripe test)

| Scenario             | Card number          |
|----------------------|----------------------|
| Success              | 4242 4242 4242 4242  |
| Decline (generic)    | 4000 0000 0000 0002  |
| Insufficient funds   | 4000 0000 0000 9995  |
| 3DS required         | 4000 0027 6000 3184  |
| Disputed             | 4000 0000 0000 0259  |

Any future expiry, any 3-digit CVC, any name/postcode.

### 2.3 Happy-path booking (~5 min)

1. Sign in as a student with a verified email.
2. Open a tutor profile that has paid sessions enabled and a price > 0.
3. Pick a 1-hour slot, click **Book session**.
4. Expect: redirected to LuniPay checkout (test mode banner visible).
5. Pay with `4242 4242 4242 4242`.
6. Expect: lands on `/payments/success?session_id=cs_test_…` showing
   "Confirming your payment…" briefly, then the receipt with subject, tutor,
   duration, scheduled time, amount, fee breakdown.
7. **Verify in DB:**
   - `payments` row: `provider='lunipay'`, `status='succeeded'`,
     `lunipay_checkout_session_id` set, `paid_at` recent, `booking_id` set.
   - `bookings` row: `status='CONFIRMED'`, `payment_status='paid'`.
   - `sessions` row: `join_url` populated (Google Meet).
   - `lunipay_webhook_events` row exists for this `session_id`.
   - Two `notifications` rows (student + tutor).
8. **Verify in `/student/bookings`**: appears under Upcoming, shows Meet link.
9. **Verify in `/tutor/sessions`**: tutor sees the new paid booking.

### 2.4 Webhook-down resilience

1. In LuniPay dashboard → Webhooks → temporarily **disable** the test endpoint.
2. Repeat 2.3.1–2.3.6.
3. Expect: success page sits on "Confirming your payment…" for ~8s, then auto-
   triggers `/api/payments/lunipay/finalize` and resolves to a real receipt.
4. Verify DB rows are identical to 2.3.7 except `lunipay_webhook_events` is
   empty (raw payload includes `source: 'finalize'` instead).
5. **Re-enable the webhook.**

### 2.5 Decline

1. Repeat 2.3 with `4000 0000 0000 0002`.
2. Expect: LuniPay shows "Card declined", student stays on checkout, can retry.
3. Verify DB: **no** `payments` or `bookings` row created (this is the whole
   point of payment-first).

### 2.6 Slot conflict during payment

Hard to provoke organically — easier to assert with a script:

1. Tutor A has a free slot at T.
2. Student S1 starts checkout for T (don't pay yet).
3. As an admin, manually `INSERT` a `CONFIRMED` booking for tutor A at T.
4. Student S1 completes payment.
5. Expect: webhook (or finalize) records the payment with
   `cancel_reason='slot_taken_after_payment_needs_refund'` and `booking_id=NULL`.
6. Expect: success page shows "Your payment went through, but the time slot
   was no longer available. We will refund you shortly."
7. Expect: notification to student of type `payment_failed`.
8. **Manual step**: refund via LuniPay dashboard until 1.8 is built.

### 2.7 Idempotency

1. Repeat 2.3.
2. After it succeeds, manually replay the webhook from the LuniPay dashboard.
3. Expect: 200 response with `status: 'duplicate'`. No second booking row.

### 2.8 Bank-account form

1. Sign in as the tutor used in 2.3.
2. `/tutor/settings` → **Payouts**.
3. Fill in: name, bank name, branch, account number, type. Save.
4. **Verify**: row in `tutor_payout_accounts` with all fields populated.
5. Reload page; values should hydrate.

### 2.9 Admin payouts pipeline (after 1.1 cron fix)

1. Force a session into `release_ready`:
   ```sql
   -- Pick a session that has been charged
   UPDATE payout_ledger SET status='release_ready'
   WHERE session_id='<id>' AND status='owed';
   UPDATE tutor_balances
   SET pending_ttd = pending_ttd - <amount>,
       available_ttd = available_ttd + <amount>
   WHERE tutor_id='<tutor_id>';
   ```
2. Sign in as admin (`profiles.role='admin'`). Open `/admin/payouts`.
3. Tutor row should appear with bank details and amount.
4. Click **Generate batch CSV**. CSV downloads. `payout_batches` row created
   with `status='exported'`. `payout_ledger.batch_id` is stamped on the items.
5. Click **Mark paid**. RPC fires:
   - `payout_ledger.status='released'`, `released_at` set.
   - `tutor_balances.available_ttd` decremented.
   - `payout_batches.status='paid'`, `paid_at` set.
6. Verify the tutor's `tutor_balances.available_ttd` matches expectations.
7. Generate another batch with no eligible items → expect 400
   "No payouts ready to export".

### 2.10 Cancel flow

1. Generate a batch.
2. Click **Cancel** before marking paid.
3. Verify: ledger items have `batch_id=NULL` and remain `release_ready`.
4. Generate again → same items reappear in the new batch.

### 2.11 Tutor missing bank details

1. Force a tutor's `tutor_payout_accounts` row to NULL (or delete it).
2. Manually flip one of their sessions to `release_ready`.
3. Open `/admin/payouts` → expect amber warning, tutor in skipped list on
   export, line stays `release_ready` for next batch.

---

## 3. Move sandbox → live

In strict order. **Don't skip 3.1.**

### 3.1 KYC + bank account on LuniPay LIVE

LuniPay is Stripe-powered. New live merchants:
- complete Stripe Express onboarding (business docs, ID, ownership)
- connect a TT bank account (this is iTutor's destination for incoming card
  charges)
- accept LuniPay TOS section 5.5 (settlement timeline)

Until this clears, **`sk_live_…` won't work** even if you have it.

### 3.2 Production env vars (Vercel: Production scope)

| Var                       | Value source                                       |
|---------------------------|----------------------------------------------------|
| `LUNIPAY_SECRET_KEY`      | `sk_live_…` from LuniPay live dashboard             |
| `LUNIPAY_WEBHOOK_SECRET`  | `whsec_…` from the LIVE webhook endpoint            |
| `LUNIPAY_PUBLISHABLE_KEY` | `pk_live_…` (informational; not used server-side)   |
| `PAID_CLASSES_ENABLED`    | `true`                                              |
| `NEXT_PUBLIC_APP_URL`     | `https://app.myitutor.com` (or whatever prod is)    |
| `PAYOUT_GRACE_HOURS`      | `168` (7 days) — applies after 1.1 ships            |
| All Supabase vars         | The PRODUCTION Supabase project, not staging        |
| `CRON_SECRET`             | A new value — don't reuse staging's                 |

Add via:
```powershell
vercel env add LUNIPAY_SECRET_KEY production
# repeat for each
vercel deploy --prod
```

### 3.3 Production Supabase migrations

```powershell
# Link CLI to prod project (different ref than staging)
$env:SUPABASE_DB_PASSWORD = "<prod password>"
npx supabase link --project-ref <prod-ref>
npx supabase migration list   # check sync state
npx supabase db push          # applies any pending migrations including 147 + 148
```

### 3.4 LuniPay LIVE webhook

In LuniPay → Webhooks (toggled to LIVE):
- URL: `https://app.myitutor.com/api/payments/lunipay/webhook`
- Events: `checkout.session.completed`, `checkout.session.expired`,
  `payment.succeeded`, `payment.failed`
- Copy the new `whsec_…` into Vercel production env.

### 3.5 Smoke test with a $1 real card

1. Use a real personal card.
2. Book a $1 test session (create a one-off tutor profile with `price_ttd=1`).
3. Confirm the full happy path 2.3 against production.
4. Confirm the charge appears in LuniPay live dashboard balance.
5. Refund yourself from the LuniPay dashboard.
6. Disable the $1 tutor profile.

### 3.6 Tutor onboarding for payouts

Before the first real student pays:
- All active tutors fill in `/tutor/settings` → Payouts → bank details.
- Send an email reminder to tutors with `tutor_payout_accounts` missing.

### 3.7 First payout cycle (week 1 post-launch)

After the 7-day grace period elapses for the first batch of completed sessions:
- Run `/admin/payouts` → confirm pending list matches expectations.
- Generate batch CSV.
- Open it in Excel/Sheets; spot-check 3-5 rows against `tutor_balances`.
- Convert to your bank's required format manually for the FIRST run (don't
  trust the automated format until you've eyeballed one cycle).
- Submit to bank.
- **Don't mark paid until the bank confirms transfer cleared.**
- Mark paid in admin → verify `tutor_balances` reconciles.

---

## 4. Monitoring + ops

### 4.1 Logs to watch in the first week

Vercel logs filter:
```
vercel logs --query "lunipay" --since 24h --json
```

Things to grep for:
- `[lunipay/webhook] Signature verification failed` — wrong secret
- `[lunipay/webhook] Failed to create booking` — schema drift
- `[lunipay/webhook] Slot conflict on payment success` — race; needs refund
- `[lunipay/finalize] sessions.retrieve failed` — LuniPay API down or bad key
- `Failed to schedule reminders` — 100_add_session_reminders not applied (prod
  has it; safe to ignore on staging)

### 4.2 Manual reconciliation queries

Pending payouts vs. LuniPay balance:
```sql
SELECT SUM(available_ttd) AS available, SUM(pending_ttd) AS pending
FROM tutor_balances;
```
Compare to LuniPay dashboard balance. Should be:
`(LuniPay balance) ≈ (pending + available + iTutor commission accrued not yet withdrawn)`

Stuck payments (paid but no booking):
```sql
SELECT id, lunipay_checkout_session_id, paid_at, cancel_reason
FROM payments
WHERE status='succeeded' AND booking_id IS NULL
ORDER BY paid_at DESC;
```
These need refunds.

Webhook latency (only meaningful if mig for `lunipay_webhook_events.received_at`
exists, which it does):
```sql
SELECT
  date_trunc('hour', received_at) AS hour,
  COUNT(*) AS events,
  AVG(EXTRACT(EPOCH FROM received_at - (raw_payload->>'created')::timestamptz)) AS avg_lag_sec
FROM lunipay_webhook_events
GROUP BY 1 ORDER BY 1 DESC LIMIT 24;
```

### 4.3 Alerts to set up (post-launch)

- LuniPay → notification on every `payment.failed` (built-in).
- Vercel → integration alert on any 5xx from `/api/payments/lunipay/*`.
- Supabase → cron-failure email on the daily release cron (1.1).

---

## 5. Sequence of work, prioritised

**Before any real-money testing:**
1. Build 1.1 (release-window cron) — half a day.
2. Build 1.2 minimally (`/tutor/wallet` even if read-only) — half a day.
3. Run tests 2.1–2.11 on staging end-to-end. Fix issues found.

**Before public launch:**
4. Bank-format CSV adjustment (1.7) once you've picked the bank.
5. Refund endpoint (1.8) or written manual procedure.
6. RLS policy on `tutor_payout_accounts` (1.5) — 5 minutes.
7. Tutor payout history view (1.6) — 1-2 hours.

**At launch:**
8. KYC + production env + prod migrations + prod webhook (3.1–3.4).
9. $1 real-card smoke test (3.5).
10. Tutor bank-info collection campaign (3.6).

**First month:**
11. Run section 4 reconciliation queries weekly.
12. After 1-2 successful payout cycles, automate the bank-format conversion
    fully and remove the eyeball step in 3.7.
