# Video Provider Switching Prevention

## Overview
Tutors are now **prevented from switching** between video providers (Google Meet ↔ Zoom) when they have upcoming scheduled sessions. This prevents all the migration issues and ensures students always have correct meeting links.

## How It Works

### **1. Session Check on Page Load**
When a tutor visits the Video Setup page, the system automatically checks for future sessions:

```typescript
const { count } = await supabase
  .from('sessions')
  .select('id', { count: 'exact', head: true })
  .eq('tutor_id', profile.id)
  .in('status', ['SCHEDULED', 'JOIN_OPEN'])
  .gte('scheduled_start_at', new Date().toISOString());
```

### **2. Visual Warning**
If the tutor has upcoming sessions, a prominent warning banner appears:

```
⚠️ Provider Switching Disabled

You have X upcoming sessions scheduled with your current provider.

To prevent issues with meeting links for your students, you cannot 
switch video providers while you have scheduled sessions.

To switch providers:
• Wait for your sessions to complete, or
• Cancel your upcoming sessions from the Sessions page
```

### **3. Disabled Switch Buttons**
The "Switch to Zoom" / "Switch to Google Meet" buttons are:
- ❌ **Disabled** when `futureSessions > 0`
- 🔒 **Show lock icon** and "(Disabled)" text
- 🛑 **Blocked with alert** if somehow clicked

### **4. Alert Message**
If a tutor tries to switch, they see:

```
⚠️ Cannot Switch Video Provider

You have X upcoming sessions scheduled.

To switch from [current] to [new], you must either:
• Wait for all sessions to complete
• Cancel your upcoming sessions

This prevents issues with meeting links for your students.
```

## User Flow

### **Scenario 1: No Upcoming Sessions**
```
✅ Tutor visits Video Setup
✅ No upcoming sessions found
✅ Switch buttons are ENABLED
✅ Tutor can freely switch providers
✅ No migration needed (no sessions to migrate)
```

### **Scenario 2: Has Upcoming Sessions**
```
✅ Tutor visits Video Setup
⚠️ 3 upcoming sessions found
⚠️ Yellow warning banner appears
🔒 Switch buttons are DISABLED
❌ Tutor cannot switch
📋 Tutor must cancel or wait for sessions
```

### **Scenario 3: After Sessions Complete**
```
✅ All sessions completed/cancelled
✅ Tutor refreshes Video Setup page
✅ No upcoming sessions found
✅ Warning banner disappears
✅ Switch buttons are ENABLED again
✅ Tutor can now switch providers
```

## Benefits

### **✅ Prevents Migration Issues**
- No need to update existing meeting links
- Students always have correct links
- No cache/refresh problems

### **✅ Clear Communication**
- Tutors know exactly why they can't switch
- Clear instructions on how to proceed
- Visual feedback (disabled buttons, warning banner)

### **✅ Data Integrity**
- Prevents orphaned meeting links
- Ensures sessions always match provider
- No database inconsistencies

### **✅ Better UX**
- Proactive prevention vs. reactive error handling
- Clear expectations set upfront
- No confusing migration process

## Technical Implementation

### **Files Modified:**

1. **`app/tutor/video-setup/page.tsx`**
   - Added `futureSessions` state
   - Added `checkFutureSessions()` function
   - Updated `handleConnect()` to check sessions before allowing switch
   - Added warning banner component
   - Disabled switch buttons when `futureSessions > 0`
   - Removed migration functionality (no longer needed)

### **Key Functions:**

```typescript
// Check for future sessions
async function checkFutureSessions() {
  const { count } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('tutor_id', profile.id)
    .in('status', ['SCHEDULED', 'JOIN_OPEN'])
    .gte('scheduled_start_at', new Date().toISOString());
    
  setFutureSessions(count || 0);
}

// Block switching if sessions exist
async function handleConnect(provider: VideoProvider) {
  if (connection && futureSessions > 0) {
    alert('Cannot switch - you have upcoming sessions');
    return;
  }
  // ... proceed with connection
}
```

## What Was Removed

### **❌ Session Migration System**
- Removed "Refresh Future Session Links" button
- Removed `handleMigrateSessions()` function
- Removed `migrating` state
- Kept migration code in codebase for reference/future use

The migration API route (`/api/sessions/migrate-provider`) still exists but is not exposed in the UI.

## Future Considerations

### **If Migration is Needed Again:**
The migration code still exists in:
- `lib/services/migrateSessionsToNewProvider.ts`
- `app/api/sessions/migrate-provider/route.ts`

It can be re-enabled by adding the button back to the UI.

### **Potential Enhancements:**
1. **Auto-enable after last session** - Send notification when switching becomes available
2. **Scheduled switch** - Let tutors schedule a provider switch for after their last session
3. **Override option** - Admin/support can manually trigger migration if needed
4. **Grace period** - Allow switching within X hours before first session (risky)

## Testing

### **Test Cases:**

1. **Tutor with no sessions**
   - ✅ Should see no warning
   - ✅ Switch buttons enabled
   - ✅ Can switch providers

2. **Tutor with 1 upcoming session**
   - ✅ Should see warning banner
   - ✅ Switch buttons disabled
   - ✅ Cannot switch

3. **Tutor with multiple sessions**
   - ✅ Warning shows correct count
   - ✅ Switch buttons disabled
   - ✅ Cannot switch

4. **After cancelling all sessions**
   - ✅ Warning disappears (after refresh)
   - ✅ Switch buttons enabled
   - ✅ Can switch again

5. **After session completes**
   - ✅ Session count decreases
   - ✅ When count = 0, can switch

## User Communication

### **Documentation Needed:**
- FAQ: "Why can't I switch video providers?"
- Help article: "How to change your video provider"
- In-app tooltip explaining the restriction

### **Support Scripts:**
If tutor contacts support wanting to switch:
1. Check their upcoming sessions count
2. Explain they must cancel or wait
3. Offer to help cancel sessions if needed
4. Or wait until sessions complete

## Rollback Plan

If this causes issues, revert by:
1. Remove session check from `handleConnect()`
2. Remove warning banner
3. Re-enable switch buttons
4. Add back migration button
5. Use the existing migration system

All migration code is still in the codebase for easy rollback.













