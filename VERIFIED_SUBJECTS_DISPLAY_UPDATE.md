# Verified Subjects Display Update

## Summary
Added verified CXC subjects display directly on tutor profile pages (student and parent views).

## Changes Made

### 1. Student Tutor Profile (`app/student/tutors/[tutorId]/page.tsx`)
- Added state for `verifiedSubjects`, `csecSubjects`, `capeSubjects`
- Added `fetchVerifiedSubjects()` function to load verified subjects from API
- Added **Verified CXC Results** section that displays:
  - Green badge with checkmark icon
  - CSEC subjects with grades, year, and session
  - CAPE subjects with grades, year, and session
  - Grouped by exam type (CSEC/CAPE)
  - Shows subject count badges
  - Disclaimer footer

### 2. Parent Tutor Profile (`app/parent/tutors/[tutorId]/page.tsx`)
- Same changes as student view
- Consistent styling and layout

## Display Logic
- **Only shows if:**
  1. Tutor has `tutor_verification_status = 'VERIFIED'`
  2. Tutor has at least one verified subject with `is_public = true`
- Subjects are automatically grouped by exam type (CSEC/CAPE)
- Each subject card shows:
  - Subject name
  - Grade (with star icon)
  - Year (optional)
  - Session (optional, e.g., "January", "June")

## Tutor Control
Tutors can control visibility of their verified subjects:
- Go to `/tutor/verification/manage-subjects`
- Toggle individual subjects on/off
- When toggled off, subjects are hidden from public view
- When toggled on, subjects appear on their profile

## API Endpoint Used
- `GET /api/public/tutors/[tutorId]/verified-subjects`
- Returns only subjects where `is_public = true`
- Automatically groups by exam type

## Styling
- Green gradient background with green border
- White subject cards with hover effects
- Responsive grid layout (1 column mobile, 2 columns desktop)
- Consistent with existing design system

## Next Steps
1. **Run migration 037** to allow tutors to update file_path: `src/supabase/migrations/037_allow_tutor_update_file_path.sql`
2. **Test the flow:**
   - Admin approves a verification request
   - Check that tutor's profile shows `VERIFIED` badge
   - Check that verified subjects appear on profile
   - Tutor can toggle visibility in manage-subjects page
3. **Verify RLS policies** are working correctly for public access












