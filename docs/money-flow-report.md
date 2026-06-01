# iTutor Money Flow Report

Covers every scenario in which money moves into, through, or out of the platform. All amounts are in Trinidad and Tobago Dollars (TTD) unless noted.

---

## Platform Fundamentals

### Commission Tiers

Applied at booking/enrollment time and frozen — not recalculated retroactively if tiers change.

| Session charge | Platform fee | Tutor receives |
|---------------|-------------|----------------|
| < TT$100 | 10% | 90% |
| TT$100 – TT$199 | 15% | 85% |
| ≥ TT$200 | 20% | 80% |

### Payment Providers

| Provider | Status | Used for |
|----------|--------|---------|
| LuniPay (Stripe-backed) | Live | Group subscriptions, direct bookings |
| WiPay | Stub — returns mocks only | Referenced in code; no real charges |

### Core Tables

| Table | Tracks |
|-------|--------|
| `payments` | One-off booking payments |
| `subscription_payments` | Group subscription charges |
| `subscription_refunds` | Refunds on subscription payments |
| `payout_ledger` | Tutor earnings (escrow → released) |
| `tutor_balances` | Running tutor balance (pending / available) |
| `tutor_earnings` | Per-session earnings record |
| `group_enrollments` | Enrollment + billing state per student per group |
| `group_removals` | Audit trail for member removals + refund amounts |
| `payout_cases` | Admin-managed dispute cases |
| `cancellation_events` | Student cancellation history (rolling 30-day) |
| `tutor_strikes` | Tutor reliability strikes (90-day rolling) |
| `noshow_claims` | Student-raised no-show disputes |

---

## Payment Status Machines

### One-off payments (`payments.status`)
```
initiated → requires_action → succeeded
                            ↘ failed
                            ↘ cancelled   (checkout expired)
                succeeded → refunded
                succeeded → partially_refunded
```

### Subscription payments (`subscription_payments.status`)
```
PENDING → PAID
        ↘ EXPIRED         (checkout link expired)
        ↘ ACTIVATION_FAILED
PAID    → REFUNDED
PAID    → PARTIALLY_REFUNDED
```

### Payout ledger (`payout_ledger.status`)
```
owed → release_ready → released
owed → admin_hold → [released | reversed]   (disputed)
any  → reversed                              (full refund)
```

---

## Scenario 1 — 1:1 Lesson, Normal Completion

The baseline flow. Student books, pays, session runs, tutor gets paid after escrow.

```
Student → POST /api/bookings
  Price = hourlyRate / 60 × durationMinutes
  Commission split calculated + frozen on booking row
  Booking status = PENDING
  ↓
Student → POST /api/payments/lunipay/initiate  (or WiPay)
  payments row created (status=initiated)
  LuniPay checkout session created
  ↓
Student completes payment in LuniPay UI
  ↓
LuniPay → POST /api/payments/lunipay/webhook (checkout.session.completed)
  materialize_paid_booking RPC — atomic:
    payments.status = succeeded
    booking.payment_status = paid
    booking.status = CONFIRMED (or PENDING_TUTOR)
  Student notified: payment_succeeded
  Tutor notified: booking_request_received
  ↓
Session scheduled_start approaches
  ↓
Cron: POST /api/cron/process-charges  (runs every minute)
  Finds sessions with charge_scheduled_at ≤ now, charged_at IS NULL
  Marks session: status=COMPLETED_ASSUMED, charged_at=now
  Uses frozen platform_fee_ttd + payout_amount_ttd from session row
  ↓
DB trigger on sessions.charged_at (NULL → value)
  INSERT tutor_earnings (status=EARNED)
  INSERT payout_ledger (status=owed)
  UPSERT tutor_balances (increment pending_ttd)
  ↓
7-day escrow window passes
  ↓
Cron / admin: flip_owed_to_release_ready RPC
  payout_ledger.status = release_ready
  ↓
Admin: POST /api/admin/payouts/create-batch
  create_payout_batch_atomic RPC
  payout_ledger.status = released
  Tutor paid via bank transfer (CSV export)
  tutor_balances: pending_ttd → 0, available_ttd incremented
```

