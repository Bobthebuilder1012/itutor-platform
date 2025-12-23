# iTutor Row-Level Security (RLS) Policies

This document outlines the access control policies for all tables in the iTutor platform. These policies ensure that users can only access data they're authorized to see and modify.

## Security Principles

1. **Users own their own data**: Users can read/update their own profile
2. **Parents manage children**: Parents can view and manage their linked children's data
3. **Session participants have access**: Students, tutors, and payers can view sessions they're involved in
4. **Backend controls money**: Payment-related writes happen via backend service key only
5. **Admins see everything**: Admin role has full access across all tables

---

## Table-by-Table RLS Policies

### 1. profiles

**Enable RLS**: Yes

**SELECT (Read)**:
- Users can read their own profile (`id = auth.uid()`)
- Parents can read profiles of their linked children (via `parent_child_links`)
- Tutors can read basic student profiles when they have an active or past session together
- Public can read limited tutor profile fields (name, rating, subjects) for browsing/matching
- Admins can read all profiles

**INSERT (Create)**:
- Any authenticated user can create their own profile during signup (`id = auth.uid()`)
- Admins can create any profile

**UPDATE (Modify)**:
- Users can update their own profile (`id = auth.uid()`)
- Parents can update their children's profiles (limited fields only)
- Tutors CANNOT update `rating_average` or `rating_count` (trigger-maintained)
- Tutors CANNOT edit verified grades
- Admins can update any profile

**DELETE**:
- Users can soft-delete their own account (or hard delete via admin)
- Admins can delete any profile

---

### 2. parent_child_links

**Enable RLS**: Yes

**SELECT (Read)**:
- Parents can read rows where `parent_id = auth.uid()`
- Children can read rows where `child_id = auth.uid()` (to see who their parent is)
- Admins can read all

**INSERT (Create)**:
- Parents can create links where `parent_id = auth.uid()`
- Backend service can create links (for parent-initiated child account creation)
- Admins can create any link

**UPDATE (Modify)**:
- No updates allowed (immutable relationship; delete and recreate if needed)

**DELETE**:
- Parents can delete links where `parent_id = auth.uid()`
- Admins can delete any link

---

### 3. subjects

**Enable RLS**: Yes

**SELECT (Read)**:
- Public read access (all authenticated users can browse subjects for matching)

**INSERT (Create)**:
- Admins only (subjects are seed data)

**UPDATE (Modify)**:
- Admins only

**DELETE**:
- Admins only (with restriction if subject is referenced in sessions)

---

### 4. tutor_subjects

**Enable RLS**: Yes

**SELECT (Read)**:
- Public read access (for browsing tutors and their rates)
- Tutors can read their own entries (`tutor_id = auth.uid()`)

**INSERT (Create)**:
- Tutors can create rows where `tutor_id = auth.uid()`
- Admins can create any row

**UPDATE (Modify)**:
- Tutors can update their own rows (`tutor_id = auth.uid()`) - pricing, mode
- Admins can update any row

**DELETE**:
- Tutors can delete their own rows (`tutor_id = auth.uid()`)
- Admins can delete any row

---

### 5. tutor_verifications

**Enable RLS**: Yes

**SELECT (Read)**:
- Tutors can read their own verification records (`tutor_id = auth.uid()`)
- Admins can read all

**INSERT (Create)**:
- Tutors can create verification records where `tutor_id = auth.uid()`
- Admins can create any record

