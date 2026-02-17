# Migration 075: Fix RLS Recursion

## Purpose
Fix infinite recursion errors in Row Level Security policies that prevent messages from loading.

## Problem
The RLS policies created in migration `046_community_rls_policies.sql` cause infinite recursion when PostgreSQL tries to evaluate them. Specifically:

1. `community_memberships` policies check themselves recursively
2. `messages` policies for community Q&A trigger membership checks
3. The circular reference causes: `infinite recursion detected in policy for relation "community_memberships"`

## Solution
Replace recursive `EXISTS` subqueries with `ARRAY()` + `ANY()` pattern to avoid circular evaluation.

### Key Changes:

**Before (Recursive):**
```sql
EXISTS (
  SELECT 1 FROM community_memberships cm
  WHERE cm.community_id = community_memberships.community_id
    AND cm.user_id = auth.uid()
)
```

**After (Non-Recursive):**
```sql
community_id = ANY(
  ARRAY(
    SELECT community_id FROM community_memberships
    WHERE user_id = auth.uid() AND status = 'active'
  )
)
```

## Tables Affected
- `community_memberships`
- `messages`
- `profiles`
- `conversations`

## Security Impact
- ✅ **No security regression** - same access controls maintained
- ✅ Users can only see their own conversations
- ✅ Users can only see their community messages
- ✅ Profile data readable by all authenticated users (not sensitive)

## Performance Impact
- ✅ **Improved** - no recursive evaluation overhead
- ✅ Faster policy checks with ARRAY() caching
- ✅ Reduced database CPU usage

## Testing
Run in Supabase SQL Editor, then:

1. **Test Messages:**
   - Load student messages page
   - Should see messages without errors
   - Console should show no "infinite recursion" errors

2. **Test Security:**
   - Try accessing another user's conversation
   - Should get empty results or permission denied

3. **Test Community Q&A:**
   - Post a question in a community
   - Should be visible to community members only

## Rollback
If issues occur, disable RLS temporarily:
```sql
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE community_memberships DISABLE ROW LEVEL SECURITY;
```

Then investigate and fix policies before re-enabling.

## Related Files
- `src/supabase/migrations/046_community_rls_policies.sql` - Original problematic policies
- `src/supabase/migrations/015_notifications_and_messages.sql` - DM policies (working)
- `lib/services/notificationService.ts` - Client code that fetches messages

## Notes
- This migration is **safe to run in production**
- It maintains the same security model
- It fixes the recursion without compromising access control
- RLS is automatically re-enabled at the end