**Money split (example: TT$150 session):**
- Platform fee: 15% = TT$22.50
- Tutor receives: 85% = TT$127.50

---

## Scenario 2 — 1:1 Lesson, Student Cancels (On Time)

```
Student → POST /api/bookings/student-cancel
  classifyCancelTiming(scheduledStartAt):
    > 24h before → isLate=false
  ↓
refundPayment(paymentId, refundAmount=full, retained=0, reason=student_cancelled)
  LuniPay refund issued (100%)
  apply_refund_side_effects RPC:
    payments.status = refunded
    payout_ledger.status = reversed   (if ledger existed)
    tutor_balances.pending_ttd decremented
  ↓
cancellation_events row inserted (fee_applied=false)
Student notified: payment_refunded
Tutor notified: booking_cancelled
```

**Money split:** Platform TT$0 — full refund to student.

---

## Scenario 3 — 1:1 Lesson, Student Cancels Late (With Retention)

Late cancel = within the configured window (typically < 24h).
Student receives a reliability warning at threshold; after warning, retention applies.

```
Student → POST /api/bookings/student-cancel
  classifyCancelTiming → isLate=true
  getStudentCancelState → reliability_warning previously issued = true
  ↓
retained = charge × 50%   (STUDENT_LATE_CANCEL_RETENTION_PCT)
refundPayment(paymentId, refundAmount=50%, retained=50%, reason=student_late_cancel)
  LuniPay partial refund (50%)
  apply_refund_side_effects RPC:
    payments.status = partially_refunded
    payout_ledger.amount_ttd = retained_payout   (tutor's share of 50%)
    payout_ledger.status = owed (remains)
  ↓
cancellation_events row inserted (fee_applied=true, fee_amount_ttd=retained)
Student notified: payment_refunded (partial)
Tutor notified: booking_cancelled (but keeps partial payout)
```

**Money split (example: TT$150 session, 50% retention):**
- Retained: TT$75
  - Platform fee on retained (15%): TT$11.25
  - Tutor receives: TT$63.75
- Refunded to student: TT$75

---

## Scenario 4 — 1:1 Lesson, Tutor No-Show

```
Admin resolves no-show (or automated after 12h claim window)
  ↓
sessionService.markTutorNoShow(sessionId)
  Session status = NO_SHOW_TUTOR
  refundPayment(full, retained=0, reason=tutor_noshow)
  ↓
apply_refund_side_effects RPC:
  payments.status = refunded
  payout_ledger.status = reversed
  tutor_balances.pending_ttd decremented
  ↓
tutor_strikes INSERT (reason=tutor_noshow, expires 90 days)
Student notified: payment_refunded
Tutor notified: booking_cancelled + strike issued
```

**Money split:** Platform TT$0 — full refund to student, tutor earns nothing.

---

## Scenario 5 — 1:1 Lesson, Student No-Show

```
Cron: process-charges runs at charge_scheduled_at
  Session is scheduled but student didn't join
  Status = COMPLETED_ASSUMED (no early-end detected)
  Full charge captured
  ↓
Tutor optionally marks NO_SHOW_STUDENT (via admin panel)
  sessionService.markStudentNoShow(sessionId)
  Charge stays at 50%
  ↓
apply_refund_side_effects:
  Partial refund (50%) to student
  payout_ledger.amount_ttd = tutor's share of 50%
```

**Money split (TT$150 session):**
- Charged to student: TT$75
  - Platform fee (15%): TT$11.25
  - Tutor receives: TT$63.75
- Refunded to student: TT$75

---

## Scenario 6 — 1:1 Lesson, Slot Conflict After Payment

Race condition: another booking fills the slot between checkout creation and payment completion.

