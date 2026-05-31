# Cancellation / Refund Payment Layer — Implementation Report

**Branch:** `feature/payment-integration`
**Commit:** `4cdf45b`
**Plan:** `c:\Users\jvpg5\.cursor\plans\refund-cancellation-payments_04df4d9a.plan.md` (§1 only — payment-system slice)

This slice ships the financial primitive that every cancellation, late-cancel, and no-show flow now layers on. It does **not** ship counters, strikes, auto-ratings, evidence upload, or UI modals — those consume what's here.

---

## 1. Files added / changed

| File | Type | Lines |
|---|---|---|
| `supabase/migrations/152_partial_refunds.sql` | new | 363 |
| `lib/payments/refundService.ts` | new | 312 |
| `app/api/admin/payments/[paymentId]/refund/route.ts` | rewrite | 102 (was 178) |
| `app/api/bookings/[bookingId]/cancel/route.ts` | new | 161 |
| `app/api/admin/noshow/[sessionId]/resolve/route.ts` | new | 159 |
| `scripts/smoke-test-partial-refund.ts` | new | 234 |
| `scripts/apply-staging-migrations.ts` | extended | +14 |

Total: **1,415 insertions / 134 deletions**.

---

## 2. Migration 152 — schema + atomic RPC

### 2a. Payment table additions

```sql
ALTER TABLE payments
  ADD COLUMN refund_amount_ttd   numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN retained_amount_ttd numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN total_refunded_ttd  numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN refunded_at         timestamptz;
```

- `refund_amount_ttd` — last refund (for receipts).
- `retained_amount_ttd` — partial-retention amount on the most recent refund.
- `total_refunded_ttd` — cumulative across multiple refunds; drives idempotency.
- `refunded_at` — set on each refund.

### 2b. Constraint extensions

| Constraint | Change |
|---|---|
| `payments_status_check` | adds `'partially_refunded'` |
| `payments_total_refunded_within_amount` | new: `total_refunded_ttd <= amount_ttd + 0.005` |
| `sessions_status_check` | adds `'NO_SHOW_TUTOR'` and `'MUTUAL_NON_COMPLETION'` |

`payout_ledger.status` already had `'reversed'` (mig 020) — no change needed.

`cancel_reason` stays free-form text. New canonical taxonomy is documented in the migration header but **not** enforced via CHECK so legacy values (`'refunded_by_admin'`, `'duplicate_active_payment_cleanup'`) keep working.

### 2c. `apply_refund_side_effects(p_payload jsonb)`

Single transaction that owns everything ledger-shaped. Caller hands it the LuniPay refund payload plus the refund/retention split; it:

1. `FOR UPDATE` locks the `payments` row, bumps `total_refunded_ttd`, sets `refund_amount_ttd / retained_amount_ttd / refunded_at / cancel_reason`, appends the refund object to `raw_provider_payload.refunds`, and flips `status` to `'refunded'` (cumulative ≥ amount) or `'partially_refunded'`.
2. Resolves session via `booking_id`. If absent (slot-conflict refund stub), returns early with `ledger_action='no_session'`.
3. `FOR UPDATE` locks the `payout_ledger` row for that session.
4. Branches on ledger state:
   - **Existing `'owed'` row, retention > 0** → UPDATE in place to retained payout, keep `'owed'` (`ledger_action='replaced'`). Adjusts `tutor_balances.pending_ttd`.
   - **Existing `'owed'` row, retention = 0** → UPDATE to `'reversed'` (`ledger_action='reverted'`). Subtracts old amount from `pending_ttd`.
   - **No row, retention > 0** → INSERT row at retained payout (`ledger_action='inserted'`). Updates `sessions.charge_amount_ttd / payout_amount_ttd / platform_fee_ttd` so wallet/admin views match.
   - **No row, retention = 0** → no ledger work (`ledger_action='no_session'`).
5. Defense-in-depth: raises `ledger_already_advanced` if the row is `'release_ready'` or `'released'`. The service layer also blocks this before the LuniPay call.
6. Optional `session_status_override` (used by the no-show resolve route to set `NO_SHOW_STUDENT` / `NO_SHOW_TUTOR` / `MUTUAL_NON_COMPLETION`). When omitted and refund is full + no ledger row, defaults to `'CANCELLED'` so the cron skips it.
7. Returns `{ new_payment_status, total_refunded_ttd, ledger_action, session_id, tutor_id }`.

