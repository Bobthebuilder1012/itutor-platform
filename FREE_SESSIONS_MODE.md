# Free Sessions Mode

## Overview
The platform now supports displaying all sessions as FREE to users until payments are enabled. This is controlled by an environment variable flag.

## Environment Variable

```bash
NEXT_PUBLIC_ENABLE_PAID_SESSIONS=false
```

- **`false`** (default): All sessions show as "FREE" across the platform
- **`true`**: Shows actual tutor pricing

## What Changes When Set to `false`

### Landing Page
- Featured tutor cards show "$0.00/hr TTD" instead of actual hourly rates
- Non-logged-in visitors see all tutors with $0.00 pricing

### Search Results Pages
- Public search results (`/search`) show "$0.00/hr" for all tutors
- Student search results (`/student/search`) show "$0.00/hr" for all tutors
- Parent search results (`/parent/search`) show "$0.00/hr" for all tutors
- Price filters still work behind the scenes for when payments are enabled

### Student Find Tutors Page
- All tutors show "$0.00/hr" instead of "From $X/hr"
- Price filters still work behind the scenes for when payments are enabled

### Tutor Profile Pages (Student & Parent Views)
- Subject cards show "$0.00" instead of actual dollar amounts
- "per hour" text remains consistent
- Booking confirmation shows "$0.00/hr" instead of actual price

### Booking Flow
- All booking confirmations show "$0.00/hr" pricing
- Maintains pricing format consistency throughout

## Files Modified

1. `.env.local` - Added feature flag
2. `components/landing/TutorCard.tsx` - Landing page tutor cards
3. `app/search/page.tsx` - Public search results page
4. `app/student/search/page.tsx` - Student search results page
5. `app/parent/search/page.tsx` - Parent search results page
6. `app/student/find-tutors/page.tsx` - Find tutors page pricing display
7. `app/tutors/[tutorId]/page.tsx` - Student view of tutor profiles
8. `app/parent/tutors/[tutorId]/page.tsx` - Parent view of tutor profiles

## How to Enable Paid Sessions

When ready to enable payments:

1. Update `.env.local`:
```bash
NEXT_PUBLIC_ENABLE_PAID_SESSIONS=true
```

2. Restart your development server:
```bash
npm run dev
```

3. For production (Vercel), add the environment variable:
   - Go to Vercel Dashboard → Project Settings → Environment Variables
   - Add: `NEXT_PUBLIC_ENABLE_PAID_SESSIONS` = `true`
   - Redeploy the application

## Testing

### Test Free Mode (Current State)
1. Ensure `.env.local` has `NEXT_PUBLIC_ENABLE_PAID_SESSIONS=false`
2. Visit landing page → Should see "FREE sessions"
3. Browse tutors → Should see "FREE sessions" everywhere
4. View tutor profile → Should see "FREE" for all subjects
5. Try booking → Should see "FREE" in confirmation

### Test Paid Mode (Future)
1. Set `NEXT_PUBLIC_ENABLE_PAID_SESSIONS=true` in `.env.local`
2. Restart server
3. Visit same pages → Should see actual tutor pricing
4. Verify all prices display correctly

## Notes

- The flag is `NEXT_PUBLIC_` prefixed, making it available on both server and client side
- All backend pricing logic remains intact and unchanged
- Tutors can still set their rates in their dashboard
- When payments are enabled, all existing pricing data will immediately become active
- This is a display-only change - no database modifications needed

## Rollback

To revert to showing actual prices, simply set the flag to `true` and restart the application.
