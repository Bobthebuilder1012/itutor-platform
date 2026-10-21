# Teacher verification v2: local testing

Everything here runs on **your machine**, against **your own empty Supabase project** (or a local one), with **Stripe test mode**. Nothing in this guide touches staging, production or live keys, and the scripts refuse to.

---

## START HERE

### 0. What you need once

| Thing | Why | How |
|---|---|---|
| Node 20+ and `npm ci` done | the app | `npm ci` |
| An **empty** Supabase project of your own | the app needs Auth, Postgres and Storage. Docker was not available where this was built, so a local Supabase stack was not run. | dashboard.supabase.com > New project. Do **not** reuse the production or staging project. |
| Stripe account, **test mode** | the identity check | dashboard.stripe.com, toggle "Test mode". Turn **Identity** on (Settings > Identity). |
| Stripe CLI | forwards Stripe webhooks to localhost | `winget install Stripe.StripeCLI`, then **open a new terminal** and run `stripe login`. (Or scoop: `scoop install stripe`.) |

### 1. Create `.env.local` (names only; fill the values yourself)

```
# --- your OWN empty Supabase project ---
NEXT_PUBLIC_SUPABASE_URL=            # https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=                        # Settings > Database > Connection string (direct or session pooler)
SEED_ALLOWED_PROJECT_REF=            # the <ref> of YOUR project. The scripts refuse any other remote.

# --- the app ---
NEXT_PUBLIC_APP_URL=http://localhost:3000
VERIFICATION_V2_ENABLED=true         # the feature flag (default off)
VERIFICATION_DEV_TOOLS=true          # enables /dev/verification-states (never in a production build)
CRON_SECRET=any-long-random-string   # protects /api/cron/verification-cleanup

# --- Stripe, TEST MODE ONLY ---
STRIPE_SECRET_KEY=                   # must start with sk_test_
STRIPE_IDENTITY_WEBHOOK_SECRET=      # whsec_... printed by `stripe listen` (step 5)

# --- optional backup providers: sandbox / test credentials only ---
DIDIT_API_KEY=
DIDIT_WORKFLOW_ID=
DIDIT_WEBHOOK_SECRET=
DIDIT_EXPECT_ENVIRONMENT=sandbox
# DIDIT_SANDBOX_SCENARIO=            # only if Didit's sandbox docs name a value you want
VERIFF_API_KEY=
VERIFF_SHARED_SECRET=
# VERIFF_BASE_URL=                   # only if your Customer Portal shows a different API host

# --- no real email: a FAKE key (some existing routes build a Resend client at start-up and
#     the app will not build or start without one) plus an allow-list nobody is on ---
RESEND_API_KEY=re_placeholder_not_a_real_key
EMAIL_ALLOWLIST=nobody@example.test   # anything not on this list is suppressed by the app's mail sender
```

A provider with missing credentials is **skipped automatically**: with only Stripe set, the chain is just Stripe.
Stripe keys: the app and the seed script refuse an `sk_live_` key.

### 2. Commands, in order

```bash
npm ci
node scripts/apply-migrations-local.mjs --confirm-ref <your-ref>      # every migration, from empty; stops at the first failure
node scripts/seed-verification-test-users.mjs --confirm-ref <your-ref>  # test accounts in every verification state
npm run dev                                                            # http://localhost:3000
```

In a **second terminal** (step 5 explains it):

```bash
stripe listen --events identity.verification_session.verified,identity.verification_session.requires_input --forward-to localhost:3000/api/webhooks/stripe-identity
```

If a migration fails on the empty database, the script prints the file and the Postgres error and stops. Fix the file and run the same command again: it resumes after the last file that worked. (This is the one thing that could not be run in the environment this was built in. See "What was not verified".)

### 3. Test logins

All use the password **`Test-Passw0rd!`**.

