# RLS Policy Implementation Guide

## ✅ What Was Generated

The file `migrations/002_rls_policies.sql` contains **complete, production-ready RLS policies** for all 13 tables in your iTutor schema.

## 📦 What's Included

### 1. Helper Functions (3 total)
- `is_admin()` - Checks if current user is an admin
- `is_my_child(uuid)` - Checks if a student is the current user's child
- `is_child_session(uuid)` - Checks if a session belongs to current user's child

### 2. RLS Enablement
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for all 13 tables

### 3. Policies by Table

| Table | Policies | Key Rules |
|-------|----------|-----------|
| profiles | 7 | Own profile access, parent-child reading |
| parent_child_links | 6 | Parents manage own links |
| subjects | 4 | Public read, admin write |
| tutor_subjects | 7 | Tutors manage own, public read |
| tutor_verifications | 6 | Tutors submit, admins approve |
| tutor_verified_subject_grades | 6 | Tutors toggle display, public reads visible grades |
| sessions | 10 | Students/tutors/parents read own sessions |
| ratings | 8 | Students rate completed sessions, public read |
| payments | 6 | Payers/tutors read, admins write |
| tutor_earnings | 4 | Tutors read own, admins write |
| tutor_balances | 4 | Tutors read own, admins write |
| commission_ledger | 3 | Admin only |
| payout_requests | 6 | Tutors create/read own, admins approve |

**Total Policies**: 77

## 🚀 How to Apply

### Step 1: Verify Prerequisites
Ensure you've already run the initial schema migration (`001_initial_schema.sql`) and all tables exist.

```sql
-- Check that all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'profiles', 'parent_child_links', 'subjects', 'tutor_subjects',
  'tutor_verifications', 'tutor_verified_subject_grades', 'sessions',
  'ratings', 'payments', 'tutor_earnings', 'tutor_balances',
  'commission_ledger', 'payout_requests'
);
```

You should see 13 rows returned.

### Step 2: Apply RLS Policies

**Option A: Via Supabase Dashboard**
1. Go to Supabase Dashboard → SQL Editor
2. Open `migrations/002_rls_policies.sql`
3. Copy the entire contents
4. Paste into SQL Editor
5. Click **Run**

**Option B: Via Supabase CLI**
```bash
# If you haven't already, link your project
supabase link --project-ref your-project-ref

# Run the migration
supabase db push

# Or apply directly
psql $DATABASE_URL -f src/supabase/migrations/002_rls_policies.sql
```

### Step 3: Verify RLS is Enabled

```sql
-- Check RLS status for all tables
SELECT 
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

All tables should show `rls_enabled = true`.

### Step 4: Verify Policies Were Created

```sql
-- Count policies per table
SELECT 
  schemaname,
  tablename,
  COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;
```

You should see policy counts matching the table above.

### Step 5: List All Policies (Optional)

```sql
-- See all policy names
SELECT 
  tablename,
  policyname,
  cmd AS command,
  qual AS using_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

## 🧪 Testing RLS Policies

### Test 1: User Can Read Own Profile

```sql
-- Run as authenticated user
SELECT * FROM profiles WHERE id = auth.uid();
-- Should return 1 row (your profile)

-- Try to read someone else's profile
SELECT * FROM profiles WHERE id != auth.uid();
-- Should return 0 rows (unless you're a parent or admin)
```

### Test 2: Parent Can Read Children's Data

```sql
-- As a parent user, first link a child
INSERT INTO parent_child_links (parent_id, child_id)
VALUES (auth.uid(), '<child-profile-id>');

-- Now read child's profile
SELECT * FROM profiles WHERE id = '<child-profile-id>';
-- Should return 1 row

-- Read child's sessions
SELECT * FROM sessions WHERE student_id = '<child-profile-id>';
-- Should return their sessions
```

### Test 3: Tutor Can Read Own Earnings

```sql
-- As a tutor user
SELECT * FROM tutor_earnings WHERE tutor_id = auth.uid();
-- Should return your earnings

SELECT * FROM tutor_balances WHERE tutor_id = auth.uid();
-- Should return your balance
```

### Test 4: Student Can Rate Completed Session

```sql
-- As a student, try to rate a completed session
INSERT INTO ratings (session_id, student_id, tutor_id, stars, comment)
VALUES (
  '<completed-session-id>',
  auth.uid(),
  '<tutor-id>',
  5,
  'Great session!'
);
-- Should succeed if session is completed and belongs to you

-- Try to rate someone else's session
INSERT INTO ratings (session_id, student_id, tutor_id, stars)
VALUES ('<other-student-session-id>', auth.uid(), '<tutor-id>', 4);
-- Should fail (RLS violation)
```

### Test 5: Backend Service Role Can Write Payments

**Note**: These operations should be done via your backend using the Supabase service role key, NOT via client auth token.

```javascript
// Backend code (Node.js example)
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Service key, not anon key
);

// Insert payment (will succeed with service role)
const { data, error } = await supabase
  .from('payments')
  .insert({
    session_id: sessionId,
    student_id: studentId,
    payer_id: payerId,
    tutor_id: tutorId,
    amount_ttd: 120.00,
    gateway: 'WiPay',
    gateway_reference: 'WP123456',
    status: 'SUCCESS'
  });
```

## 🔒 Important Security Notes

### 1. Service Role Operations

