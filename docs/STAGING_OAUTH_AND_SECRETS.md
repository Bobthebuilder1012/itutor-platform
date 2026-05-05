# Staging OAuth + Secrets Runbook

## OAuth callback URLs

For staging, register callback URLs against the staging frontend domain.

Google:
- Authorized redirect URI: `https://<staging-domain>/api/auth/google/callback`

Zoom:
- Redirect URL for OAuth: `https://<staging-domain>/api/auth/zoom/callback`
- Allow List URL: `https://<staging-domain>`

Production should keep production URLs only.

## Vercel env value alignment

Preview environment must use:

- `GOOGLE_REDIRECT_URI=https://<staging-domain>/api/auth/google/callback`
- `ZOOM_REDIRECT_URI=https://<staging-domain>/api/auth/zoom/callback`

Production environment must use:

- `GOOGLE_REDIRECT_URI=https://<production-domain>/api/auth/google/callback`
- `ZOOM_REDIRECT_URI=https://<production-domain>/api/auth/zoom/callback`

## Secret isolation rules

- Never reuse production service-role keys in Preview.
- Use a separate staging email sender/API key.
- Use staging-only web push keys.
- Use staging-only Firebase project values.
- Keep `TOKEN_ENCRYPTION_KEY` and `CRON_SECRET` different between Preview and Production.