**UPDATE (Modify)**:
- Tutors CANNOT update (once submitted, it's locked)
- Admins can update status, verified_at, verified_by, notes

**DELETE**:
- Tutors CANNOT delete
- Admins can delete

---

### 6. tutor_verified_subject_grades

**Enable RLS**: Yes

**SELECT (Read)**:
- Tutors can read their own grades (`tutor_id = auth.uid()`)
- Public can read grades where `display = true` (for trust/transparency)
- Admins can read all

**INSERT (Create)**:
- Backend service only (created during verification approval process)
- Admins can create (manual verification)

**UPDATE (Modify)**:
- Tutors can ONLY toggle the `display` field (`tutor_id = auth.uid()`)
- Tutors CANNOT modify `subject_name`, `grade`, `exam_type` (immutable)
- Admins can update any field (for corrections)

**DELETE**:
- Tutors CANNOT delete
- Admins can delete (only in case of errors)

---

### 7. sessions

**Enable RLS**: Yes

**SELECT (Read)**:
- Students can read sessions where `student_id = auth.uid()`
- Tutors can read sessions where `tutor_id = auth.uid()`
- Parents can read sessions where `payer_id = auth.uid()` OR where the student is their child (via `parent_child_links`)
- Admins can read all

**INSERT (Create)**:
- Students can create sessions where `student_id = auth.uid()` AND `billing_mode = 'self_allowed'`
- Parents can create sessions where `payer_id = auth.uid()` AND student is their child
- Backend service can create any session
- Admins can create any session

**UPDATE (Modify)**:
- Students can update limited fields (e.g., cancellation before start time)
- Tutors can update `status` to 'in_progress', 'completed', or 'cancelled' for their sessions
- Tutors CANNOT update `payment_status` (backend-only)
- Payers can cancel sessions before scheduled_start
- Backend service can update `payment_status` and related fields
- Admins can update any field

**DELETE**:
- Sessions should NOT be deleted (soft delete via status = 'cancelled')
- Admins can delete (extreme cases only)

---

### 8. ratings

**Enable RLS**: Yes

**SELECT (Read)**:
- Students can read ratings they wrote (`student_id = auth.uid()`)
- Parents can read ratings for their children's sessions
- Tutors can read ratings about themselves (`tutor_id = auth.uid()`)
- Public can read ratings for tutors (for transparency, but maybe with student identity hidden)
- Admins can read all

**INSERT (Create)**:
- Students can insert ratings where:
  - `student_id = auth.uid()`
  - The session exists and `session.status = 'completed'`
  - The student is a participant in that session
  - No rating exists for that session yet (enforced by unique constraint)
- Backend service can create ratings
- Admins can create ratings

**UPDATE (Modify)**:
- Students can update their own ratings within a time window (e.g., 7 days after session)
- Admins can update any rating

**DELETE**:
- Students CANNOT delete ratings (immutable after time window)
- Admins can delete (in case of abuse)

---

### 9. payments

**Enable RLS**: Yes

**SELECT (Read)**:
- Payers can read payments where `payer_id = auth.uid()`
- Tutors can read payments where `tutor_id = auth.uid()` (to see payment confirmation)
- Parents can read payments where `payer_id = auth.uid()` OR for their children's sessions
- Admins can read all

**INSERT (Create)**:
- Backend service ONLY (via service key after gateway confirmation)
- Admins can insert (manual/test payments)

**UPDATE (Modify)**:
- Backend service ONLY (to update status, confirmed_at)
- Admins can update

**DELETE**:
- No deletes allowed (immutable financial record)
- Admins can delete only in extreme cases (e.g., test data)

---

### 10. tutor_earnings

**Enable RLS**: Yes

**SELECT (Read)**:
- Tutors can read earnings where `tutor_id = auth.uid()`
- Admins can read all

**INSERT (Create)**:
- Backend service ONLY (automatically created when payment status = SUCCESS)
- Admins can insert (manual adjustments)

**UPDATE (Modify)**:
- Backend service ONLY (to update status to 'REVERSED' if needed)
- Admins can update

**DELETE**:
- No deletes allowed (immutable financial ledger)
- Admins can delete only in extreme cases

---

### 11. tutor_balances

**Enable RLS**: Yes

**SELECT (Read)**:
- Tutors can read their own balance (`tutor_id = auth.uid()`)
- Admins can read all

**INSERT (Create)**:
- Backend service ONLY (created when tutor first earns money)
- Admins can insert

**UPDATE (Modify)**:
- Backend service ONLY (to update available_ttd, pending_ttd, last_updated)
- Admins can update (manual adjustments with audit trail)

**DELETE**:
- No deletes allowed
- Admins can delete only when removing tutor account entirely

---

### 12. commission_ledger

**Enable RLS**: Yes

**SELECT (Read)**:
- Admins ONLY (platform revenue data)

**INSERT (Create)**:
- Backend service ONLY (automatically created with each tutor_earnings entry)
- Admins can insert

**UPDATE (Modify)**:
- Backend service can update notes
- Admins can update

**DELETE**:
- No deletes allowed (immutable financial record)
- Admins can delete only in extreme cases

---

### 13. payout_requests

**Enable RLS**: Yes

**SELECT (Read)**:
- Tutors can read their own payout requests (`tutor_id = auth.uid()`)
- Admins can read all

**INSERT (Create)**:
- Tutors can create payout requests where:
  - `tutor_id = auth.uid()`
  - `amount_requested_ttd <= tutor_balances.available_ttd`
  - `status = 'PENDING'`
- Admins can create (manual payouts)

**UPDATE (Modify)**:
- Tutors CANNOT update once submitted
- Admins can update `status`, `approved_by`, `approved_at`, `paid_at`, `admin_notes`

**DELETE**:
- Tutors can delete their own PENDING requests (before admin review)
- Admins can delete any request

---

## Special Considerations

### Backend Service Key Operations

The following operations should ONLY happen via Supabase service key (server-side):

1. **Writing to `payments`**: After gateway webhook/callback confirmation
2. **Creating `tutor_earnings`**: Automatically when payment succeeds
3. **Updating `tutor_balances`**: When earnings are added or payouts are completed
4. **Writing to `commission_ledger`**: Platform commission tracking
5. **Updating session `payment_status`**: Only backend can confirm payment

### Public Access (Unauthenticated)

For the MVP, we may allow limited public read access to:
- Tutor profiles (name, rating, subjects, verified grades with display=true)
- Subjects (for browsing before signup)

This can be implemented via:
- Anonymous RLS policies OR
- Public API endpoints that use service key with controlled filtering

### Admin Role Detection

Admin access policies assume a helper function:
```sql
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;
```

### Parent-Child Access Helper

For parent access to children's data:
```sql
CREATE OR REPLACE FUNCTION is_parent_of(child_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM parent_child_links
    WHERE parent_id = auth.uid() AND child_id = child_uuid
  );
$$ LANGUAGE sql SECURITY DEFINER;
```

---

## Implementation Notes

1. **Enable RLS on all tables**: `ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;`
2. **Create helper functions first**: Admin check, parent-child check
3. **Write policies incrementally**: Start with SELECT, then INSERT/UPDATE/DELETE
4. **Test with different roles**: Use Supabase test users with different profiles
5. **Use service key for backend**: Never expose service key to client
6. **Log policy violations**: Monitor RLS failures for security insights

---

## Next Steps

After implementing these English-language policies:

1. Convert each policy to SQL `CREATE POLICY` statements
2. Test each policy with role-specific test users
3. Add policies to migration file (or separate RLS migration)
4. Document any deviations or special cases
5. Set up monitoring for unauthorized access attempts




