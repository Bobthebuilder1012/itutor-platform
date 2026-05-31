# iTutor Platform — Incident Report

**Reporting period:** May 5 – May 10, 2026
**Author:** Engineering
**Status:** Resolved (with outstanding follow-ups)
**Production impact:** Total platform outage of approximately 4 hours; partial degradation across multiple subsystems for ~48 hours

---

## Executive Summary

Two distinct but related security/availability incidents affected iTutor between May 5 and May 10, 2026:

1. **Incident 1 — Exposed credentials in client bundle (May 5):** Hardcoded administrative email and other sensitive values were discovered shipped in the publicly-served client JavaScript bundle and committed to the public git history. They were removed from both the working tree and the historical commit graph.

2. **Incident 2 — Production database catastrophe (May 8–9):** A combination of long-standing schema drift, a destructive operation against production, an emergency restore, and a downstream auth-service crash caused a complete authentication outage. The platform was unreachable for paying users and prospective investors during the recovery window. A partial AWS availability-zone outage at Supabase compounded the difficulty of recovery.

A third, smaller incident on May 10 — environment confusion (two local clones, dev server on the wrong one, staging branch out of sync) — produced no customer-facing impact but is included for completeness because it affected response speed.

---

## Incident 1 — Exposed Credentials in Client Bundle

### Event

| Field | Value |
|---|---|
| First detected | May 5, 2026 (during routine code review) |
| Remediated | May 5, 2026 22:02 EDT (commit `45801b3`) |
| Severity | High (information disclosure; no evidence of exploitation) |
| Customer impact | None directly observed |

### Description

The file `lib/auth/adminAccess.ts` contained a hardcoded administrative email address, baked at build time into the public client bundle delivered to every browser:

```ts
const EMAIL_MANAGEMENT_ONLY_ADMIN = 'marketing.itutor@myitutor.com';
```

Because the file was imported by client-side modules, the value was visible in the minified JavaScript any visitor could download via `view-source:` or DevTools.

In addition, the commit history contained other hardcoded values that needed to be removed retroactively (the rewrite was performed atomically as part of the same security commit).

### Resolution

- Replaced the hardcoded constant with an environment variable lookup: `process.env.NEXT_PUBLIC_MARKETING_ADMIN_EMAIL ?? ''`.
- Added the variable to `.env.example` so future operators know it must be configured.
- Rewrote git history to purge the secrets from prior commits.
- Force-pushed the rewritten history to `origin/main`.

### Latent defect introduced by the fix

The conditional `email === EMAIL_MANAGEMENT_ONLY_ADMIN` was left unchanged. When the environment variable was *unset* (e.g., on staging), the constant defaulted to the empty string `''`. Any user whose effective email also evaluated to the empty string would then satisfy the equality check — granting them an inadvertent redirect loop to `/admin/emails`. This bug was discovered May 9 during the staging investigation and patched in commit `781ebb0`. See "Findings" below.

---

## Incident 2 — Production Database Catastrophe

### Event

| Field | Value |
|---|---|
| First user reports | May 8, 2026 ~17:00 EDT — login returning HTTP 400 |
| Full outage window | May 8 ~22:00 → May 9 ~01:00 EDT (approximately 3 hours unable to authenticate) |
| Partial degradation | Continued throughout May 9 across signup, country dropdown, video provider, dashboard load |
| Severity | Critical |
| Customer impact | All sign-ins failed; new sign-ups failed; tutor dashboards unreachable |
| Root cause classification | Operational error compounded by missing safeguards |

### Phase A — Schema drift surfaces

The login flow began returning HTTP 400 with the message:

```
Could not find the 'avatar_url' column of 'profiles' in the schema cache
```

Investigation revealed widespread divergence between the application's expected database schema (as defined in `supabase/migrations/`) and the actual schema running in production. Affected objects included, among others:

- `public.profiles` — missing `avatar_url`, `bio`, `institution_id`, `profile_banner_url`, `is_reviewer`, `tutor_verification_status`, `allow_same_day_bookings`, `is_suspended`, and ~10 additional columns.
- `public.subjects` — missing `label` column; CSEC and CAPE catalogue data missing.
- `public.lesson_offers` — foreign-key constraints incorrectly named (`tutor_user_id_fkey` instead of `tutor_id_fkey`), causing PostgREST to reject embedded relationship queries with `PGRST200`.
- `public.sessions` — entire table schema obsolete relative to migration 018 (different column names, missing `booking_id`, `provider`, `join_url`, etc.).
- `public.verification_codes` — table absent entirely.
- `public.session_rsvps`, `public.group_visits` — tables absent entirely.