```
LuniPay webhook: checkout.session.completed
  materialize_paid_booking RPC:
    Slot conflict re-check — FAILS
  ↓
Payment orphaned:
  payments.cancel_reason = slot_taken_after_payment_needs_refund
  payments.status = succeeded (money received but no booking)
  ↓
Admin sees orphan on /api/admin/payments/refundable
  Issues manual refund: POST /api/admin/payments/[id]/refund
  refundPayment(full, retained=0, reason=admin_manual)
```

**Money split:** Full refund to student.

---

## Scenario 7 — Group Subscription, Normal Flow

```
Student → POST /api/groups/[groupId]/subscribe
  14-step validation (auth, published, capacity, no dupe, promo check)
  ↓
group_enrollments INSERT (status=PENDING_PAYMENT)
subscription_payments INSERT (status=PENDING, lunipay_checkout_session_id=...)
LuniPay checkout session created
Returns: { checkout_url, enrollment_id }
  ↓
Student pays in LuniPay UI
  ↓
LuniPay → webhook or polling confirms payment
subscription_payments.status = PAID
group_enrollments.status = ACTIVE
current_period_start = now, current_period_end = now + 1 month
next_payment_due_at = current_period_end
  ↓
Student attends sessions
  ↓
Renewal: [billing cron or manual trigger — not yet fully implemented]
  New subscription_payments row created
  LuniPay checkout issued for renewal amount
  ↓
Period end:
  If renewed → status stays ACTIVE, period advances
  If not renewed → status = GRACE for grace_period_days (default 7)
  After grace → status = SUSPENDED (auto_suspend_missed_payment=true)
              → or CANCELLED (auto_suspend=false)
```

**Money split (example: TT$200/month):**
- Platform fee (20%): TT$40
- Tutor receives: TT$160

*Note: Group subscription tutor payout mechanism (ledger integration) is not fully confirmed in code — `platform_fee_ttd` and `tutor_payout_ttd` exist on `subscription_payments` but the ledger trigger for subscriptions was not verified.*

---

## Scenario 8 — Group Subscription, Promotion Applied

```
Student subscribes while an early-bird promotion is active
  ↓
POST /api/groups/[groupId]/subscribe:
  Checks group_promotions (kind=early-bird, active=true, student_cap not exceeded)
  discounted_price = plan_price × (1 - discount/100)
  ↓
group_enrollments:
  plan_price_ttd = discounted_price
  original_price_ttd = full_price
  discount_percent = promotion.discount
  promotion_id = promotion.id
  promotion_applied_at = now
  promotion_expires_at = now + promotion.duration_days
  ↓
subscription_payments.amount_ttd = discounted_price
```

---

## Scenario 9 — Group Member Removed, No Cause (Active Subscription)

```
Tutor → DELETE /api/groups/[groupId]/members/[userId]
  Body: { with_cause: false, reason_category: 'no_cause', explanation: '...' }
  ↓
Load group_enrollments (SUBSCRIPTION, status IN [ACTIVE, GRACE, SUSPENDED])
Load subscription_payments (status=PAID, most recent)
  ↓
Pro-rata refund calculation:
  Try session-based: remaining sessions / total sessions × plan_price
  Fallback: remaining days / total days × plan_price
  ↓
group_removals INSERT (status=auto_processed, refund_amount_ttd)
subscription_refunds INSERT (status=pending)
  ↓
LuniPay refund(lunipay_transaction_id, refundAmount):
  SUCCESS → subscription_refunds.status = succeeded
             process_subscription_removal RPC
             group_members.status = removed (via RPC)
             promoteNextFromWaitlist()
             Student notified: "Removed. Refund of TT$X issued."
  FAILURE → subscription_refunds.status = failed
             subscription_payment_exceptions INSERT
             Admins notified: "Refund failed — manual action required"
             Student NOT removed yet (returns 502)
  ↓
Also checks for pending checkout (subscription_payments.status=PENDING):
  If found → Admins notified: "Void checkout [id] before it settles"
```

---

## Scenario 10 — Group Member Removed, No Cause (No Subscription / Single Session)

Covers students enrolled via `group_enrollments` with `enrollment_type=SINGLE_SESSION`, or members with no enrollment row.

