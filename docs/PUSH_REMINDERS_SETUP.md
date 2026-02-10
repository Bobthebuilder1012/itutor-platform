## Session 10-minute push reminders (FCM + Supabase Scheduled Edge Function)

This implements **device-level** push notifications (web now; mobile later) sent **10 minutes before** a scheduled session.

### What was added
- **Database**:
  - `push_tokens` (multi-device tokens per user)
  - `notifications_log` (idempotency/dedupe)
  - `sessions(status, scheduled_start_at)` index for fast window queries
  - Migration: `src/supabase/migrations/071_push_notifications_core.sql`
- **Web token registration**:
  - Client registrar: `components/push/PushTokenRegistrar.tsx` (mounted in `components/DashboardLayout.tsx`)
  - Token endpoint: `app/api/push-tokens/register/route.ts`
  - Service worker (served at `/firebase-messaging-sw.js`): `app/firebase-messaging-sw.js/route.ts`
- **Supabase Edge Function**:
  - Function: `supabase/functions/session-reminder-10-min/index.ts`
  - Shared:
    - `supabase/functions/_shared/notificationTemplates.ts` (notification copy constant)
    - `supabase/functions/_shared/fcm.ts` (FCM HTTP v1 auth + send)

### Environment variables

#### Frontend (public Firebase config)
Set these in your hosting provider (e.g. Vercel):
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_VAPID_KEY`

#### Supabase Edge Function secrets (server-only)
Set these in Supabase for the scheduled function:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FCM_SERVICE_ACCOUNT_JSON` (stringified service account JSON for FCM HTTP v1)

### Scheduling the Edge Function (every minute)
1. Deploy the Edge Function `session-reminder-10-min` to Supabase.
2. In Supabase Dashboard → Edge Functions → `session-reminder-10-min` → Schedules:
   - Add schedule: `* * * * *` (every minute)

### How dedupe works (no duplicates ever)
For each eligible session:
- The function attempts to insert `(user_id, session_id, type)` into `notifications_log` using `ON CONFLICT DO NOTHING`.
- Only if the insert succeeds does it send pushes to that user’s tokens.

This makes the cron run idempotent and safe to retry.

### Verification procedure
1. Apply migration `071_push_notifications_core.sql` in Supabase.
2. Configure the frontend Firebase env vars and deploy.
3. Log in as a student/tutor on a browser, grant notification permission when prompted.
4. Confirm tokens appear in `push_tokens` for that user.
5. Create a session in `public.sessions` with:
   - `status = 'SCHEDULED'`
   - `scheduled_start_at = now() + interval '10 minutes'` (UTC)
6. Wait for the next minute tick (cron runs every minute).
7. Confirm:
   - Rows inserted in `notifications_log` for **both** the student and tutor for that session and type `session_reminder_10_min`
   - Push notification arrives on each device token (browser closed/background)
8. Confirm **no duplicates**:
   - Keep the session in the 9–11 minute window for multiple cron runs.
   - Verify `notifications_log` unique constraint prevents additional entries.

### Operational notes
- Token delivery failures are **silent** by design (expired/invalid tokens won’t crash the cron).
- The query window is `now()+9m` → `now()+11m` using indexed columns.
- To add additional reminder types later, add new `type` values and constants and reuse the same log table.