A consolidated, idempotent reconciliation script (`supabase/_catchup_minimal.sql`) was authored and applied to align production with the application code.

### Phase B — Profile data loss

During reconciliation, it was observed that `public.profiles` contained 0 rows despite `auth.users` containing approximately 299 rows and dependent tables (`bookings`, `lesson_offers`) referencing those user IDs. The combination of a wiped public schema with intact `auth.*` schema and surviving foreign-key children is consistent with one of the following destructive operations being executed against production:

- A `supabase db reset --linked` invocation, which drops the `public` schema and re-applies migrations from the local migrations folder (silently dropping anything not represented in those files).
- A SQL script containing `TRUNCATE` or `DROP TABLE ... CASCADE` against `public.profiles` while foreign-key checks were disabled.
- A backup restore to an older state followed by partial replay.

The exact triggering command was not preserved in shell history and could not be confirmed forensically.

### Phase C — Restore from backup

Production was restored to the May 3, 2026 nightly snapshot. This action:

- Recovered 297 of the 299 profile rows.
- Reattached the orphaned `bookings`, `lesson_offers`, and other dependent records.
- **Did not restore** any `auth.users` rows created after May 3, including approximately a dozen Y Combinator and investor demonstration accounts created during the prior week.

### Phase D — Manual auth.users re-insertion (root cause of total outage)

To reinstate the missing investor accounts, raw SQL `INSERT` statements were executed directly against `auth.users` and `auth.identities`, populating only the columns the operator was familiar with. Several internal token columns required by the GoTrue authentication service were left as `NULL`:

- `confirmation_token`
- `email_change`
- `email_change_token_new`
- `email_change_token_current`
- `recovery_token`
- `phone_change`
- `phone_change_token`
- `reauthentication_token`

GoTrue is a Go service. Its row scanner expects these columns to be `string`, not `*string` (nullable), because the upstream PostgreSQL schema specifies `varchar NOT NULL DEFAULT ''`. The default was never enforced because the inserts bypassed it. On the next sign-in attempt for *any* user — not only the affected accounts — the row scanner raised:

```
sql: Scan error on column index 3, name "confirmation_token":
converting NULL to string is unsupported
```

Supabase's `/auth/v1/token` endpoint returned HTTP 500 with the misleading top-level message **"Database error querying schema"** for all subsequent login attempts. The detail line was visible only by drilling into the Auth Logs panel of the Supabase dashboard.

### Phase E — Compounding factors

Two unrelated events extended the window of confusion:

1. **AWS us-east-1a availability-zone degradation.** Supabase reported the AZ hosting the production project as unavailable, preventing the standard "Restart project" remediation that would have been used had the auth crash been suspected to be container-level. This led to roughly 45 minutes of investigation focused on the wrong layer.
2. **Cached database password drift.** After the restore, the Supabase dashboard's SQL Editor briefly returned "Database authentication failed" because the project's stored password reverted to the May 3 value. A password reset resolved it but had to be performed before further SQL diagnostics could continue.

### Resolution

The actual auth crash was resolved with a single `UPDATE` against `auth.users`:

```sql
UPDATE auth.users SET confirmation_token         = '' WHERE confirmation_token         IS NULL;
UPDATE auth.users SET email_change               = '' WHERE email_change               IS NULL;
UPDATE auth.users SET email_change_token_new     = '' WHERE email_change_token_new     IS NULL;
UPDATE auth.users SET email_change_token_current = '' WHERE email_change_token_current IS NULL;
UPDATE auth.users SET recovery_token             = '' WHERE recovery_token             IS NULL;
UPDATE auth.users SET phone_change               = '' WHERE phone_change               IS NULL;
UPDATE auth.users SET phone_change_token         = '' WHERE phone_change_token         IS NULL;
UPDATE auth.users SET reauthentication_token     = '' WHERE reauthentication_token     IS NULL;
```