`SECURITY DEFINER`, granted to `service_role`.

---

## 3. `lib/payments/refundService.ts`

Single function, three callers.

```ts
refundPayment({
  paymentId, reason, refundAmountTtd?, retainedAmountTtd?,
  actorId, sessionStatusOverride?, client?,
}): Promise<RefundResult>
```

`RefundResult` is a discriminated union (`{ ok: true, ... }` | `{ ok: false, code, status, message, details? }`) so each route surfaces consistent HTTP statuses without re-implementing error mapping.

### Order of operations

1. Validate args.
2. Load payment (`succeeded` or `partially_refunded` only).
3. Compute `remaining = amount_ttd - total_refunded_ttd`.
4. Reject if cumulative refund would exceed amount, or if `refund + retained > amount`.
5. **Pre-flight ledger guard**: if the matching `payout_ledger` row is `'release_ready'` or `'released'`, return `409 ledger_already_advanced` **before** calling LuniPay.
6. Compute commission split for the retained share via `calculateCommission()` from `lib/utils/commissionCalculator.ts`.
7. Build per-refund idempotency key: `refund-${paymentId}-${priorRefunds + 1}`. Counts existing entries in `raw_provider_payload.refunds`. The old route used `refund-${paymentId}` which made a second partial refund return the cached first refund.
8. Call `lunipay.payments.refund(lunipay_payment_id, { amount, reason: 'requested_by_customer', metadata }, { idempotencyKey })`.
9. Hand everything to `apply_refund_side_effects` RPC.
10. Best-effort notifications:
    - `payment_refunded` to payer (always).
    - `booking_cancelled` to tutor only when payout drops to zero (partial-retention still pays them, so a generic "cancelled" message would be misleading).
11. If the RPC fails after a successful LuniPay refund, returns `ok: true` with a `warning` field rather than 500-ing — money has already moved on the card and an operator must reconcile.

### Reason taxonomy

```ts
type RefundReason =
  | 'student_cancelled' | 'tutor_cancelled' | 'tutor_noshow'
  | 'tie_inconclusive' | 'slot_conflict' | 'student_late_cancel'
  | 'student_noshow'   | 'admin_manual';
```

---

## 4. Routes

### 4a. `POST /api/admin/payments/[paymentId]/refund` — refactored

Now a thin wrapper over `refundPayment()`. **Backward compatible:**
- Empty body or no reason → `'admin_manual'` full refund (matches old behaviour).
- Legacy LuniPay reasons (`duplicate` / `fraudulent` / `requested_by_customer`) all map to `'admin_manual'`.
- Adds `retained_amount_ttd` body param for partial-retention flows.
- Returns `409 ledger_already_advanced` when applicable (new).

### 4b. `POST /api/bookings/[bookingId]/cancel` — new

```json
{ "canceller": "student" | "tutor", "late": false, "reason": "..." }
```

- Cookie-session auth: caller must own the booking on the canceller side.
- Loads the active `succeeded` / `partially_refunded` payment.
- Refund shape per policy:
  | Canceller | Late | Refund | Retained | Reason |
  |---|---|---|---|---|
  | tutor | — | full | 0 | `tutor_cancelled` |
  | student | false | full | 0 | `student_cancelled` |
  | student | true | 50% | 50% | `student_late_cancel` |
- Flips `bookings.status='CANCELLED'`, sets `cancelled_at` and `last_action_by`.
- Free / unpaid bookings: cancels cleanly without invoking the refund service.
- Already-cancelled bookings return `{ already_cancelled: true }` idempotently.

### 4c. `POST /api/admin/noshow/[sessionId]/resolve` — new

```json
{ "outcome": "student_noshow" | "tutor_noshow" | "tie" }
```

- Admin-only (`requireAdmin('full')`).
- Loads session → booking → active payment.
- Outcome → refund shape + session status:
  | Outcome | Refund | Retained | Reason | Session status |
  |---|---|---|---|---|
  | `student_noshow` | 50% | 50% | `student_noshow` | `NO_SHOW_STUDENT` |
  | `tutor_noshow` | 100% | 0 | `tutor_noshow` | `NO_SHOW_TUTOR` |
  | `tie` | 100% | 0 | `tie_inconclusive` | `MUTUAL_NON_COMPLETION` |
