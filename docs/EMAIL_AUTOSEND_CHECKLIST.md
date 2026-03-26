# Email auto-send checklist

Use this to confirm transactional and scheduled emails are configured and firing.

---

## 1. Environment variables

In production (Vercel / your host) and locally when testing email:

| Variable | Required | Purpose |
|----------|----------|---------|
| `RESEND_API_KEY` | Yes | Resend API key; without it, no emails are sent (service returns a clear error). |
| `RESEND_FROM_EMAIL` | No | Default: `iTutor <hello@myitutor.com>`. Override if you use a different from address. |
| `CRON_SECRET` | Yes for cron | Used by Vercel cron to call `/api/cron/send-onboarding-emails`. Must match the secret you set. |

---

## 2. Auto-send triggers (no user action after the first one)

| Email | When it sends | Code path |
|-------|----------------|-----------|
| **Welcome** | Right after signup (student / tutor / parent). | Signup pages call `POST /api/send-welcome-email` with `userId`. |
| **Verification congratulations** | When a tutor is approved (single or bulk). | `approve` route, `decide` route, `bulk-decide` route call `sendEmail()` after updating profile. |
| **Onboarding sequence (Day 1, 2, 3…)** | On a schedule, for users in `onboarding_email_queue`. | Vercel cron `GET /api/cron/send-onboarding-emails` every 15 min (see `vercel.json`). |

---

## 3. Requirements for each to work

**Welcome email**

- `RESEND_API_KEY` set.
- `email_templates` has a row for the role and stage `0` (e.g. `user_type = 'tutor'`, `stage = 0`). If missing, API returns 404 and the signup page logs a console warning.

**Verification congratulations**

- `RESEND_API_KEY` set.
- Tutor profile has `email`; otherwise the email is skipped (approval still succeeds).

**Onboarding cron**

- `RESEND_API_KEY` and `CRON_SECRET` set in Vercel (or your host).
- `vercel.json` crons deployed (Vercel sets the cron schedule).
- `onboarding_email_queue` and `email_send_logs` tables exist (migrations 067, 068).
- `email_templates` populated for the stages you use (e.g. 1, 2, 3).

---

## 4. Code safeguards (after checkup)

- **`lib/services/emailService.ts`**  
  If `RESEND_API_KEY` is missing, `sendEmail()` returns `{ success: false, error: 'RESEND_API_KEY not configured' }` and does not call Resend (avoids unclear errors).

- **Signup pages**  
  After calling `/api/send-welcome-email`, they check `response.ok` and log a console warning if the request failed, so failures are visible in the browser console and logs.

---

## 5. Quick verification

1. **Welcome**: Sign up a new user (student/tutor/parent) and check Resend dashboard or inbox for the welcome email; check server logs for “Welcome email sent” or errors.
2. **Verification**: Approve a tutor and check for the congratulations email; check logs for “Failed to send verification congratulations email” if it fails.
3. **Cron**: In Vercel, open the cron run logs for `send-onboarding-emails` and confirm it runs every 15 min and that it sends when there are due rows in `onboarding_email_queue`.
