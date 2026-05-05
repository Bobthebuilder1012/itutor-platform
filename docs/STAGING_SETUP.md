# iTutor Staging Setup

This project uses a shared staging model:

- `main` -> production
- `dev` -> staging/preview QA

## Current backend mapping

- Production Supabase ref: `nfkrfciozjxrodkusrhh`
- Staging Supabase ref: `lhxlhzgisrauqipuxaxh`

## 1) Vercel environment mapping

Set variables by environment in Vercel Project Settings:

- **Production**: use production Supabase + production third-party keys
- **Preview**: use staging Supabase + staging third-party keys
- **Development**: local-only, usually from `.env.local`

Required variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `ZOOM_CLIENT_ID`
- `ZOOM_CLIENT_SECRET`
- `ZOOM_REDIRECT_URI`
- `TOKEN_ENCRYPTION_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `CRON_SECRET`
- `PAID_CLASSES_ENABLED`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_VAPID_KEY`

## 2) OAuth callback mapping

Use environment-specific callback URLs:

- Google callback route: `/api/auth/google/callback`
- Zoom callback route: `/api/auth/zoom/callback`

For preview/staging, callbacks must point to the staging domain (Preview URL).
For production, callbacks must point to the production domain.

## 3) Migration policy

Migrations live under `src/supabase/migrations`.

Staging rule:
1. Apply/test migration in staging backend first.
2. Validate core flows.
3. Promote to production after QA sign-off.

## 4) Release flow

1. Feature branch -> PR -> Vercel Preview
2. QA on Preview + staging backend
3. Merge to `dev` for shared staging verification
4. Merge to `main` for production release

## 5) End-to-end staging smoke checklist

- Auth: signup/login/password reset
- Tutor video connection (Google + Zoom)
- Booking accept/reconnect/link generation
- Group create/discover/join/attendance/analytics
- Notifications/email/push
- Build + runtime logs clean in Vercel

