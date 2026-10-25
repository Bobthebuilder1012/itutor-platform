# Teacher verification v2: Stripe test-mode test plan

Run on **staging / a Vercel Preview only**, never production. Everything below uses Stripe **test mode**.

## Setup (once)

1. Apply to the **staging** database, in order: `supabase/migrations/270_teacher_verification_v2.sql`, then `271_verification_security_hardening.sql`. Before 271, run the constraint check in its header ("verify live constraint").
2. In the Preview environment set `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_IDENTITY_WEBHOOK_SECRET=whsec_…` (the secret of the NEW identity endpoint below, not the payment one), `NEXT_PUBLIC_APP_URL=<the preview URL>`, `VERIFICATION_V2_ENABLED=true` and `VERIFICATION_PROCESS_SECRET=<random string>` (optional; only for server-to-server calls to the OCR endpoint).
3. Stripe Dashboard (**test mode**) → Identity → enable Identity for the account.
4. Stripe Dashboard (test mode) → Developers → Webhooks → **add a new endpoint** `<preview URL>/api/webhooks/stripe-identity` with ONLY the events `identity.verification_session.verified` and `identity.verification_session.requires_input`. Its signing secret is `STRIPE_IDENTITY_WEBHOOK_SECRET`. Do NOT add these events to the payment endpoint (`/api/payments/stripe/webhook`); that file no longer handles them.
   (Local alternative: `stripe listen --events identity.verification_session.verified,identity.verification_session.requires_input --forward-to localhost:3000/api/webhooks/stripe-identity`, and use the `whsec_` it prints.)
5. Use a staging tutor account that has never used v2. Open `/tutor/verification-v2`.

Stripe test documents: in test mode Stripe's hosted page offers test-mode document options; choose the
"success" one for pass and a failing one for fail. Use the "Cancel" / close controls for cancel, and decline the
consent screen for consent declined.

## Cases