Login succeeded on the next attempt without any service restart.

### Phase F — Cascading defects exposed during recovery

Once authentication was restored, several dormant defects surfaced because users could finally exercise code paths that had been blocked. Each was addressed in turn:

| # | Defect | Symptom | Fix (commit) |
|---|---|---|---|
| 1 | Supabase browser client re-instantiated on every read of the storage preference | `AbortError: signal is aborted without reason` aborting in-flight session, country, and signup queries | `0cb2a61` — singleton client |
| 2 | GoTrue `navigator.locks`-based auth lock | Same AbortError, unrelated queries cancelled when token refresh acquired the lock | `414101b` — no-op pass-through lock |
| 3 | Country dropdown loader retried infinitely without clearing `loading` | "Loading countries…" spinner persisted forever | `414101b` — bounded retry with backoff and guaranteed `setLoading(false)` |
| 4 | `verification_codes` table absent on production | Sign-up step 2 → step 3 transition returned HTTP 500 | Manual `CREATE TABLE` on production |
| 5 | `tutor_video_provider_connections` queried with `.single()` | HTTP 406 floods on tutor dashboard for any tutor without a connected provider | `ba15a11` — `.maybeSingle()` |
| 6 | Empty admin-email constant matched empty user emails | Infinite redirect loop `/login` → `/admin/emails` → `/tutor/dashboard` | `781ebb0` — require both sides non-empty |
| 7 | Login marketing panel hidden until `lg` breakpoint | Form isolated on the left of the screen with no branding for most laptop widths | `98a8f5f` — drop to `md` and add mobile logo |
| 8 | `bootstrapProfileIfMissing` referenced columns not present in production (e.g. `avatar_url`) | New users could not create a profile post-signup, leaving them in a dashboard spinner | Resolved by `_catchup_minimal.sql` (Phase A) |

### Customer impact summary

| Window | Impact |
|---|---|
| May 8 ~17:00 → ~22:00 EDT | Login intermittently failing; degraded search; subject seeding broken |
| May 8 ~22:00 → May 9 ~01:00 EDT | **Complete authentication outage** — no user could log in; sign-up step 3 broken |
| May 9 ~01:00 → ~14:00 EDT | Authentication restored but signup, country dropdown, and various dashboard panels intermittent |
| May 10 ~13:00+ | All known issues resolved on production; staging environment brought back to parity |

Approximately 297 user accounts existed throughout. No user data was permanently lost. Up to a dozen `auth.users` rows created between May 3 and May 8 (primarily test/investor accounts) were lost in the restore and required manual re-creation; all have been re-created.

---

## Incident 3 — Environment Confusion (May 10)

### Event

| Field | Value |
|---|---|
| Detected | May 10, 2026 ~13:50 EDT |
| Customer impact | None — internal only |

### Description

Two local clones of `itutor-platform.git` exist on the operator's workstation:

- `C:\Users\jvpg5\Downloads\itutor` — tracking `main`
- `C:\Users\jvpg5\Downloads\itutor-restored` — tracking `staging`

The `npm run dev` server was running from `itutor-restored`, while all of the May 8–10 fixes were being authored in `itutor`. Code edits therefore appeared to "have no effect" in the developer's browser, leading to ~30 minutes of misdirected investigation. Compounding this, `itutor-restored` was 21 commits behind `origin/staging` and reported 18 modified files — those modifications turned out to be phantom CRLF line-ending differences with no actual content changes.

### Resolution

- Documented which folder maps to which branch.
- Restored phantom changes (`git restore .`), fast-forwarded `staging` 21 commits, reinstalled dependencies, restarted the dev server.
- No code changes required.

---

## Root Cause Analysis

### Primary causes

1. **No automated migration deployment.** Schema changes were authored in `supabase/migrations/` but applied to production manually and inconsistently. Production fell behind the codebase silently, accumulating drift until application code broke against the live database.
2. **Direct manipulation of `auth.*` tables.** Manual SQL inserts bypassed the GoTrue Admin API, leaving internal columns at `NULL` and crashing the authentication service for *all* users. This is the single direct cause of the total outage.
3. **No production guardrails.** A destructive operation (most likely `supabase db reset --linked`) was executable against the production project with no confirmation prompt or operator interlock.
4. **Hardcoded credentials in client code.** A configuration value that should have been an environment variable was checked in as a literal and shipped to every browser.

