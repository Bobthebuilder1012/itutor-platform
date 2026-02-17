# Expired Lesson Offers Implementation

## Overview
Implemented automatic expiration detection for lesson offers that have passed their scheduled time. Both tutors and students now see expired offers clearly marked with an "Expired" status badge.

## Problem Statement
Lesson offers with past scheduled times (e.g., Feb 15, 12:25 PM when current date is Feb 17) were still showing as "Pending" with "Waiting for student response" message. This caused confusion as users couldn't distinguish between current and expired offers.

## Solution

### Database Schema
The `lesson_offers` table already supported the `'expired'` status in its CHECK constraint:
```sql
status TEXT NOT NULL DEFAULT 'pending' 
CHECK (status IN ('pending', 'accepted', 'declined', 'countered', 'expired'))
```

### Implementation Details

#### 1. Automatic Expiration Detection (Tutor View)
**File:** `components/offers/SentOffersList.tsx`

**Changes:**
- Added logic in `fetchOffers()` to check if offer time has passed
- Automatically updates offers with `status = 'pending'` or `'countered'` to `'expired'` when `proposed_start_at < now`
- Updates database and local state in real-time

```typescript
// Check for expired offers
const now = new Date();
const offersToExpire = (data || []).filter(offer => {
  const startTime = new Date(offer.proposed_start_at);
  return (offer.status === 'pending' || offer.status === 'countered') && startTime < now;
});

// Mark expired offers in database
if (offersToExpire.length > 0) {
  const expiredIds = offersToExpire.map(o => o.id);
  await supabase
    .from('lesson_offers')
    .update({ status: 'expired' })
    .in('id', expiredIds);
}
```

#### 2. UI Updates (Tutor View)

**Status Badge:**
- Added "Expired" badge with gray styling (`bg-gray-200 text-gray-700`)
- Distinguishes expired offers from pending, countered, accepted, and declined

**Action Buttons:**
- Disabled "Accept Counter" and "Decline" buttons for expired offers
- Shows message: "This offer has expired."

**Display Order:**
- Shows offers in order: Pending → Countered → Expired
- Expired offers remain visible for reference but cannot be acted upon

#### 3. Automatic Expiration Detection (Student View)
**File:** `components/offers/OffersReceivedList.tsx`

**Changes:**
- Same expiration detection logic as tutor view
- Checks both `pending` and `countered` offers
- Updates database when expired offers are detected

#### 4. UI Updates (Student View)

**Status Badge:**
- Consistent gray styling for expired offers
- Clear "Expired" label

**Action Buttons:**
- Hides all action buttons (Accept, Counter, Decline) for expired offers
- Shows message: "This offer has expired."

**Display Order:**
- Consistent with tutor view: Pending → Countered → Expired

## Technical Highlights

### Real-Time Detection
- Expiration is checked every time offers are fetched
- Both views automatically detect and update expired offers
- Database is updated once, then cached state reflects the change

### Database Efficiency
- Single batch update for all expired offers
- Uses `IN` clause to update multiple records at once
- Only updates offers that need expiration (pending or countered)

### User Experience
- Clear visual distinction with gray badges
- Disabled actions prevent confusion
- Expired offers remain visible for record-keeping
- No need for manual cleanup

## Files Modified

1. **`components/offers/SentOffersList.tsx`**
   - Added expiration detection in `fetchOffers()`
   - Updated status badge styling
   - Modified display logic to include expired offers
   - Disabled counter offer actions for expired offers

2. **`components/offers/OffersReceivedList.tsx`**
   - Added expiration detection in `fetchOffers()`
   - Updated status badge styling
   - Modified display logic to include expired offers
   - Hid action buttons for expired offers

## Status Colors

| Status | Background | Text Color | Use Case |
|--------|-----------|------------|----------|
| Pending | Yellow | Dark Yellow | Awaiting response |
| Countered | Blue | Dark Blue | Counter-offer sent |
| Accepted | Green | Dark Green | Offer accepted |
| Declined | Red | Dark Red | Offer declined |
| **Expired** | **Gray** | **Dark Gray** | **Time has passed** |

## Testing Checklist

- [x] Tutor view detects expired offers
- [x] Student view detects expired offers
- [x] Database updates correctly
- [x] Status badge shows "Expired"
- [x] Action buttons disabled/hidden
- [x] Expired message displayed
- [x] No errors in console
- [x] Multiple expired offers handled correctly
- [x] Mixed pending and expired offers display correctly

## Edge Cases Handled

1. **Multiple Expired Offers:** Batch update handles all at once
2. **Just-Expired Offers:** Detected on next fetch/refresh
3. **Countered Expired Offers:** Both original and counter proposals can expire
4. **No Expired Offers:** No unnecessary database updates

## Future Enhancements (Optional)

1. **Scheduled Cleanup:** Background job to auto-expire offers nightly
2. **Hide Old Expired:** Option to hide offers expired more than 7 days ago
3. **Expiration Notifications:** Notify users when their offers expire
4. **Auto-Decline:** Automatically decline expired offers after X days

## Impact

✅ **Users can now clearly identify expired offers**  
✅ **No confusion about past meeting times**  
✅ **Cleaner, more organized offer lists**  
✅ **Prevents accidental actions on expired offers**  
✅ **Both tutor and student views are consistent**

## Deployment Notes

- No database migration required (status already supported)
- No breaking changes
- Safe to deploy immediately
- Works with existing data

---

**Date:** February 17, 2026  
**Status:** ✅ Implemented and Tested  
**Developer:** AI Assistant
