# iTutor credits: Stripe test-mode checklist

This is how to prove the credits programme in Stripe **test mode** before
launch. It covers referral rewards, campaign codes, and spending credits on
group classes. Work through it on staging with test cards.

**Rule since Oct 2026: credits pay a payment in full or not at all.** They
pay for one whole month (B) or one whole renewal (A). There is no
part-credit, part-card payment, and credits never start a new subscription.

The database rules (lots, replays, clawbacks, lockout) are already tested by
`supabase/_verify_credits.sql` and `supabase/_verify_credit_codes.sql`; the
quote arithmetic by `npm run credits:verify`. This list covers what only a
real Stripe round trip can show.

## 0. Before you start

1. **Use test accounts only.** Staging is a branch of production and holds
   real customer emails, so create every student and parent below with an
   `@myitutor.com` address.
2. Apply migrations **268** then **269** on the staging branch database.
   Then run both verify scripts in the SQL editor. Each must end with
   `ALL … CHECKS PASSED (rolled back)`.
3. Confirm the staging Stripe keys are **test** keys.
4. Confirm the webhook endpoint subscribes to these events:
   - `invoice.paid`
   - `payment_intent.succeeded`
   - `charge.refunded`
   - `customer.subscription.deleted`
5. On `/admin/referrals`:
   - Switch the referral programme on.
   - Set friends per reward to **1**, so a single friend triggers a reward.
   - Set hold days to **0**.
   - Set the minimum qualifying payment to **TT$80**.
6. On `/admin/credit-codes`, switch campaign codes on.
7. Pick a paid group class priced at TT$250 a month or more. Note its tutor's
   commission rate.

**The invariant for every payment below.** The tutor is paid as if the
student paid the full price:

```sql
select sp.id, sp.type, sp.amount_ttd, sp.credits_applied_ttd, sp.charged_processing_fee_ttd,
       sp.platform_fee_ttd, sp.tutor_payout_ttd, pl.amount_ttd as ledger_payout
  from subscription_payments sp
  left join payout_ledger pl on pl.subscription_payment_id = sp.id
 where sp.enrollment_id = '<enrollment>'
 order by sp.created_at;
```

For each row, check:
- `amount_ttd` is the full monthly price.
- `tutor_payout_ttd` and `ledger_payout` equal what
  `calculateCommissionForTutor` gives on that full price.
- `credits_applied_ttd` is the part credits paid.

**Wallet check after every case.** The wallet must equal its ledger:

```sql
select w.*,
  (select coalesce(sum(remaining_ttd),0) from credit_ledger where user_id = w.user_id and kind='grant' and state='available' and (expires_at is null or expires_at > now())) as lots_available,
  (select coalesce(sum(-amount_ttd),0) from credit_ledger where user_id = w.user_id and kind='spend' and state='reserved') as lots_reserved
from credit_wallets w where user_id = '<user>';
```

Give a test student credits with **Adjust a balance** on `/admin/referrals`.
Use a positive amount and a reason.

## 1. Credits never start a subscription

| # | Steps | Expected |
|---|---|---|
| C1 | A student with credits ≥ the price opens a class. | The join flow offers "Subscribe and pay by card" or "Pay for one month with credits". There is no option to put credits toward a subscription's first month. |
| C2 | Start a subscription checkout, go back and start it again. | The first incomplete Stripe subscription is **cancelled**, so a stale tab cannot pay it. |

## 2. Scenario B: one month with credits

| # | Steps | Expected |
|---|---|---|
| B1 | Student with credits ≥ the price chooses "Pay for one month with credits". | No Stripe call. The enrolment is `ACTIVE` and billed `credits`. The `credit_month` row has `payment_method` = `credits`, cash 0 and fee 0. The payout invariant holds. The student is on the roster. |
| B2 | Student with TT$100 credits opens a TT$250 class. | No "pay with credits" option. The page says TT$150 more is needed. Calling the API directly answers 422 with `shortfall_ttd` 150. |
| B4 | After B1, advance the clock past the month. Run `/api/cron/process-subscriptions`. | Task 7 moves the enrolment to `COMPLETED` and removes the member. The student gets a "Your month is over" notification. No reminder, grace or suspension email is sent at any point. |
| B5 | During B1's month, the student subscribes from the class page. | The same enrolment row is converted. The first paid period starts when the credit month ends. Billing switches to `stripe` only after the invoice is paid. |
| B6 | A full class. | One month is refused ("This class is full"). No waitlist row. |

## 3. Scenario A: "apply credits to my next payment"

