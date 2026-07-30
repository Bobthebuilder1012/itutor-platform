# Stripe Direct-Pay Integration — Setup & Status

Phase 1: **one-on-one session payments only**. Subscriptions, Stripe Connect,
and parent-side payments are out of scope and untouched.

LuniPay remains the default provider (`payments.provider` default is still
`'lunipay'`). Stripe runs alongside it until cutover is signed off.

---

## 1. Environment variables

Add to `.env.local` (never commit) and to the Vercel project env for each
deployed environment:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

`STRIPE_WEBHOOK_SECRET` is **per endpoint**. The value printed by
`stripe listen` locally is NOT the value issued for a deployed endpoint —
each environment gets its own.

## 2. Migration

**Status: APPLIED to staging (`thjsdcbzlvjradczhgso`) on 2026-07-30. Not applied to production.**

Run via `npx ts-node scripts/apply-migration-197.ts` (add `--dry-run` to probe
without writing). That script refuses to run against the production ref and
verifies the resulting objects. Migrations 191–196 were confirmed already
applied to staging beforehand.

> Do **not** use `supabase db push`. All 182 migrations here use `NNN_name.sql`
> naming, not the CLI's timestamp format, and `supabase_migrations.schema_migrations`
> does not track them — `db push` would try to replay the entire history from
> `000_drop_all_tables.sql` against a live database.

Note staging is a **branch** of the production project, so it does not appear
in `supabase projects list`; it is under
`GET /v1/projects/{prod_ref}/branches`.

It is purely additive:

- `payments.stripe_payment_intent_id` / `stripe_charge_id` /
  `stripe_balance_txn_id` / `stripe_fee_ttd` / `stripe_net_ttd` /
  `stripe_settlement_currency`
- `stripe_webhook_events` de-dup table
- Does **not** change the `provider` default

## 3. Local testing

The CLI is installed via winget (`Stripe.StripeCli`). Note the exact id —
`Stripe.StripeCLI` does not resolve. It installs to:

```
%LOCALAPPDATA%\Microsoft\WinGet\Packages\Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe\stripe.exe
```

winget adds it to PATH, but an already-open shell needs restarting to see it.

```bash
stripe listen --api-key sk_test_... --forward-to localhost:3000/api/payments/stripe/webhook
```

Passing `--api-key` avoids `stripe login` entirely — no browser pairing
needed, which matters for non-interactive shells.

Copy the printed `whsec_...` into `.env.local`, then either:

```bash
stripe trigger payment_intent.succeeded
```

…or run the real flow with these cards (any future expiry, any CVC, any
postal code). Both verified in TTD against this account:

| Scenario | Card | Result |
|---|---|---|
| Sufficient funds | `4242 4242 4242 4242` | succeeds |
| Insufficient funds | `4000 0000 0000 9995` | `card_declined` / `insufficient_funds` |

> Note the route is `/api/payments/stripe/webhook`, matching the existing
> `/api/payments/lunipay/webhook` convention — not `/api/webhooks/stripe`.

`PAID_CLASSES_ENABLED` must be `true` or `/initiate` returns 403 (same
guard as the LuniPay route).

## 4. Deployed endpoint registration

Stripe Dashboard → Developers → Webhooks → Add endpoint →
`https://<domain>/api/payments/stripe/webhook`

Select exactly these four events:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`
- `charge.dispute.created`

Copy that endpoint's signing secret into the environment's
`STRIPE_WEBHOOK_SECRET`.

---

## How this differs from the original brief

The brief assumed a greenfield schema. The live schema differs materially,
so the implementation was adapted:

| Brief | Built instead | Why |
|---|---|---|
| `app/api/bookings/route.ts` creates booking + intent together | `app/api/payments/stripe/initiate` takes an existing `bookingId` | No such route exists; booking creation is `bookings/create` + `bookings/direct-book`. Also removes the dangling-booking problem entirely — booking and payment lifecycles are already decoupled. |
| booking status `pending_payment` → `confirmed` | `bookings.payment_status` `pending` → `paid` | `bookings.status` is a CHECK-constrained uppercase enum with no such values. Payment state lives on a separate column. |
| Webhook inserts `payout_ledger` with `gross_amount` / `stripe_fee` / `net_amount` | Webhook writes none of these | `payout_ledger` has no such columns, and `session_id` is `NOT NULL UNIQUE` — no session row exists at payment time. Ledger rows are created by `fn_create_earning_on_charge` (mig 163) when `sessions.charged_at` is set. Writing them here would double-write. |
| New `disputes` table, status `needs_response` | `payout_cases` row, `hold_reason='chargeback'`, status `open` | `payout_cases` (mig 168) is the existing dispute system and already has an admin queue. |
| `stripe_payment_intent_id` column on `bookings` | On `payments` | `payments` already models provider handles (`provider`, `provider_reference`). |
| `lib/payments/calculateSessionPrice.ts` | Not created | Price is already computed server-side in Postgres from `tutor_subjects.price_per_hour_ttd` and stored on `bookings.price_ttd`. The route reads that. A third implementation would be a drift risk. |
| `idempotencyKey: booking-${booking.id}` | `pi-${payment.id}` | A booking-keyed key replays a stale intent when a student retries after a genuine failure, or throws on changed params. Each retry legitimately gets its own `payments` row. |

### Webhook error handling

Per the retry-vs-reconcile decision: **transient failures return 500 and are
retried by Stripe.**

Implemented as *don't record the event as processed* rather than
*insert-then-delete-on-failure* — there is no window where a crash leaves a
stale idempotency row that would suppress a legitimate retry. A row is only
treated as a duplicate once `processing_status = 'processed'`; `'failed'`
rows stay retryable.

Poison-pill guard: `stripe_webhook_events.attempts`. After 5 deliveries of
the same event the handler marks it `'abandoned'` and returns 200, so a
permanently-failing event can't retry for three days.

**Retryable vs permanent lookup failures.** A DB error is classified by
`isRetryablePgError()`. Schema-shaped errors (`42P01` undefined_table,
`42703` undefined_column, `PGRST*` schema-cache miss) and connection errors
are **retryable** → 500. Anything else (RLS, malformed id) is permanent →
200 + logged.

This matters more than it looks: an unapplied migration makes every lookup
fail, and ACKing those with a 200 would silently discard real payments with
no retry. Verified live — with migration 197 unapplied, `stripe trigger
payment_intent.succeeded` returns `[500]` on every event; it returned
`[200]` before the fix.

If the de-dup table itself is unreadable the handler refuses to process at
all and returns 500, rather than proceeding with no idempotency protection
and risking a double-credit.

---

## Money flow (confirmed)

```
Student pays TTD  ──►  Stripe converts  ──►  iTutor collects USD
   (rate + processing fee)                    (US entity, settles usd)
                                                     │
                                                     ▼
                                        iTutor converts USD ──► pays tutor TTD
                                                                 (manual / CSV)
