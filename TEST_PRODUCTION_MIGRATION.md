# Testing Production RLS Migration

## Step 1: Apply the Migration

In Supabase SQL Editor, run:
```
src/supabase/migrations/075_fix_rls_recursion.sql
```

Expected output:
```
✅ RLS Recursion Fix Applied Successfully
Policy counts:
  - community_memberships: X policies
  - messages: X policies
  - profiles: X policies
  - conversations: X policies
```

## Step 2: Restart Dev Server

Kill and restart to clear any connection caches:
```bash
# Kill existing
taskkill /F /IM node.exe

# Start fresh
cd C:\Users\jvpg5\Downloads\itutor-restored
npm run dev
```

## Step 3: Test in Browser

1. Close ALL browser tabs (clear service workers)
2. Open fresh: http://localhost:3000
3. Login as student
4. Go to Messages → Jovan Goodluck conversation

**Expected Results:**
- ✅ Messages load successfully
- ✅ All 6 messages visible
- ✅ NO "infinite recursion" errors
- ✅ NO 500 errors in Network tab
- ✅ Console shows: "Messages loaded: 6"

## Step 4: Test Security

Try to access a conversation you don't own:
1. Note a conversation ID from another user
2. Try to navigate to it directly
3. Should get empty results or error

## Step 5: Verify RLS is Enabled

Run in Supabase SQL Editor:
```sql
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE tablename IN ('community_memberships', 'profiles', 'conversations', 'messages')
ORDER BY tablename;
```

All should show `rowsecurity: true`

## If It Works:
✅ Production ready! We can commit and push.

## If It Fails:
Share the error message and I'll debug further.