| # | Case | Steps | Expected |
|---|---|---|---|
| 1 | Flag off | Set `VERIFICATION_V2_ENABLED` unset/false, load `/tutor/verification-v2` and `GET /api/tutor/verification-v2/state` | 404 on both. Old `/tutor/verification` unchanged. |
| 2 | Consent required | At step 1 leave the box unticked | Button disabled. `POST /api/tutor/verification-v2/consent` with `{}` returns 400. DB `consent_at` stays null. |
| 3 | Skipping steps blocked | With no consent: `POST …/identity` → 409 `consent_required`. With consent but identity not verified: `POST …/credentials`, `…/credentials/upload-url`, `…/extras`, `…/submit` → 409 `identity_required`. With identity verified but 0 credentials: `…/extras` and `…/submit` → 409 `credentials_required`. Also click step 3 tab at step 1: not clickable. | Each blocked as stated. |
| 4 | Identity pass | Step 2 → Start → complete with the test "success" document + selfie | Returns to the page. Shows "identity verified" (page refresh pulls it from Stripe even if the webhook is slow). `identity_status='verified'`, `identity_verified_at` set. A `stripe_webhook_events` row for `…verified` exists with `processing_status='processed'`. |
| 5 | Identity fail | New tutor (or reset row), Start → complete with the failing test document | Page shows a friendly reason and **Try again**; "2 attempts left". `identity_status='requires_input'`, `identity_error_code` set. |
| 6 | Retry cap | Fail three times in a row | After the 3rd failure: "You have used all identity check attempts" with the manual-verification message and no start button. `POST …/identity` returns 429 `attempt_limit`. `identity_attempts=3`. |
| 7 | Cancel | Start, then close the Stripe window without finishing, return to the page | "You have not finished the check yet", button **Continue identity check** reuses the same session (attempts does not increase). Cancel from Stripe's cancel control shows "That check was cancelled" and allows Try again. |
| 8 | Consent declined | Start, decline consent on Stripe's page | Page shows "contact us for manual verification" with the support address, no retry button. `identity_status='consent_declined'`. `POST …/identity` returns 409 `manual_verification`. |
| 9 | Under age | Use Stripe's under-age test path if available, otherwise simulate by sending a signed `…requires_input` test event with `last_error.code=under_supported_age` | Same manual message. `identity_status='under_supported_age'`. |
| 10 | 4th extra rejected | Verified identity + 1 credential. Add 3 extras. Try a 4th in the UI (form is replaced by "maximum"). Then call `POST …/extras` directly a 4th time. Then, in the SQL editor on staging, try `insert into tutor_extras_v2 (tutor_id,title,description) values ('<id>','x','y')` | UI blocks. API returns 409 `extras_limit`. SQL insert fails with `extras_limit_reached`. Concurrency: fire 5 parallel `POST …/extras` from 0 extras: exactly 3 succeed. |
| 11 | Proof upload | Add a CSEC credential with a 2MB PDF; then try an 11MB file, a `.docx` and a `.exe` renamed `.pdf` | 2MB succeeds. 11MB and `.docx` are rejected client-side. Forcing them via the API returns 400 (`upload-url` validates type and size). Stored path is `<tutor_id>/<uuid>.pdf`, never the original filename. In the dashboard the bucket `tutor-credential-proofs` is private. |
| 12 | Credential validation | Degree without a file; CSEC with neither link nor file; link `javascript:alert(1)`; year 1900 | Each rejected with a clear message. |
| 13 | Refresh and resume | Stop at each of steps 2, 3 and 4 (reload the page, then close the browser and reopen) | Lands on the furthest valid step with saved data, progress bar correct. Leaving mid-Stripe and returning lands on step 2 with the right state. |
| 14 | Submit | Complete all steps → Submit for review | Status page "Submitted, in review". `status='IN_REVIEW'`, `submitted_at` set. No email or in-app notification sent. `profiles.tutor_verification_status` unchanged. Double-click Submit: only one transition. |
| 15 | Locked after submit | While IN_REVIEW call `POST …/credentials`, `DELETE …/credentials`, `POST …/extras`, `POST …/consent` | All 409 `locked`. |
| 16 | Rejected / revoked / verified views | In the SQL editor set `status='REJECTED', decision_reason='Test reason'`; then `'VERIFIED'`; then `'REVOKED'` | Each shows its status page; rejected shows the reason and **Update and resubmit** (then editable and re-submittable); revoked shows the contact message and is not editable. |
| 17 | Teacher cannot write status | Signed in as the tutor, in the browser console with the Supabase client: `update tutor_verification_v2 set status='VERIFIED'`, `update … set decision_reason=…`, and `update profiles set tutor_verification_status='VERIFIED'` | 0 rows affected / RLS denial; the profile update raises `42501`. |
| 18 | RLS visibility | As a student and as a parent, `select * from tutor_credentials_v2` / `tutor_extras_v2` for a tutor in IN_REVIEW, then after setting that tutor `VERIFIED` | Nothing while IN_REVIEW. Rows visible once VERIFIED. As a different tutor: never visible. As admin/reviewer: always visible. Students cannot read objects in the proofs bucket. |
| 19 | Webhook safety | Replay the same `…verified` event from the Dashboard; send an event for an old (replaced) session id; send a request with a wrong signature; send a test `payment_intent.succeeded` to the identity endpoint | Replay returns `duplicate`. Old-session event is `skipped` and does not change the row. Wrong signature returns 400. The payment event is ignored. `identity_webhook_events` holds only event id, type, session id and our result (no payload, no client secret, no URL). A normal test checkout still works on the payment endpoint. |
| 20 | Rollback | On a throwaway staging copy only: empty the bucket, run `supabase/rollbacks/270_teacher_verification_v2_rollback.sql` | Tables, functions, policies and bucket gone; profile CHECK is back to five values. |