| Email | Role / verification state |
|---|---|
| `vtest.admin@example.test` | admin |
| `vtest.reviewer@example.test` | reviewer (non-admin) |
| `vtest.student@example.test` | student |
| `vtest.parent@example.test` | parent |
| `vtest.tutor.notstarted@example.test` | tutor, never started |
| `vtest.tutor.inprogress@example.test` | tutor, consent given only |
| `vtest.tutor.idfailed@example.test` | tutor, identity check failed (document expired), retry offered |
| `vtest.tutor.idunsupported@example.test` | tutor, identity "not supported" (country) |
| `vtest.tutor.inreview@example.test` | tutor, submitted, **in review** (profile pending) |
| `vtest.tutor.verified@example.test` | tutor, **verified** (3 extras, listing and class) |
| `vtest.tutor.verified2@example.test` | tutor, **verified** (no extras) |
| `vtest.tutor.rejected@example.test` | tutor, rejected with a reason |
| `vtest.tutor.revoked@example.test` | tutor, **revoked** |
| `vtest.tutor.reverify@example.test` | tutor, **reverification required** |
| `vtest.tutor.oldverified@example.test` | tutor verified in the OLD flow only (no v2 record) |

Find a teacher's id for profile URLs: `select id, email from profiles where email like 'vtest.%';` in the Supabase SQL editor.

### 4. The 10 things to click through

1. **Gallery.** Open `/dev/verification-states`. Scroll every section; change the **Provider** selector and the **Fallback chain explorer** (pick `not_supported` and watch it fall to the next provider; set attempts to 3 and see "contact support").
2. **Teacher flow, real Stripe test mode.** Log in as `tutor.notstarted`, open `/tutor/verification-v2`. Accept the notice, choose **Trinidad and Tobago**, press **Start identity check**. On Stripe's page choose the test document option it offers, finish, and you return to the status page. It should show *identity verified* within a few seconds (the page asks Stripe itself, so it works even before the webhook arrives).
3. **Credentials.** Add a CSEC credential with a link, and a degree with a PDF/JPG/PNG up to 10MB. Try an 11MB file and a `.docx`: both must be refused.
4. **Extras and the limit.** Add 3 extras. The form should be replaced by "You have added the maximum". Remove one, add another.
5. **Submit and resume.** Press **Submit for review**: the page shows *Submitted, in review* and the fields are locked. Reload; sign out and in; it is still there.
6. **Admin approve.** Log in as admin, open **Verification v2** in the sidebar (`/admin/verification-v2`), open the application, check the credentials, the evidence criteria and the identity section (it must say there is nothing to view because iTutor stores no ID), press **Approve**. Check **Decision history**.
7. **Reject and resubmit.** Reject another application with a reason. As that teacher, see the reason, edit, resubmit.
8. **Revoke and the wall.** As admin, open `tutor.verified` and **Revoke** with a reason (a reviewer must not see the button). As that teacher, `/tutor/verification-v2` shows *revoked* and nothing can be submitted (the API answers 403).
9. **Reverification.** On the admin queue, scroll to **Ask teachers to verify again**, press **Preview** (counts only), then **Apply**. Log in as `tutor.reverify` and see **Please verify again** (not a rejection).
10. **Badges, signed out.** Open `/classes`, `/find/browse` and `/tutors/<verified teacher id>`. Verified teachers show three separate labels (*ID checked*, *Credentials reviewed*, *Teacher-provided extras (not verified by iTutor)*); click one for the panel. The revoked, rejected, in-review and reverification teachers show **none**.

Bonus: delete an account (Settings > Delete account) for a seeded teacher: it must succeed even if you disconnect the network first, and `curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/verification-cleanup"` shows what the retention sweep would delete (a dry run; add `?apply=1` to run it).

---

## 5. Stripe test mode, end to end

1. `.env.local` has `STRIPE_SECRET_KEY=sk_test_...` and the flag `VERIFICATION_V2_ENABLED=true`.
2. Run `stripe listen --events identity.verification_session.verified,identity.verification_session.requires_input --forward-to localhost:3000/api/webhooks/stripe-identity`.
3. It prints `Ready! Your webhook signing secret is whsec_...`. Put that in `.env.local` as `STRIPE_IDENTITY_WEBHOOK_SECRET`, then **restart `npm run dev`**.
4. Run the teacher flow (click-through 2). In the `stripe listen` window you should see the events arrive with `[200]`.
5. If you finish the check but the status does not change: look at the `stripe listen` output for a `[400]` (wrong secret: step 3) or `[500]` (database: a migration is missing).

What the code does: creates a `VerificationSession` (document + selfie; passport, driving licence, ID card), sends the teacher to Stripe's hosted page, and on return asks Stripe for the result; the webhook does the same job independently. The result is stored as one of the neutral outcomes; the session id is stored as a reference; no ID image, number or client secret is stored or logged. After an admin decision the session is redacted at Stripe.