- Hands the session status to the RPC via `sessionStatusOverride`.

This endpoint is the manual-resolve entry point. The eventual `noshow_claims` workflow (evidence upload, 12-hour response cron) will produce inputs to this same primitive.

---

## 5. Tooling

### 5a. `scripts/apply-staging-migrations.ts`

Now applies `150 → 151 → 152` (idempotent — safe to re-run). Probe at the end verifies:

- `payments.booking_id` is nullable.
- `materialize_paid_booking` exists.
- `apply_refund_side_effects` exists.
- `payments.total_refunded_ttd` column exists.
- `payments_status_check` def includes `'partially_refunded'`.

### 5b. `scripts/smoke-test-partial-refund.ts`

Dry-run + execute modes for verifying mig 152 + the RPC end-to-end on staging without touching LuniPay.

```bash
npx tsx scripts/smoke-test-partial-refund.ts             # lists candidates only
npx tsx scripts/smoke-test-partial-refund.ts --execute   # runs 50/50 on first candidate
npx tsx scripts/smoke-test-partial-refund.ts --payment <id> --execute
```

Snapshots BEFORE / AFTER for `payments` + `sessions` + `payout_ledger` + `tutor_balances`, calls `apply_refund_side_effects` with a synthetic LuniPay payload, then asserts:

- `payments.status = 'partially_refunded'`
- `payments.total_refunded_ttd ≈ refundAmount`
- `payments.retained_amount_ttd` matches request
- ledger row present and not in `release_ready` / `released`
- `tutor_balances.pending_ttd >= 0`

---

## 6. Failure modes the slice handles

| Scenario | Behaviour |
|---|---|
| Payment already `partially_refunded` | Routes still accept further partial refunds up to the cumulative cap. |
| Cumulative refund > amount | `400 over_refund` (service + DB CHECK). |
| Ledger advanced past `'owed'` | `409 ledger_already_advanced` before LuniPay call. |
| LuniPay refund fails | `502 lunipay_refund_failed`; nothing persisted. |
| RPC fails after LuniPay refund | `200` with `warning` field — operator reconciles. |
| Multiple partial refunds | Per-refund idempotency key (`refund-<id>-<n>`) so each gets a distinct LuniPay refund. |
| No payment on booking (free) | Cancel route still flips `bookings.status='CANCELLED'`. |
| No session row yet (cron hasn't fired) | RPC handles via session-status default to `'CANCELLED'` so cron skips. |

---

## 7. Out of scope (deferred, no breaking changes needed later)

- `cancellation_events` audit table.
- `bookings.cancelled_by` / `is_late_cancellation` / `rescheduled_from_booking_id`.
- 30-day / 90-day rolling cancellation counters and warning thresholds.
- Late-cancel auto-rating (2★) and no-show auto-rating (1★) inserts.
- `noshow_claims` / `noshow_claim_log` / evidence upload / 12-hour response cron.
- Tutor strike counter; student abuse controls; prepay/cooldown; repeat no-show fee ladder.
- Frontend cancel/reschedule modals; admin no-show dashboard UI.
- Clawback for already-released payouts.

All of these consume the `refundPayment()` + `apply_refund_side_effects` primitives without modification.

---

## 8. Deploy / verify checklist

1. Vercel preview for `feature/payment-integration` builds clean (no new env vars required).
2. Apply migration:
   ```powershell
   npx tsx scripts/apply-staging-migrations.ts
   ```
3. Confirm probe shows:
   - `apply_refund_rpc_exists: t`
   - `payments_total_refunded_column: t`
   - `payments_status_check` def contains `'partially_refunded'`.
4. Dry-run the smoke test, pick a throwaway paid booking:
   ```powershell
   npx tsx scripts/smoke-test-partial-refund.ts
   ```
5. Execute against that booking:
   ```powershell
   npx tsx scripts/smoke-test-partial-refund.ts --payment <id> --execute
   ```
6. Verify all five assertions PASS.
7. End-to-end UI test (student late-cancel via the new endpoint) is the next step once the cancel modal lands.