### Contributing factors

5. **Empty-string equality in admin check.** A latent defect in the May 5 security fix turned an unset environment variable into an open admin redirect.
6. **Misleading error surface.** GoTrue's "Database error querying schema" message gave no actionable detail at the API layer; the real error was only visible inside the Supabase Auth Logs panel. Roughly 60 minutes of recovery time was spent investigating wrong hypotheses (AZ outage, role permissions, schema cache).
7. **No application-level health check.** The outage was discovered by the operator and via user complaints rather than by automated monitoring.
8. **Browser Supabase client re-instantiation pattern.** The `Proxy`-wrapped client could swap underlying instances when storage preferences were re-read, aborting in-flight requests with an opaque error.
9. **`navigator.locks`-based GoTrue auth lock.** The lock occasionally aborted concurrent requests with `AbortError: signal is aborted without reason`, generating noise that masked real failures.
10. **No staging/production parity enforcement.** Schema fixes applied to production were not also applied to staging, leaving staging in a permanently degraded state until investigated.

---

## Resolution Actions Taken

### Code changes shipped (commits on `main` and `staging`)

| Commit | Description |
|---|---|
| `45801b3` | Removed hardcoded admin email from client bundle and from git history |
| `0cb2a61` | Made the browser Supabase client a true singleton |
| `414101b` | Disabled GoTrue `navigator.locks` lock; bounded country-loader retries |
| `28b19c5` | Logged and surfaced the real error in `send-verification` API route |
| `7cc23e0` | Enabled the Lessons feature by default |
| `ba15a11` | Switched dashboard `tutor_video_provider_connections` query to `.maybeSingle()` |
| `781ebb0` | Required non-empty values on both sides of the admin-email check |
| `98a8f5f` | Restored the login page marketing panel at narrower viewports |

### Database changes applied to production

- `_catchup_minimal.sql` — additive schema reconciliation against `public` schema.
- Manual `CREATE TABLE public.verification_codes` plus index, RLS policy, and PostgREST schema reload.
- `UPDATE auth.users SET ... = '' WHERE ... IS NULL` for all eight token columns.
- Manual re-insertion of the lost YC / investor `auth.users` and `auth.identities` rows (with all token columns explicitly defaulted to `''`).
- Database password reset to resync internal service connections after the restore.

### Database changes pending on staging

The same set of changes is documented for staging but has not been confirmed applied at the time of this report. See "Outstanding Items".

---

## Lessons Learned

1. **The single most important takeaway:** never run raw SQL `INSERT` against `auth.users`. Use `supabase.auth.admin.createUser()` exclusively. The total outage on May 8 was caused entirely by violating this rule once.
2. **Migrations must deploy automatically.** Any process where production schema diverges silently from the codebase will eventually produce an outage like this one.
3. **Backups are necessary but not sufficient.** Restoring from backup recovered 99% of the data but lost a week of new accounts. A point-in-time recovery (PITR) configuration would have allowed restoration to seconds before the destructive operation.
4. **Generic 500 messages are an operational hazard.** The "Database error querying schema" message looked infrastructural and led the recovery in the wrong direction. API routes should surface the underlying error message to operators.
5. **Latent defects compound.** The May 5 security fix introduced the empty-string admin bug that didn't surface until May 9 in a different environment. Defensive equality checks (`if (!a || !b) return false`) are cheap insurance.

---

## Preventative Measures — Implemented and Recommended

### Implemented

- [x] All critical code defects from the May 8–9 timeline are patched and shipped.
- [x] Browser Supabase client is now stateless across storage-preference reads.
- [x] GoTrue `navigator.locks` lock is disabled.
- [x] Empty-string admin equality check fixed.
- [x] Country dropdown can no longer get permanently stuck on a loader.
- [x] Verification table and auth token columns repaired in production.
- [x] Login marketing panel renders correctly across viewports.

### Recommended (not yet implemented)

