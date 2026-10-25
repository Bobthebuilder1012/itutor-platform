# Teacher verification v2: staging handoff

Status: **prepared, nothing pushed, nothing deployed, no database touched.** Branch: `verification-staging-clean` (local only; the older `verification-stripe-identity` still carries the 7 unrelated commits and must not be used for the PR). Everything below is a plan for a person to carry out.

Contents: 1 The clean branch, 2 Migrations, 3 File-deletion sweep, 4 Environment, 5 Order of work, 6 Staging test script, 7 Rollback.

---

## 1. The clean branch (done locally)

Local branch **`verification-staging-clean`**, created from `origin/staging` at `1edcc521` (fetched 2026-10-24; staging's highest migration is **269**). It holds only the 18 verification commits, the staging prep commit and the renumbering commit below. The 7 unrelated commits (waitlist expiry cron, social preview logo, parent paid-class checkout, reminder claim failures, the `feat/physical-classes-rework` merge, cash-payment removal, the Schedule picker) are **not** on it, and neither is `app/api/payments/stripe/webhook/route.ts`.

It was built in a separate worktree (`C:Usersambaitutor-clean`) so your working copy and its uncommitted payments file were never touched. To work on it: `cd C:Usersambaitutor-clean`, or `git switch verification-staging-clean` in the main folder once `app/api/payments/stripe/webhook/route.ts` is committed or set aside. Nothing is pushed.

Commits, oldest first (hashes are the cherry-picked copies):

| Commit | Subject |
|---|---|
| `054ea755` | chore(test): add vitest and an in-memory fake database |
| `d0af72f7` | feat(verification): allowed-transition map and one status-change function |
| `f501a888` | feat(verification): v2 teacher flow behind VERIFICATION_V2_ENABLED |
| `b1feaf46` | feat(verification): separate Stripe Identity webhook with its own signing secret |
| `af0f99f5` | fix(verification): route every status write through the map, authenticate OCR, lock revoked teachers |
| `541a6893` | fix(verification): compare tutor_verification_status with one helper, not lowercase 'verified' |
| `13e4f65c` | feat(verification): migration 253 security hardening (not applied) |
| `0bc2dd9f` | feat(verification): Stripe session redaction, file deletion and retention sweep |
| `8d6d1703` | feat(verification): admin review, reverification-required status and decision audit |
| `f349b86c` | feat(verification): three-label badges and click panel, nav links, behind the flag |
| `81b8ee12` | feat(identity): provider-agnostic identity layer (stripe, didit), neutral outcomes, fallback chain |
| `13c86065` | refactor(verification): split badge, panel, admin queue and review into presentational parts |
| `91da05f8` | feat(identity): veriff provider, total attempt cap across providers, identity_outcomes log |
| `d7dffc26` | feat(verification): dev-only states gallery, local-only seed script, migration check harness |
| `c59a07dc` | docs+scripts: local testing guide, identity coverage scorecard, guarded migration apply script |
| `191960ef` | docs: list the verification v2 environment variable names in .env.example |
| `71aa105e` | test: screenshots of the dev states gallery at 375px and 1280px, screenshot script, email note in the guide |
| `20d578da` | feat(identity): didit primary, stripe backup via IDENTITY_PRIMARY_PROVIDER; didit X-Signature-V2 and rotation headers |
| `ae368e48` | chore(verification): staging handoff, combined apply/rollback/pre-check SQL, daily cleanup schedule with tests |
| (last) | chore(verification): renumber migrations 252-257 to 270-275 |

Conflicts met while bringing them over, and the resolution (staging's code kept in every case):
- `components/marketplace/ClassCard.tsx`: staging added WhatsApp and Google Classroom icons beside the subject line; we added the badges above it. Kept staging's block unchanged and put our two badge lines above it.
- `components/tutor/TutorShell.tsx`, imports: staging added `Send`, we added `ShieldCheck`. Kept both.
- `components/tutor/TutorShell.tsx`, component head: staging added an `actions` slot with its doc comment. Kept staging's signature and comment exactly; added only our `VERIFICATION_V2_NAV` constant above them.
- `vercel.json`: staging added two crons (`progress-class-levels`, `credits-nightly`). Kept both and appended our `verification-cleanup?apply=1` entry (17 crons in total).
- `package.json` and `package-lock.json` merged without a conflict; `npm ci` accepts the merged lock. The only changes against staging are the `test` script and the `vitest` dev dependency.

Not in the verification set, deliberately left alone: everything else staging changed.

### Migration numbers (renumbered)

| Was | Now | File |
|---|---|---|
| 252 | **270** | `teacher_verification_v2` |
| 253 | **271** | `verification_security_hardening` |
| 254 | **272** | `verification_v2_review` |
| 255 | **273** | `verification_v2_redaction_deletion` |
| 256 | **274** | `identity_providers` |
| 257 | **275** | `identity_outcomes` |

Both `supabase/migrations/` and `supabase/rollbacks/` were renamed, and every reference updated: the SQL file headers, `scripts/verify-verification-migrations.mjs`, `scripts/build-verification-sql.mjs`, `scripts/seed-verification-test-users.mjs`, `lib/verificationV2/review.ts`, `lib/verificationV2/fileDeletion.ts` and the docs. The generated SQL in `docs/` was rebuilt. They do not depend on file numbers, so they work the same when pasted into the SQL Editor.

---

## 2. Migrations 270 to 275

Files (generated by `node scripts/build-verification-sql.mjs`, do not edit by hand):

| File | What it is |
|---|---|
| `docs/pre-check-notifications.sql` | **Read-only.** Seven SELECTs. Run first, one block at a time. |
| `docs/apply-verification-migrations.sql` | 270 to 275 in **one transaction**. All or nothing. Safe to run twice. |
| `docs/rollback-verification-migrations.sql` | 275 down to 270 in one transaction. **Destructive** (drops the v2 tables). |

Checked offline on an embedded Postgres (`node scripts/verify-combined-migrations.mjs`, 18 checks, and `node scripts/verify-verification-migrations.mjs`, 87 checks): apply works on a clean database and twice in a row; a missing prerequisite function or an unrecognised notifications constraint aborts with nothing left behind; rollback removes everything; apply works again afterwards; the pre-check runs and only selects. It has **not** been run on a real Supabase project. The embedded checks need `npm install --no-save @electric-sql/pglite`; run that **after** `npm run build`, because it can disturb `node_modules`.

### Risks (the apply is not purely additive)
1. **Notifications constraint:** `notifications_type_check` is dropped and re-added with 6 new values (the three decision types and `VERIFICATION_IN_REVIEW`, `VERIFICATION_REVERIFICATION_REQUIRED`, `VERIFICATION_CHECK_FAILED`), read from the live definition. Migration 271 also adds a UNIQUE index on `notifications (user_id, metadata->>'dedupe_key')` (one notice per change) and, only if missing, the `metadata` column. Nothing else about the table changes. If its shape is unexpected the apply stops (nothing changes). The pre-check shows it first.
2. **Profiles constraint:** `profiles_tutor_verification_status_check` is dropped and re-added twice (270, then 272). Postgres re-checks every profile row; an old status value outside the list makes the apply fail, safely. Pre-check query 4 finds them.
3. **Behaviour change on three existing tables:** new triggers restrict tutors to `file_path` on `tutor_verification_requests`, `is_public` on `tutor_verified_subjects`, and block users writing `is_reviewer` / `tutor_verified_at` on `profiles`. Any existing screen or script that wrote other columns as the tutor will now get a permission error.
4. **Depends on 217:** `is_privileged_request()` and `is_admin_or_reviewer(uuid)` must exist (pre-check 2).
5. **Numbers:** 270 to 275 follow staging's own 269, so the file numbers no longer clash. Object names do not clash on the offline check; pre-check 5 confirms on staging. If staging gains more migrations before you merge, renumber again.
6. **Rollback is destructive and has side effects:** it deletes all v2 data, and sets profiles that say REVOKED or REVERIFICATION_REQUIRED to REJECTED. It leaves the notifications constraint widened and the private storage bucket in place (a last, commented line deletes the bucket; Supabase may refuse a direct delete, use Dashboard > Storage).
7. **Not applied anywhere**, including production. Do not run any of this on `nfkrfciozjxrodkusrhh` (production).

### Notifications and live updates (migration 271, no new migration number)

Migrations 270 to 275 had not been applied anywhere, so the notification types and the dedupe index were folded into 271 instead of adding a 276. If you applied any of them already, do **not** re-run the apply file as a substitute: write a new 276 with the six types and the index.

- **Who is told, in-app only (no email):** Verified (`VERIFICATION_APPROVED`), Rejected with the reason (`VERIFICATION_REJECTED`), Revoked with the reason (`VERIFICATION_REVOKED`), Reverification required, In review (when the teacher submits), and a failed or not-supported or declined identity check with attempts left (`VERIFICATION_CHECK_FAILED`). A passed identity check and a cancellation are not announced. All of it is behind `VERIFICATION_V2_ENABLED`: while it is off nothing here touches the database.
- **Where the teacher sees it:** the bell in the teacher top bar (unread count, live) opens `/tutor/notifications`; each notice links to `/tutor/verification-v2`.
- **Duplicates:** only the writer that won the status change notifies, every notice has a `dedupe_key` built from the change's own stamp, and the unique index refuses a repeat. A repeated webhook delivery is also stopped by the event-id table.
- **Not a database transaction.** supabase-js cannot span two writes. The notice is written right after the status change; if that write fails the status stays changed, the failure is logged (kind and error code only) and a webhook returns an error so the provider re-delivers, which retries just the notice. Admin decisions return `notification: 'failed'` instead.
- **Live status page:** `/tutor/verification-v2` asks for its own state every 5 s while in review and every 8 s while in progress (only while the tab is visible) and stops by itself once the status is verified, rejected, revoked or verify-again.
- **Public pages:** nothing to revalidate on the server. The teacher profile, class cards and finder cards are client pages that read badges from `/api/public/verification-v2/*`, which sends `Cache-Control: no-store`; `/find/*` is `force-dynamic`; and the repository has no `revalidatePath` or `revalidateTag` anywhere. So a badge appears or disappears on the next page load. For a tab left open, the browser's badge cache now expires after 60 s and is re-checked every minute and when the tab comes back to the front.
- **Found, not changed:** the older admin routes (`app/api/admin/verification/requests/*/approve`, `reject`, the reviewer decide routes) insert their notification with a column `data` and no `title`; the live table has `metadata` and a NOT NULL `title`, so those inserts probably fail and are only logged. They are the old flow and untouched here.
- **Existing side effect:** any insert into `notifications` reaches the existing push fan-out trigger (a push, never an email).

---

## 3. File-deletion sweep

The route already existed (`app/api/cron/verification-cleanup/route.ts`) but nothing scheduled it. Now:
- **Schedule:** `vercel.json` runs `/api/cron/verification-cleanup?apply=1` every day at 02:45 UTC.
- **Security:** 401 unless `Authorization: Bearer $CRON_SECRET` (Vercel sends it when `CRON_SECRET` is set in the project).
- **Flag:** while `VERIFICATION_V2_ENABLED` is not `true` it answers `{"skipped": ...}` and neither sweeps nor creates a database client. So the schedule is idle on production until the flag is turned on.
- **By hand it is a dry run** unless `?apply=1`.
- **What it does:** deletes proof files of applications rejected longer ago than the retention policy, all files of teachers revoked longer ago, old-flow rejected files, and retries any provider-session redaction that failed (`config/verificationRetention.ts`).
- **Tests:** `tests/verification/cleanupCron.test.ts` (auth, flag off for every falsy value with and without `apply=1`, dry-run default, only `apply=1` applies, schedule present once).
- **Never run on real Storage.** On staging, call it as a dry run first (step 6, test 12).
- **Check once after deploy:** Vercel > Project > Settings > Cron Jobs should list the path with `?apply=1`. If your Vercel plan drops the query string, the sweep silently stays a dry run; the dry-run report shows `"dryRun": true`.

---

## 4. Environment variables (names only)

### Required on STAGING to run the test
| Name | Note |
|---|---|
| `VERIFICATION_V2_ENABLED` | `true`. The one switch for everything. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Already set; must be the **staging** project. |
| `NEXT_PUBLIC_APP_URL` | The staging https URL (provider return pages). |
| `CRON_SECRET` | Already set; the cleanup route needs it. |
| `IDENTITY_PRIMARY_PROVIDER` | `didit` (also the default when unset) or `stripe`. |
| `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET` | Didit is skipped unless the first two are set. The webhook secret is shown once when you add the destination in Didit. |
| `STRIPE_SECRET_KEY`, `STRIPE_IDENTITY_WEBHOOK_SECRET` | The backup. **Test-mode** key on staging. The identity webhook has its **own** secret, separate from the payments one. |

### Optional
`DIDIT_EXPECT_ENVIRONMENT` (`sandbox` on staging: drops webhooks from any other environment), `DIDIT_WEBHOOK_SECRET_PREVIOUS` (only for the 24 hours after rotating the Didit secret), `DIDIT_BASE_URL`, `VERIFF_API_KEY`, `VERIFF_SHARED_SECRET`, `VERIFF_BASE_URL` (leave Veriff unset and it is skipped), `VERIFICATION_PROCESS_SECRET` (server-to-server secret for the OCR endpoint), `VERIFICATION_DEV_TOOLS` (gallery at `/dev/verification-states`; returns 404 in any production build, so inert on Vercel; leave it unset).

### Staging only
`VERIFICATION_V2_ENABLED=true`, `DIDIT_SANDBOX_SCENARIO` (forces a simulated Didit outcome; testing aid), `DIDIT_EXPECT_ENVIRONMENT=sandbox`, the Stripe **test** key and webhook, the Didit sandbox application.

### Must NOT be set on production yet
`VERIFICATION_V2_ENABLED` (unset or `false`), `VERIFICATION_DEV_TOOLS`, `DIDIT_SANDBOX_SCENARIO`, `DIDIT_*`, `STRIPE_IDENTITY_WEBHOOK_SECRET`, `VERIFF_*`, `IDENTITY_PRIMARY_PROVIDER`, `VERIFICATION_PROCESS_SECRET`. Do not register any Didit, Veriff or Stripe Identity webhook against the production URL, and do not apply the migrations to the production database. Note that merging the code does put the new cron line in production's `vercel.json`: it will call the route daily and get `skipped`.

Webhook endpoints to register in each provider's **staging/sandbox** console:
- Didit: `https://<staging-host>/api/webhooks/identity/didit`, event `status.updated` (`data.updated` is not needed).
- Stripe: `https://<staging-host>/api/webhooks/stripe-identity`, events `identity.verification_session.verified` and `identity.verification_session.requires_input`.
- Veriff (only if used): `https://<staging-host>/api/webhooks/identity/veriff`.

---

## 5. Order of work

1. The clean branch exists (section 1). Re-run `git fetch origin`; if staging has moved, rebase it and renumber again if staging took 270 or higher. Run `npm test`, `npx tsc --noEmit -p .`, `npm run build`.
2. Open the PR into `staging` yourself and let CI/Vercel build a preview. (This build did none of that.)
3. Staging Supabase SQL Editor: confirm the project ref is **not** `nfkrfciozjxrodkusrhh`. Run `docs/pre-check-notifications.sql` block by block and match every "WHAT YOU WANT".
4. Run `docs/apply-verification-migrations.sql` once. Expect "Success" and a NOTICE line about notifications.
5. Re-run pre-check block 5: it should now list the six tables, the functions and the bucket.
6. Staging environment: set the section 4 variables, with `VERIFICATION_V2_ENABLED` **last**, then redeploy staging.
7. Register the Didit (and Stripe) webhook destinations; paste the secrets into the environment; redeploy.
8. Create the test accounts (below) and walk the script in section 6.
9. Rollback if needed (section 7). Do nothing on production.

**The seed script refuses staging on purpose.** Create these by hand on staging: 3 teacher accounts (A, B, C), 1 admin, 1 reviewer (admin sets `is_reviewer`), 1 student, using real email addresses you control or addresses your mail allow-list allows.

---

## 6. Staging test script

Notation: teacher A, B, C; admin; student. "Panel" means the popup opened by clicking a badge. Write down any difference between what you see and what is described.

**0. Flag and routes**
1. Open `https://<staging-host>/api/verification-v2/flag`. Expect `{"enabled":true}`.
2. Sign in as teacher A. In the sidebar press **Verification** (or open `/tutor/verification-v2`). Expect the consent step.

**1. Teacher flow (teacher A, Didit)**
3. Read the notice, press **I agree, continue**.
4. Choose **Trinidad and Tobago**. Press **Start identity check**. Expect to land on Didit's hosted page, not Stripe's.
5. Finish with Didit's sandbox test option (or, with `DIDIT_SANDBOX_SCENARIO` set, the scenario it forces).
6. Return to the status page. Expect *identity verified* within seconds, then the credentials step.
7. Add a CSEC credential with a link. Add a degree with a PDF under 10 MB. Try an 11 MB file and a `.docx`: both refused.
8. Add 3 extras: the form is replaced by "You have added the maximum". Remove one, add another.
9. Press **Submit for review**. Expect *Submitted, in review* and locked fields. Reload and sign out/in: unchanged. The bell shows 1 new notice, *Your verification is in review*; click it: you land on `/tutor/verification-v2`.

**2. Consent decline (teacher B)**
10. Sign in as B, open `/tutor/verification-v2`, read the notice and **leave without pressing the button**. Reload. Expect the consent step again, nothing recorded: no identity session exists. In SQL: `select * from tutor_verification_v2 where tutor_id = '<B>'` returns no row.
11. Agree, choose a country, press **Start identity check**, and on Didit's page **decline consent**. (Unverified: Didit's docs do not say which screen or event reports a decline. If your workflow has no consent screen, you cannot trigger this on Didit; use `DIDIT_SANDBOX_SCENARIO` or Veriff, and write down what Didit sent so `lib/identity/mapping.ts` can be completed.) Back in iTutor expect plain wording ending in "contact support", no provider name, and no second provider offered. In SQL, `identity_status` is `consent_declined`.

**3. Three attempts, then support (teacher C)**
12. Sign in as C. Agree, choose a country, start the check. Fail it (close the Didit page, or set `DIDIT_SANDBOX_SCENARIO` to a failing scenario). Expect a retry button, and in the bell *Your identity check did not pass* ending in "You have 2 attempts left".
13. Retry twice more. The third failure must end at **contact support**, with no fourth button. The cap is 3 in total, across Didit and Stripe.
14. To see the fallback: set `IDENTITY_PRIMARY_PROVIDER=stripe` for a fresh teacher and confirm Stripe's page opens first. Set it back to `didit`.

**4. Didit webhook arrival**
15. In the Didit console open the destination's delivery log after step 6: expect `status.updated` with HTTP **200**.
16. Resend the same delivery: HTTP 200 again and no second change (idempotent). For a failed check, the bell must still hold exactly **one** notice for it.
17. Send a request with a wrong signature, for example `curl -X POST https://<staging-host>/api/webhooks/identity/didit -d '{}'`. Expect **400**.
18. In the Vercel logs there must be no signature, key or secret text.

**5. Admin approve, reject, revoke**
19. Sign in as the admin. Open **Verification v2** in the sidebar (`/admin/verification-v2`). Teacher A is in the list.
20. Open A. Check the credentials, the evidence criteria and the identity section (it says iTutor stores no ID). Press **Approve**. Check **Decision history** shows the decision. **Leave teacher A's status page open in another window and do not refresh it:** within about 5 seconds it changes to verified. The bell shows *You are verified*.
21. Open another submitted teacher (use C after completing the flow, or B). Press **Reject** with a reason. Sign in as that teacher: the reason shows, fields are editable, resubmit works. The bell shows *Your verification was not approved* with the reason.
22. Back as admin, open A and press **Revoke** with a reason. Sign in as a **reviewer** who is not an admin: no Revoke button anywhere.
23. Sign in as A: *revoked*, the bell shows *Your verification was revoked* with the reason, nothing submittable. Run in the browser console: `fetch('/api/tutor/verification-v2/submit',{method:'POST'}).then(r=>r.status)` expects **403**.

**6. Reverification required**
24. Re-approve A (or use another approved teacher). As admin, on the queue scroll to **Ask teachers to verify again**. Press **Preview** (counts only), then **Apply**.
25. Sign in as that teacher: **Please verify again** (not a rejection), and the bell shows *Please verify again*. Their badges disappear from public pages (an already-open page within a minute, any new page load at once).

**7. Badges on profiles (signed out, private window)**
26. Open `/tutors/<approved teacher id>`: three separate labels: *ID checked*, *Credentials reviewed*, *Teacher-provided extras (not verified by iTutor)*. Click each: the panel opens.
27. Open `/classes` and `/find/browse`: same labels on that teacher's cards; **none** on revoked, rejected, in-review or reverification teachers.
28. As a student (signed in) open `/student/tutors/<id>`: same badges.

**8. Cleanup sweep (dry run only)**
29. `curl -H "Authorization: Bearer $CRON_SECRET" "https://<staging-host>/api/cron/verification-cleanup"`. Expect a JSON report with `"dryRun": true`. Without the header expect 401.
30. Do **not** add `?apply=1` until you have read the report and agree with what it would delete.

**9. Account deletion**
31. As a throwaway teacher with files, delete the account (Settings > Delete account). It must succeed even if provider redaction fails.

---

## 7. Rollback

Quick stop (no data loss): set `VERIFICATION_V2_ENABLED` to `false` or remove it, redeploy. Every verification screen, badge and route goes dark; the tables stay.

Full rollback (deletes verification data):
1. Turn the flag off and redeploy.
2. Export anything you want to keep (`tutor_verification_v2`, `tutor_verification_v2_decisions`, `identity_outcomes`).
3. Run `docs/rollback-verification-migrations.sql` once in the staging SQL Editor.
4. Re-run pre-check block 5: it should return zero rows.
5. Optionally delete the private bucket `tutor-credential-proofs` in Dashboard > Storage (empty it first).
6. Remove the webhook destinations in Didit and Stripe.

A code rollback is a revert of the PR in git; with the flag off it is also safe to leave the code in place.