```
Tutor → DELETE /api/groups/[groupId]/members/[userId]
  No SUBSCRIPTION enrollment found
  ↓
Check group_enrollments (SINGLE_SESSION, status IN [ACTIVE, PENDING_PAYMENT])
Check subscription_payments (status IN [PAID, PENDING])
  ↓
group_removals INSERT (audit record)
  ↓
IF payment found:
  Status = PAID + lunipay_transaction_id exists:
    LuniPay full refund
    subscription_refunds INSERT (succeeded or failed)
    paymentNote = "Refund of TT$X issued" / "Refund failed — team alerted"
  Status = PENDING:
    paymentNote = "Pending payment being cancelled — team alerted"
  Admins notified: "Payment action required" with link to removal record
  ↓
group_members.status = removed
group_enrollments.status = CANCELLED
Student notified: "Removed from [group]. [paymentNote]"
  ↓
Returns: { success, removal_id, refund_issued, payment_action_required }
```

---

## Scenario 11 — Group Member Removed, With Cause

No refund issued automatically. Goes to admin review.

```
Tutor → DELETE /api/groups/[groupId]/members/[userId]
  Body: { with_cause: true, reason_category: 'behavioral', explanation: '...', evidence_url: '...' }
  ↓
IF subscription enrollment:
  group_enrollments.status = SUSPENDED
  group_members.status = suspended
ELSE:
  group_members.status = removed
  ↓
group_removals INSERT (status=pending_review, with_cause=true, no refund_amount)
  ↓
Notifications sent:
  Student: "Access suspended pending admin review"
  Tutor: "Removal submitted for review"
  All admins: "With-cause removal for review" → /admin/group-removals/[id]
  ↓
Admin reviews evidence and resolves:
  Issue refund (manual): POST /api/admin/payments/[id]/refund
  Release: restore enrollment or confirm removal
```

---

## Scenario 12 — Student Self-Leave (Subscription)

```
Student → DELETE /api/groups/[groupId]/members/[userId]  (self)
  ↓
Load SUBSCRIPTION enrollment (ACTIVE or GRACE)
  cancel_at_period_end = true
  cancelled_at = now
  ↓
NO refund — access continues until current_period_end
  ↓
Student notified: "Left group. Access until [date]."
Returns: { success, access_until }
```

---

## Scenario 13 — Student Self-Leave (No Subscription)

```
Student → DELETE /api/groups/[groupId]/members/[userId]  (self)
  No SUBSCRIPTION enrollment
  ↓
group_members row deleted (hard delete)
No notification sent, no refund
Returns: { success }
```

*Known gap: no refund check or notification for self-leave without subscription.*

---

## Scenario 14 — Admin Manual Refund

Covers orphaned payments, disputed sessions, or any case requiring manual intervention.

```
Admin → POST /api/admin/payments/[paymentId]/refund
  Body: { amount_ttd?, retained_amount_ttd?, reason }
  ↓
refundService.refundPayment():
  Validate: payment.status IN [succeeded, partially_refunded]
  Validate: cumulative refund + new amount ≤ original charge
  Pre-flight: payout_ledger.status NOT IN [release_ready, released]  (else reject)
  ↓
Idempotency key: refund-[paymentId]-[priorRefundCount+1]
LuniPay refund(amount or remaining if ≈ full)
  ↓
apply_refund_side_effects RPC (atomic):
  payments.total_refunded_ttd updated
  payments.status → refunded | partially_refunded
  payout_ledger: reversed (full) | amount_ttd replaced (partial)
  tutor_balances.pending_ttd adjusted
  ↓
Payer notified: payment_refunded
Tutor notified: booking_cancelled (only if full refund + no retention)
```

---

## Scenario 15 — Payout Held for Dispute

