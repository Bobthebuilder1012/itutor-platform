# Setup Verification Storage Bucket Policies

## Overview

Storage bucket RLS policies must be created through the **Supabase Dashboard** (not SQL editor) due to permission restrictions.

## Step 1: Create Bucket (via SQL)

Run `SETUP_VERIFICATION_STORAGE.sql` in the SQL editor. This creates the bucket.

## Step 2: Add RLS Policies (via Dashboard)

Go to: **Storage** → **verification_uploads** → **Policies** → **New Policy**

### Policy 1: Tutors Can Upload
- **Policy Name**: `Tutors can upload verification files`
- **Allowed Operation**: `INSERT`
- **Target Roles**: `authenticated`
- **Policy Definition (WITH CHECK)**:
```sql
bucket_id = 'verification_uploads' 
AND (storage.foldername(name))[1] = auth.uid()::text
```

### Policy 2: Reviewers Can Read All Files
- **Policy Name**: `Reviewers can read all verification files`
- **Allowed Operation**: `SELECT`
- **Target Roles**: `authenticated`
- **Policy Definition (USING)**:
```sql
bucket_id = 'verification_uploads'
AND EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE id = auth.uid() AND is_reviewer = true
)
```

### Policy 3: Tutors Can Read Own Files
- **Policy Name**: `Tutors can read own verification files`
- **Allowed Operation**: `SELECT`
- **Target Roles**: `authenticated`
- **Policy Definition (USING)**:
```sql
bucket_id = 'verification_uploads'
AND (storage.foldername(name))[1] = auth.uid()::text
```

### Policy 4: Tutors Can Update Own Files
- **Policy Name**: `Tutors can update own verification files`
- **Allowed Operation**: `UPDATE`
- **Target Roles**: `authenticated`
- **Policy Definition (USING)**:
```sql
bucket_id = 'verification_uploads'
AND (storage.foldername(name))[1] = auth.uid()::text
```

### Policy 5: Tutors Can Delete Own Files
- **Policy Name**: `Tutors can delete own verification files`
- **Allowed Operation**: `DELETE`
- **Target Roles**: `authenticated`
- **Policy Definition (USING)**:
```sql
bucket_id = 'verification_uploads'
AND (storage.foldername(name))[1] = auth.uid()::text
```

## Alternative: Use Supabase Dashboard Wizard

1. Go to **Storage** → **verification_uploads** → **Policies**
2. Click **New Policy**
3. Choose a template:
   - "Users can upload to own folder" (modify for tutors)
   - "Users can read own files" (for tutors)
   - Custom policy for reviewers

## Path Structure

Files should be uploaded with this path structure:
```
verification_uploads/<tutor_id>/<request_id>/<filename>
```

Example:
```
verification_uploads/a1b2c3d4-1234-5678-9abc-def012345678/e5f6g7h8-8765-4321-ijkl-mnop98765432/csec_results.pdf
```

## Testing Policies

After creating policies, test:

1. **Tutor Upload**: Tutor should be able to upload to their own folder
2. **Tutor Read**: Tutor should be able to read their own files
3. **Reviewer Read**: Reviewer should be able to read ALL files
4. **Tutor Cannot Read Others**: Tutor should NOT be able to read other tutors' files

## Troubleshooting

If uploads fail with RLS errors:
1. Check that bucket is created and public = false
2. Verify policies are enabled
3. Check policy target roles match (authenticated)
4. Ensure path structure matches policy expectations

For reviewer access issues:
- Verify `profiles.is_reviewer = true` for reviewer account
- Check policy includes the profiles table EXISTS clause

---

**Note**: Service role (used by backend APIs) automatically bypasses RLS, so backend processing will work regardless of policies.