- [ ] **CI-driven migration deployment.** Add a GitHub Actions step that runs `supabase db push --linked` against production on every merge to `main`, with the access token stored as an Actions secret. Mirror to staging on every merge to `staging`. This eliminates schema drift permanently.
- [ ] **Replace `bootstrapProfileIfMissing` with a database trigger.** A trigger on `auth.users` insert that calls `INSERT INTO public.profiles ... ON CONFLICT DO NOTHING` makes it structurally impossible to have an authenticated user without a profile. Survives any future restore.
- [ ] **Hard guardrails against destructive commands on production.** Alias `supabase db reset` to `false` (or a confirmation script) in any shell that has the production project linked. Require an explicit `--i-know-what-im-doing` flag.
- [ ] **Enable Point-in-Time Recovery (PITR) on Supabase.** Reduces the data loss window from "previous nightly snapshot" to "any second within the last seven days".
- [ ] **Auth smoke-test cron.** A 5-minute Vercel cron that performs `supabase.auth.admin.signInWithPassword` against a dedicated health-check account and posts to Slack/SMS on failure. Today's outage would have been detected within 5 minutes instead of when the operator noticed.
- [ ] **Periodic migration drift audit.** Schedule `supabase db diff --linked` weekly and alert if non-empty. Surfaces dashboard-applied changes before they become an outage.
- [ ] **Standardise on a single local clone per developer.** Two clones tracking different branches caused 30 minutes of confusion on May 10. Recommend one clone, switch branches with `git checkout`.
- [ ] **Add an internal runbook entry for "Database error querying schema."** Future operators should know to: (1) open Auth Logs first, (2) check `auth.users` for `NULL` token columns, (3) only then investigate infrastructure.

---

## Outstanding Items

| # | Item | Owner | Priority |
|---|---|---|---|
| 1 | Apply `_catchup_minimal.sql`, `verification_codes` table, and auth-token cleanup on staging Supabase | Engineering | High |
| 2 | Audit production `auth.users` for any further `NULL` columns on rows created via raw SQL | Engineering | High |
| 3 | Implement automated migration deployment (CI) | Engineering | High |
| 4 | Implement auth smoke-test cron + alerting | Engineering | High |
| 5 | Replace `bootstrapProfileIfMissing` with a database trigger | Engineering | Medium |
| 6 | Enable PITR on production Supabase project | Engineering | Medium |
| 7 | Document operational runbook including the auth-token failure mode | Engineering | Medium |
| 8 | Confirm whether any user other than test accounts hit the May 8 outage and notify if appropriate | Product | Medium |
| 9 | Review remaining `process.env.NEXT_PUBLIC_*` defaults for similar empty-string-equality risks | Engineering | Low |
| 10 | Consolidate or clearly label the two local repository clones | Operator | Low |

---

## Appendix A — Affected Commits

```
45801b3 security: remove hardcoded keys/emails from client bundle and git history
0cb2a61 fix(auth): prevent supabase client churn aborting in-flight requests
414101b fix(auth): disable navigator.locks lock and unstick country loader
28b19c5 chore(api): log and surface real error from send-verification route
7cc23e0 feat(lessons): enable Lessons feature by default in all environments
ba15a11 fix(tutor): use maybeSingle for tutor_video_provider_connections
781ebb0 fix(auth): stop empty email matching empty admin env var
98a8f5f style(login): show marketing panel from md and add mobile logo
```

## Appendix B — Reference Errors

```
# Initial schema-drift error (May 8 ~17:00)
Could not find the 'avatar_url' column of 'profiles' in the schema cache

# PostgREST relationship error (May 8)
PGRST200: Could not find a relationship between 'lesson_offers' and 'student_id'
in the schema cache

# Total auth outage error (May 8 ~22:00 → May 9 ~01:00)
HTTP 500 from POST /auth/v1/token?grant_type=password
Body: { "msg": "Database error querying schema" }
Auth log detail:
  "error": "error finding user: sql: Scan error on column index 3,
   name \"confirmation_token\": converting NULL to string is unsupported"

# Supabase client churn errors (May 9)
AbortError: signal is aborted without reason

# Redirect loop (May 9)
/login → /admin/emails → /tutor/dashboard → /login → ...

# Send-verification 500 (May 9)
{ "error": "Failed to store verification code",
  "detail": "relation \"public.verification_codes\" does not exist",
  "code":   "42P01" }
```

---

*End of report.*