```

Verified against the live test account (`GET /v1/account`):

| | |
|---|---|
| Account country | `US` |
| Settlement currency | `usd` |
| TTD presentment | **Supported** — a TT$100.00 PaymentIntent was created and cancelled successfully |
| `charges_enabled` | `false` — onboarding incomplete |
| `payouts_enabled` | `false` — onboarding incomplete |

**Fee incidence:** the student pays the processing fee on top of the tutor's
rate (gross-up). The platform commission comes off the tutor. The tutor's
TT$ payout figure is **fixed** — the platform absorbs FX movement between
collecting USD and paying out TTD.

**There are two FX legs.** Stripe converts TTD→USD on the way in (its spread,
captured via the balance transaction's `exchange_rate`). iTutor then converts
USD→TTD to pay tutors — that second spread is **not modelled anywhere** and
Stripe has no visibility into it. It lands on the platform by design, per the
fixed-TTD-payout decision.

## ⚠️ Open items before go-live

1. **The account is not activated.** `charges_enabled` and `payouts_enabled`
   are both `false`. Test mode works; live payments will fail until Stripe
   onboarding is completed.

2. **The gross-up rate is measured, but not against a T&T card.**
   `lib/payments/grossUp.ts` uses `5.4% + US$0.30`. A live probe on
   2026-07-30 (TT$108.44 → US$16.07) returned exactly `2.9% + $0.30`
   processing plus `1.0%` conversion, confirming two of the three
   components. The third (1.5% international) didn't apply because the test
   card was US-issued. Expect a real T&T card to land near TT$7.90 against
   TT$8.44 charged — slightly over-collecting, which is the safe direction.

   This is now **self-monitoring** rather than silent: `/initiate` records
   `charged_processing_fee_ttd`, and the webhook records Stripe's real
   `stripe_fee_ttd` and the resulting `fee_variance_ttd`. A negative variance
   logs an `UNDER-COLLECTED` warning naming this file. After a handful of
   real transactions, tune the constants against:

   ```sql
   SELECT count(*),
          avg(fee_variance_ttd)  AS avg_variance,
          sum(fee_variance_ttd)  AS total_variance
   FROM payments
   WHERE provider = 'stripe' AND fee_variance_ttd IS NOT NULL;
   ```

   Positive total = over-collecting from students. Negative = the platform is
   eating the difference.

3. **No card has been charged yet.** Verified on staging against real Stripe
   events: signature verification, event dispatch, idempotency insert, dedup
   short-circuit on redelivery, and retryable-vs-permanent error handling.

   Still unexecuted: the `4242` flow through the booking UI, which is the only
   path that exercises `complete_booking_payment`, the booking status flip,
   and the fee-variance reconciliation — the CLI fixtures don't match a local
   `payments` row so those branches never run. Note `PAID_CLASSES_ENABLED` is
   currently `false`, which makes `/initiate` return 403.

4. **Refund/dispute emails.** The webhook writes in-app `notifications` rows
   (matching the LuniPay handler) but does not send email. Wire into the
   existing email notification matrix when that work lands.

5. **API version skew.** The code pins `2026-07-29.dahlia` (what the
   installed SDK's types require); the account default is
   `2026-04-22.dahlia`, so CLI-forwarded webhook payloads render at the
   older version. Only stable top-level fields are read, but worth knowing.
