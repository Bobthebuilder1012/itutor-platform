# PRODUCTION DEPLOYMENT CHECKLIST

## ⚠️ CRITICAL: RLS Is Currently Disabled

For local development, Row Level Security (RLS) has been **disabled** on:
- `community_memberships`
- `profiles`
- `conversations`
- `messages`

This was necessary to resolve infinite recursion errors, but **MUST be fixed before production**.

---

## Before Deploying to Production:

### 1. Create Proper RLS Migration
A new migration file must be created with working RLS policies that don't cause recursion.

**Required:** `src/supabase/migrations/XXX_fix_rls_policies.sql`

The policies should:
- ✅ Allow users to read their own data
- ✅ Allow users to read data they have permission for
- ✅ NOT cause infinite recursion
- ✅ NOT reference tables in circular ways
- ✅ Be simple and performant

### 2. Test RLS Policies Locally
1. Apply the new migration
2. Enable RLS on all tables
3. Test message loading
4. Test user permissions
5. Verify no recursion errors
6. Test with different user roles

### 3. Security Audit
Verify:
- [ ] Users can only see their own conversations
- [ ] Users can only see their own profile
- [ ] Community members can only see their community data
- [ ] No data leakage between users
- [ ] Admin access works correctly

### 4. Performance Testing
- [ ] Message loading is fast (<500ms)
- [ ] No N+1 query issues
- [ ] Database indexes are used
- [ ] Connection pool not exhausted

---

## Current State

### What Works:
- ✅ Messages load successfully
- ✅ Feedback appears as natural messages
- ✅ No recursion errors
- ✅ All 6 features implemented and working

### What Needs Fixing:
- ❌ RLS is disabled (security risk in production)
- ❌ Proper RLS policies need to be created
- ❌ Policies need thorough testing
- ❌ Migration needs to be created

---

## Recommended Approach

### Option 1: Simple Non-Recursive Policies (Recommended)
```sql
-- profiles: Allow all authenticated users to read all profiles
CREATE POLICY "profiles_read_all" ON profiles
FOR SELECT TO authenticated
USING (true);

-- conversations: Users can only read their own
CREATE POLICY "conversations_read_own" ON conversations
FOR SELECT TO authenticated
USING (participant_1_id = auth.uid() OR participant_2_id = auth.uid());

-- messages: Users can read messages in their conversations (no subquery)
CREATE POLICY "messages_read_own" ON messages
FOR SELECT TO authenticated
USING (
  conversation_id IN (
    SELECT id FROM conversations
    WHERE participant_1_id = auth.uid() OR participant_2_id = auth.uid()
  )
);
```

### Option 2: Disable RLS on Non-Sensitive Tables
- Keep RLS enabled on: `messages`, `conversations`
- Disable RLS on: `profiles` (if profile data is not sensitive)
- Simplified policies for remaining tables

---

## Files to Review

- `PRODUCTION_RLS_FIX.sql` - Original attempted fix
- `COMPREHENSIVE_RLS_FIX.sql` - Second attempted fix
- `DISABLE_ALL_RLS.sql` - Current state (dev only)
- `src/supabase/migrations/046_community_rls_policies.sql` - Problematic policies

---

## Timeline

- [x] Get messages working locally
- [ ] Create proper RLS migration
- [ ] Test RLS migration locally
- [ ] Security audit
- [ ] Deploy to staging
- [ ] Test in staging
- [ ] Deploy to production

**DO NOT deploy current code to production with RLS disabled!**