The following tables should **ONLY** be written to by your backend using the service role key:

- `payments` (after WiPay/FAC webhook)
- `tutor_earnings` (90/10 split calculation)
- `tutor_balances` (balance updates)
- `commission_ledger` (platform revenue)

**Never expose your service role key to the client!**

### 2. Admin Role Detection

Admin access is determined by checking if `profiles.role = 'admin'` for the current user. Ensure you:

1. **Manually set** the first admin user in your database:
   ```sql
   UPDATE profiles 
   SET role = 'admin' 
   WHERE email = 'your-admin-email@example.com';
   ```

2. **Protect admin role changes** - consider adding a database trigger to prevent users from changing their own role to 'admin':
   ```sql
   CREATE OR REPLACE FUNCTION prevent_role_escalation()
   RETURNS TRIGGER AS $$
   BEGIN
     IF OLD.role != 'admin' AND NEW.role = 'admin' THEN
       RAISE EXCEPTION 'Cannot escalate to admin role';
     END IF;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;

   CREATE TRIGGER check_role_escalation
   BEFORE UPDATE ON profiles
   FOR EACH ROW
   EXECUTE FUNCTION prevent_role_escalation();
   ```

### 3. Verified Grades Immutability

The policy for `tutor_verified_subject_grades` ensures tutors can only update the `display` field. However, for extra safety, consider adding a trigger:

```sql
CREATE OR REPLACE FUNCTION protect_verified_grades()
RETURNS TRIGGER AS $$
BEGIN
  -- Only allow display field to change
  IF OLD.subject_name != NEW.subject_name OR 
     OLD.grade != NEW.grade OR 
     OLD.exam_type != NEW.exam_type THEN
    RAISE EXCEPTION 'Cannot modify subject_name, grade, or exam_type';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER protect_verified_grade_fields
BEFORE UPDATE ON tutor_verified_subject_grades
FOR EACH ROW
EXECUTE FUNCTION protect_verified_grades();
```

## 🐛 Troubleshooting

### Issue: "new row violates row-level security policy"

**Cause**: You're trying to insert/update data that your RLS policies don't allow.

**Solution**: 
1. Check which user role you're authenticated as
2. Review the policy for that table and command (INSERT/UPDATE)
3. Ensure your `WITH CHECK` conditions are met

**Example**: If inserting a session fails, ensure:
- `student_id = auth.uid()` (you're the student), OR
- You're a parent with `payer_id = auth.uid()` and child is linked

### Issue: "permission denied for table X"

**Cause**: RLS is enabled but no policies allow your operation.

**Solution**: Check that policies were created successfully:
```sql
SELECT * FROM pg_policies WHERE tablename = 'table_name';
```

### Issue: Helper functions return errors

**Cause**: Functions may not be granted to `authenticated` role.

**Solution**: Ensure the grants at the end of the migration ran:
```sql
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_my_child(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_child_session(uuid) TO authenticated;
```

### Issue: Policies are too permissive or restrictive

**Solution**: You can modify policies after creation:
```sql
-- Drop a policy
DROP POLICY "policy_name" ON table_name;

-- Recreate with different rules
CREATE POLICY "policy_name" ON table_name
FOR SELECT
USING (your_conditions_here);
```

## 📊 Policy Performance

RLS policies add a `WHERE` clause to every query. For optimal performance:

1. **Indexes are already created** on foreign keys (`tutor_id`, `student_id`, `parent_id`, etc.)
2. **Helper functions use `SECURITY DEFINER`** to run with elevated privileges
3. **Avoid complex joins in policies** - our policies are simple lookups

### Monitoring Slow Queries

```sql
-- Enable slow query logging in Supabase
-- Settings → Database → Configuration → log_min_duration_statement = 1000

-- Check pg_stat_statements for slow queries
SELECT 
  calls,
  mean_exec_time,
  query
FROM pg_stat_statements
WHERE query LIKE '%profiles%' OR query LIKE '%sessions%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

## 🔄 Updating Policies

If you need to modify policies later:

1. Create a new migration file (e.g., `003_update_rls_policies.sql`)
2. Drop the old policy and create a new one:
   ```sql
   DROP POLICY "old_policy_name" ON table_name;
   CREATE POLICY "new_policy_name" ON table_name
   FOR SELECT
   USING (new_conditions);
   ```

## ✅ Post-Deployment Checklist

- [ ] Run `002_rls_policies.sql` migration
- [ ] Verify RLS enabled on all 13 tables
- [ ] Verify ~77 policies created
- [ ] Set first admin user manually
- [ ] Test student profile read/update
- [ ] Test parent-child linking
- [ ] Test tutor subject creation
- [ ] Test session booking
- [ ] Test rating submission
- [ ] Verify backend can write to payments (service role)
- [ ] Verify tutor can see earnings/balance
- [ ] Test payout request creation
- [ ] Monitor for RLS errors in logs

## 📞 Need Help?

If you encounter issues:

1. Check Supabase logs: Dashboard → Logs → Postgres
2. Review the specific policy causing issues
3. Test the policy condition manually in SQL editor
4. Ensure you're using the correct auth context (user token vs service role)

---

**Migration File**: `migrations/002_rls_policies.sql`  
**Total Policies**: 77  
**Helper Functions**: 3  
**Estimated Application Time**: 5-10 minutes  
**Breaking Changes**: None (all tables already exist)












