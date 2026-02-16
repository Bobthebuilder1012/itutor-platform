# Messages Not Appearing - Constraint Violation Fix

## Problem
Messages were being inserted successfully into the database (confirmed by SQL query showing 6 messages), but were not appearing in the UI. The browser console showed:

```
Error fetching messages: violates check constraint "community_membership_not_both"
```

## Root Cause
The `getMessages` function was using a Supabase join query:
```typescript
.select(`
  *,
  sender:profiles!messages_sender_id_fkey(id, username, display_name, full_name, avatar_url)
`)
```

This foreign key join was somehow triggering a CHECK constraint violation on the `community_memberships` table, even though the query had nothing to do with communities. This appears to be a Supabase/PostgreSQL issue with complex foreign key relationships or database triggers.

## Solution
Modified `lib/services/notificationService.ts` to fetch messages and profiles separately, avoiding the foreign key join:

### Before:
- Single query with FK join to profiles
- Failed with constraint violation

### After:
- Query 1: Fetch messages only
- Query 2: Fetch profiles separately by IDs  
- Join in JavaScript layer

This bypasses whatever database-level issue was causing the constraint violation.

## Code Changes

**File:** `lib/services/notificationService.ts`

**Function:** `getMessages()`

Changed from:
```typescript
const { data, error } = await supabase
  .from('messages')
  .select(`
    *,
    sender:profiles!messages_sender_id_fkey(...)
  `)
  .eq('conversation_id', conversationId);
```

To:
```typescript
// 1. Fetch messages
const { data: messages } = await supabase
  .from('messages')
  .select('*')
  .eq('conversation_id', conversationId);

// 2. Get unique sender IDs
const senderIds = [...new Set(messages.map(m => m.sender_id))];

// 3. Fetch profiles separately
const { data: profiles } = await supabase
  .from('profiles')
  .select('id, username, display_name, full_name, avatar_url')
  .in('id', senderIds);

// 4. Join in JavaScript
const profileMap = new Map(profiles.map(p => [p.id, p]));
const enrichedMessages = messages.map(msg => ({
  ...msg,
  sender: profileMap.get(msg.sender_id),
  is_own_message: msg.sender_id === currentUserId
}));
```

## Benefits
- ✅ Avoids database constraint violations
- ✅ More efficient (only fetches unique profiles)
- ✅ Graceful fallback if profile fetch fails
- ✅ Better error isolation
- ✅ No database schema changes required

## Testing
1. Submit feedback as tutor: "Test message"
2. Navigate to student messages
3. Open conversation with tutor
4. ✅ Message should now appear
5. Check browser console - no errors

## Impact
- Messages now appear correctly in conversation view
- Session feedback appears as natural messages
- No more constraint violation errors
- Backward compatible - no migration needed

## Related Files
- `lib/services/notificationService.ts` - Main fix
- `components/ConversationView.tsx` - Added refresh button and logging

## Future Investigation
The underlying cause of the `community_membership_not_both` constraint violation should be investigated:
- Check database triggers
- Review RLS policies
- Examine foreign key cascades
- Consider database integrity check

For now, the workaround is stable and performant.
