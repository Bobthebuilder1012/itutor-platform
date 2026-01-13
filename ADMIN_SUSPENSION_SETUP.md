# Admin Account Management & Suspension System

## 🚨 Quick Setup Instructions

### Step 1: Run the Migration SQL

Open your **Supabase SQL Editor** and run the script in `RUN_THESE_MIGRATIONS.sql` (in the root of your project).

This will:
- ✅ Add suspension fields to the profiles table
- ✅ Fix RLS policies so admins with `is_reviewer=true` can see all accounts
- ✅ Allow admins to suspend and unsuspend accounts

### Step 2: Verify the Migration

After running the SQL, verify it worked by running this in the SQL editor:

```sql
-- Check suspension columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name LIKE '%suspend%';

-- Check the function exists
SELECT proname FROM pg_proc WHERE proname = 'is_admin_or_reviewer';

-- Check you can see all profiles
SELECT role, COUNT(*) as count 
FROM profiles 
GROUP BY role;
```

You should see:
- 6 suspension-related columns
- The `is_admin_or_reviewer` function
- A count of students, parents, and tutors

### Step 3: Test the System

1. **View All Accounts**: Go to `/reviewer/accounts` and you should now see:
   - All student accounts
   - All parent accounts
   - All tutor accounts

2. **Suspend a User**:
   - Click "View Details" on any account
   - Click "Suspend Account"
   - Enter a reason (e.g., "Testing suspension system")
   - Confirm
   - The status should immediately update to "Suspended"

3. **Verify Suspension Enforcement**:
   - Log out of your admin account
   - Log in as the suspended user
   - They should be redirected to `/suspended` page
   - They cannot access any dashboard pages

4. **Unsuspend a User**:
   - Log back in as admin
   - Go to the suspended user's detail page
   - Click "Lift Suspension"
   - The status should update to "Active"

5. **Verify Unsuspension**:
   - Log in as the previously suspended user
   - They should now have full access again

---

## 📋 What Was Fixed

### Issue 1: Admins couldn't see parent accounts
**Problem**: RLS policy only checked for `role = 'admin'`, but your admin account has `is_reviewer = true`

**Solution**: Created new `is_admin_or_reviewer()` function that checks both conditions

### Issue 2: Suspended users could still log in
**Problem**: Suspension was recorded but not enforced

**Solution**: 
- Created `useSuspensionCheck` hook in `DashboardLayout`
- Created `/suspended` page to display to blocked users
- All dashboard pages now redirect suspended users

### Issue 3: Suspension status not showing in admin interface
**Problem**: Suspension fields weren't in the database or API query

**Solution**:
- Added 6 suspension fields to `profiles` table
- Updated all admin APIs to fetch and display suspension data
- Frontend shows suspension badge and status

---

## 🔧 Technical Details

### Database Fields Added
- `is_suspended` - Boolean flag
- `suspension_reason` - Text explanation
- `suspended_at` - Timestamp when suspended
- `suspended_by` - UUID of admin who suspended
- `suspension_lifted_at` - Timestamp when unsuspended
- `suspension_lifted_by` - UUID of admin who unsuspended

### API Endpoints
- `GET /api/admin/accounts` - List all accounts with filters
- `GET /api/admin/accounts/[userId]` - Get detailed account info
- `POST /api/admin/accounts/[userId]/suspend` - Suspend an account
- `POST /api/admin/accounts/[userId]/unsuspend` - Unsuspend an account

### Frontend Pages
- `/reviewer/accounts` - List all accounts with filters
- `/reviewer/accounts/[userId]` - View/manage single account
- `/suspended` - Page shown to suspended users

---

## ✅ Expected Behavior After Setup

1. **Admin Dashboard**: Shows all accounts (students, parents, tutors)
2. **Filter Options**: Filter by role, suspension status, and search
3. **Suspension Action**: 
   - Admin clicks "Suspend Account"
   - Enters a reason
   - User is immediately suspended
   - Status badge changes to "Suspended" (red)
4. **Suspended User Experience**:
   - Cannot access dashboard
   - Redirected to `/suspended` page
   - Sees suspension reason and date
   - Can only log out
5. **Unsuspension Action**:
   - Admin clicks "Lift Suspension"
   - User can immediately log in again
   - Full access restored

---

## 🐛 Troubleshooting

### Problem: Still can't see parent accounts
**Check**: Run this SQL to verify the RLS policy exists:
```sql
SELECT * FROM pg_policies WHERE tablename = 'profiles' AND policyname LIKE '%reviewer%';
```

**Fix**: Re-run the migration SQL

### Problem: Suspended users can still log in
**Check**: Make sure `DashboardLayout.tsx` is using the `useSuspensionCheck` hook

**Fix**: The code is already updated, just make sure your server restarted

### Problem: API returns 500 error
**Check**: Look at the terminal logs for the actual error

**Common causes**:
- Migration not run (suspension columns don't exist)
- RLS policy not updated (admin can't read profiles)

---

## 📁 Files Modified

### Database Migrations
- `src/supabase/migrations/040_add_account_suspension_fields.sql`
- `src/supabase/migrations/041_fix_admin_rls_for_reviewers.sql`
- `RUN_THESE_MIGRATIONS.sql` (combined script to run)

### API Routes
- `app/api/admin/accounts/route.ts` (list accounts)
- `app/api/admin/accounts/[userId]/route.ts` (get account)
- `app/api/admin/accounts/[userId]/suspend/route.ts` (suspend)
- `app/api/admin/accounts/[userId]/unsuspend/route.ts` (unsuspend)

### Frontend Components
- `app/reviewer/accounts/page.tsx` (accounts list)
- `app/reviewer/accounts/[userId]/page.tsx` (account detail)
- `app/suspended/page.tsx` (suspended user page)
- `components/DashboardLayout.tsx` (added suspension check)
- `lib/hooks/useSuspensionCheck.ts` (new hook)

### Type Definitions
- `lib/types/database.ts` (added suspension fields to Profile interface)












