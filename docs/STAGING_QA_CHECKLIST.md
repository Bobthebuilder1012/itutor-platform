# Staging QA Checklist

Run this checklist on the `dev` deployment before promoting changes to `main`.

## Auth

- Signup as student
- Signup as tutor
- Login/logout
- Password reset flow

## Bookings and sessions

- Create booking request
- Tutor confirm booking
- Reconnect flow when provider token is expired
- Meeting link generation (Google Meet + Zoom)
- Join button status/visibility behavior

## Groups

- Create group
- Add sessions/occurrences
- Student request/join flow
- Group analytics render

## Notifications and messaging

- Booking notifications
- In-app messages
- Email delivery (staging sender)
- Push notifications (web push/Firebase)

## Deployment and runtime

- `npm run build` succeeds
- Vercel Preview deployment succeeds
- No critical runtime errors in Vercel logs
- No writes to production Supabase from preview
