# How to Add Subjects as a Tutor

## Issue
You're seeing "No subjects found. Please add subjects to your profile first." when trying to send a lesson offer.

## Solution - Use the Dashboard (Recommended)

### Option 1: Through the Dashboard UI
1. Go to your **Tutor Dashboard** (`/tutor/dashboard`)
2. Look for the **"Subjects I Teach"** section
3. Click the **"+ Add Subject"** button
4. Select a subject from the dropdown
5. Enter your hourly rate
6. Click **"Add Subject"**
7. Repeat to add more subjects

### Option 2: Using SQL (Quick Test Method)

If you need to quickly add subjects for testing, run this SQL in Supabase:

```sql
-- Replace the email with your tutor account email
DO $$
DECLARE
  tutor_user_id UUID;
  math_subject_id UUID;
BEGIN
  -- Get tutor ID from email
  SELECT p.id INTO tutor_user_id
  FROM public.profiles p
  JOIN auth.users u ON p.id = u.id
  WHERE u.email = 'your-tutor-email@example.com';  -- ⬅️ CHANGE THIS
  
  -- Get a subject ID (CSEC Mathematics example)
  SELECT id INTO math_subject_id
  FROM public.subjects
  WHERE label ILIKE '%mathematics%'
  LIMIT 1;
  
  -- Add the subject
  INSERT INTO public.tutor_subjects (tutor_id, subject_id, hourly_rate, is_active)
  VALUES (tutor_user_id, math_subject_id, 50.00, true)
  ON CONFLICT (tutor_id, subject_id) DO NOTHING;
  
  RAISE NOTICE 'Subject added successfully!';
END $$;
```

## After Adding Subjects

1. Refresh the page or close and reopen the "Send Lesson Offer" modal
2. You should now see your subjects in the dropdown
3. Select a subject, date, time, and duration
4. Click "Send Offer"

## Why This Happens

Tutors must have subjects added to their profile before they can send lesson offers. This ensures:
- Students know what subjects you teach
- Offers are always linked to specific subjects
- Your hourly rate is properly set for each subject