```
Admin opens dispute on a session payout
  ↓
payout_ledger.status = admin_hold
payout_ledger.hold_reason = [one of: student_reported_tutor_no_show | refund_requested |
  chargeback | session_cancelled | tutor_cancelled | class_access_issue |
  subscription_dispute | manual_admin_hold | system_inconsistency]
payout_cases INSERT (status=open, references session/booking/payment)
  ↓
Admin reviews case
  ↓
Resolve: resolved_release_to_tutor
  payout_ledger.status = release_ready
  Tutor paid in next batch

Resolve: resolved_refund_student
  refundPayment(full)
  payout_ledger.status = reversed

Resolve: resolved_partial_refund
  refundPayment(partial)
  payout_ledger.amount_ttd = retained_payout
  payout_ledger.status = owed

Resolve: dismissed
  payout_ledger.status = owed  (no action)
```

---

## Scenario 16 — Chargeback / Out-of-Band Refund

Stripe/LuniPay issues a refund or chargeback outside the platform.

```
LuniPay → webhook (charge.refunded):
  IF payment not already refunded/partially_refunded:
    payments.cancel_reason = refunded_out_of_band
    Flagged for admin reconciliation
  ↓
LuniPay → webhook (charge.dispute.created | updated | closed):
  payments.cancel_reason = dispute_[phase]
  Admin alerted for manual review
```

*These events are logged but no automatic ledger reversal occurs — admin must reconcile manually.*

---

## Scenario 17 — No-Show Claim (Student-Raised)

```
Student reports tutor no-show → noshow_claims INSERT
  ↓
Tutor has 12-hour window to submit evidence
  ↓
IF tutor responds with evidence:
  Admin reviews
  ↓
  Admin finds for student:
    refundPayment(full, reason=tutor_noshow)
    tutor_strikes INSERT
    
  Admin finds for tutor:
    No refund, claim dismissed

IF tutor does NOT respond within 12h:
  Auto-refund triggers:
    refundPayment(full, reason=tutor_noshow)
    payout_ledger.status = reversed
    tutor_strikes INSERT
```

---

## Scenario 18 — Checkout Expires Before Payment

```
Student initiates checkout but never completes payment
  ↓
LuniPay → webhook (checkout.session.expired):
  payments.status = cancelled
  payments.cancel_reason = session_expired
  booking.payment_status = unpaid
  ↓
Student notified: payment_failed
No ledger entry created (no charge occurred)
```

For group subscriptions:
```
subscription_payments.status = EXPIRED
group_enrollments.status = ACTIVATION_FAILED  (or PENDING_PAYMENT if retry allowed)
```

---

## Payout Pipeline Summary

```
Session charged
    ↓
tutor_earnings (EARNED)  +  payout_ledger (owed)  +  tutor_balances.pending_ttd++
    ↓ [7 days pass, no hold/refund]
payout_ledger (release_ready)
    ↓ [admin runs payout batch]
payout_ledger (released)  +  tutor_balances updated
    ↓
CSV generated → bank transfer to tutor
```

### What blocks a payout

| Condition | Effect |
|-----------|--------|
| Refund issued within 7 days | payout_ledger reversed before release |
| Admin dispute opened | payout_ledger → admin_hold |
| Partial refund | payout_ledger.amount_ttd reduced |
| Payout already release_ready or released | Refund blocked (must go through admin) |

---

## Known Gaps & Stubs

| Gap | Impact |
|-----|--------|
| WiPay is a stub (all methods return mocks) | No real WiPay charges or webhooks work |
| Group subscription renewal cron not confirmed in code | Monthly subscriptions may not auto-renew |
| Group subscription payout ledger integration not verified | Tutor earnings from group subscriptions may not flow through payout_ledger |
| Student self-leave (no subscription) has no refund check or notification | Students can leave paid single-session classes silently |
| Pending checkout on group membership removal requires manual admin void | No auto-expiry of LuniPay checkout session |
| Promotion discount logic does not apply at enrollment | group_promotions table exists but enrollment endpoint ignores it |
| Chargeback events are logged only — no automatic ledger reversal | Admin must manually reconcile all chargebacks |
| Out-of-band refunds (charge.refunded webhook) are flagged only | Admin must reconcile if Stripe/LuniPay issues a refund directly |