| # | Steps | Expected |
|---|---|---|
| A1 | Active Stripe subscription; student has credits ≥ one month. Subscriptions page → Apply. | The message shows the renewal date and "nothing will be charged". The Stripe subscription has the existing promotion discount plus a `once` credit coupon. The spend is `reserved` and the date shows on the Rewards page. |
| A2 | Advance to the renewal. | **Confirm Stripe sends `invoice.paid` for a TT$0 invoice.** The renewal row has `amount_ttd` = the full price, `credits_applied_ttd` = the credits, and `payment_method` = `credits`. The spend is `settled` and the payout invariant holds. |
| A3 | As A1, with credits below the renewal price. | Refused with how much more is needed. Nothing is attached to the subscription. |
| A4 | Apply, then Remove before the renewal. | The coupon is gone from the subscription and the credits are back. Applying again creates a **new** reservation; the old key is never revived. |
| A5 | Apply within 2 h of the renewal, or while a draft invoice exists. | Refused: "Your renewal is being prepared". |
| A6 | Apply, then pause the subscription (parent pause or tutor break). | The credits are removed and released before the pause takes effect. |
| A7 | Apply, then cancel the subscription in Stripe. | `customer.subscription.deleted` releases the reservation. |
| A8 | **Timing check.** Apply credits mid-period. | The coupon lands on the **next** renewal invoice, not a later one. Write down what happens; the page copy depends on it. |

## 4. Refunds

| # | Steps | Expected |
|---|---|---|
| R1 | Refund (in the Stripe dashboard) an A2 renewal's charge in full, or any card payment that converted a referral. | `charge.refunded` finds the subscription payment and the credits spent on it are **restored** to their original lots. The payment's own status and the tutor's payout are **not** changed by this. That is a pre-existing gap; reconcile with the admin reverse route. |
| R2 | Admin reverse route on a payment that used credits. | The credits are restored, and the reversal is audited. |
| R3 | Partial refund of a credit-using payment. | Nothing is restored automatically. A `credit_mismatch` exception appears on the `/admin/referrals` review list. |

## 5. Referrals

| # | Steps | Expected |
|---|---|---|
| F1 | Student S opens Rewards and copies the link. Friend F opens it in a fresh browser, signs up (email), and subscribes to a class paying ≥ TT$80 by card. | The `referrals` row goes `signed_up` → `converted`. With 1 friend per reward, S is granted TT$250 and gets two notifications. The `paid` product event fires once. |
| F2 | Same, but F signs up with Google. | Same result: the referral is attached in `bootstrapProfileIfMissing`. |
| F3 | F's first payment is TT$50, then a later payment is ≥ TT$80. | The first leaves the referral open. The later one converts it. |
| F4 | F pays with the **same card** S has saved. | Rejected `shared_card`, shown on the admin rejected list. |
| F5 | Two children of one parent; child 1 refers child 2; the parent pays both on one card. | Converts with `is_sibling_referral` = true (the card check is skipped). |
| F6 | Parent P refers their own child. | Rejected `parent_child`. |
| F7 | F pays for a 1:1 lesson only. | Never converts. |
| F8 | F's payment was funded entirely by credits. | Never converts. |
| F9 | Refund F's qualifying payment after S was rewarded and before S spends it. | The reward is clawed back in full. S's history shows "Reward taken back". |
| F10 | Same, after S spent the reward. | Only the unspent part is clawed back. The balance never goes negative, and the shortfall appears on the review list. |
| F11 | Set hold days to 7 and repeat F1. | The reward is `pending` (shown as pending on Rewards and not spendable). After the nightly job, once 7 days have passed, it becomes available. Refunding during the hold voids it. |
| F12 | Webhook replay: in Stripe, resend F1's `invoice.paid`. First set its `stripe_webhook_events` row to `failed`, or the resend is a no-op. | No second conversion, no second grant, and `paid` still fires once. |

## 6. Campaign codes

| # | Steps | Expected |
|---|---|---|
| K1 | Create a batch of 5 codes worth TT$50 and print the sheet. Scan one QR with a phone while signed out. | It lands on `/redeem/<code>`, then sign in, then back on the confirm page. **Opening the page alone redeems nothing.** Press Redeem: TT$50 lands in the wallet and the history reads "Campaign: <name>". |
| K2 | A second account tries the same code. | "This code has already been used." |
| K3 | Two browsers press Redeem on the same unused single-use code at the same moment. | Exactly one succeeds. *(This is the concurrency case the SQL test cannot cover.)* |
| K4 | A named promo with a cap of 2 and three accounts. | Two succeed and the third gets "reached its limit". Each account can redeem it only once. |
| K5 | Pause, then resume; set an end date in the past. | "paused", then works again, then "has ended". |
| K6 | Six wrong codes in a row. | The fourth is refused with the lockout message (limit 3, or whatever you set) for 15 minutes. |
| K7 | Spend campaign credits in B and A. | Identical to referral credits. With both kinds in the wallet, the soonest-expiring lot is used first; check the spend row's `allocations`. |
| K8 | A tracked link code on the print sheet. | Scans count on `/admin/link-tracking` and still land on the redeem page. |

## 7. Switches off

With both programmes switched off:
- New links stop earning.
- `/redeem` says codes are not being accepted.
- Existing balances stay **visible and spendable**.
- The Rewards nav item still shows for anyone with a balance.

## 8. Facts still to confirm in Stripe

- [ ] A `once` coupon added mid-period applies to the **next** renewal (A8).
- [ ] A TT$0 invoice still fires `invoice.paid` (A2).
- [ ] `total_discount_amounts[].discount.source.coupon` is populated on the
  pinned API version. The renewal path depends on it to prove a credit
  coupon reached the invoice.
- [ ] `invoicePayments.list({ invoice, expand: ['data.payment.payment_intent'] })`
  returns the charge for renewals. Refunds and the referral card check use
  it.