`stripe trigger identity.verification_session.verified` sends an event for a session that is not tied to one of your teachers, so the app correctly **ignores** it. To replay a real event: Stripe Dashboard > Developers > Events > pick one > Resend.

## 6. Didit and Veriff (sandbox / test credentials only)

Both are **off until you set their credentials**. Their webhooks must reach your machine, so use a tunnel (`ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000`) and register:

| Provider | Webhook URL | Signing env var |
|---|---|---|
| Didit | `https://<tunnel>/api/webhooks/identity/didit` | `DIDIT_WEBHOOK_SECRET` |
| Veriff | `https://<tunnel>/api/webhooks/identity/veriff` | `VERIFF_SHARED_SECRET` |

To exercise the fallback for real, make Stripe say "not supported" (for example, choose a country/document Stripe's test mode rejects), or set `countryRoutes` in `config/identityRouting.ts` so a country starts on Didit.

**No sandbox credentials? Signed fixtures.** A Veriff decision is trusted as delivered (its raw body is signed), so you can test the real route with a locally signed event. Replace `SECRET`, `TUTOR_ID` and the session id with a session that exists in your database:

```bash
BODY='{"status":"success","verification":{"id":"SESSION_ID","status":"approved","reasonCode":null,"decisionTime":"2026-10-10T10:00:00.000Z","vendorData":"TUTOR_ID","document":{"type":"PASSPORT","country":"TT"}}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$VERIFF_SHARED_SECRET" -hex | sed 's/^.* //')
curl -i -X POST http://localhost:3000/api/webhooks/identity/veriff -H "X-HMAC-SIGNATURE: $SIG" -d "$BODY"
```

A wrong signature must return `400`. Didit's webhook is **not** trusted for the result (Didit says its signature covers the envelope); the app re-fetches the decision from Didit's API, so a Didit fixture needs a real sandbox session. The automated tests cover both with mocked HTTP.

## 7. The dev gallery

`/dev/verification-states` needs `VERIFICATION_DEV_TOOLS=true` **and** a non-production build (`npm run dev`). It makes no requests and shows no real data.

## 8. Useful facts

- Everything new is behind `VERIFICATION_V2_ENABLED`. Off: the pages and APIs return 404, the nav links are hidden, the identity webhooks are acknowledged and ignored.
- No email is sent by any of this. Keep the fake `RESEND_API_KEY` and the `EMAIL_ALLOWLIST` above: with a fake key a send would simply be rejected by Resend, and the app's own mail sender suppresses everything off the allow-list.
- Policy knobs are config files with placeholders: `config/verificationPolicy.ts` (who may revoke), `config/verificationReview.ts` (named reviewer, under-18, restrictions), `config/verificationEvidence.ts` (evidence criteria), `config/verificationRetention.ts` (retention days), `config/identityRouting.ts` (providers, countries, attempt cap).
- Tests: `npm test` (offline). Migration check without a database: `npm install --no-save @electric-sql/pglite && node scripts/verify-verification-migrations.mjs`.

## What was not verified (do these by hand)

- **A full run of all ~257 migrations on an empty database.** No Docker here. Migrations 252 to 257 and their rollbacks were run in an embedded Postgres with Supabase stubs (87 checks pass); the older ones were not replayed.
- **Anything that needs a real Supabase, Stripe, Didit or Veriff account:** logging in, the hosted pages, real webhook delivery, Storage upload and deletion, the real Stripe `redact` call. The code is unit-tested against fakes and signed fixtures only.
- **Veriff's base URL, Didit's unsupported-document code, Veriff's age-code order, Veriff's delete being switched on** are documented TODOs in `lib/identity/providers/*.ts` and `lib/identity/mapping.ts`.
- **Real passports and ID cards** from Trinidad and Tobago, Guyana and Barbados: see `docs/IDENTITY_COVERAGE_TEST.md`. Stripe test mode cannot prove country coverage.
- **The seeded listing and class rows** use column names read from the code; if your schema differs the seed prints which row failed.
- **Lint** was not run (the repo has no ESLint configuration).
- **`npm run build` needs `RESEND_API_KEY` set** (any placeholder): `/api/auth/send-verification` constructs a Resend client when it is imported. That is existing code, not part of this work.
