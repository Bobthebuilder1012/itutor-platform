# Settings Implementation Summary

## Overview
Added comprehensive settings pages for all user roles (student, tutor, parent) with the following features:
- **Username** (MANDATORY, unique) - e.g., "joshua_solomon_314"
- **Display Name** (OPTIONAL) - e.g., "Joshua Solomon" (falls back to username if not provided)
- Edit email (required)
- Edit school/institution (optional for students/tutors)
- Edit country (required)
- Edit subjects (students only - also available via quick edit on dashboard)
- Change password

## Username vs Display Name Logic

### Username
- **MANDATORY**: Must be provided during signup
- **UNIQUE**: No two users can have the same username
- **Format**: Letters, numbers, underscore, hyphen only (e.g., `joshua_solomon_314`)
- **Purpose**: Unique identifier for the user on the platform

### Display Name
- **OPTIONAL**: Can be left empty
- **NOT UNIQUE**: Multiple users can have the same display name
- **Format**: Any characters allowed (e.g., `Joshua Solomon`)
- **Fallback**: If not provided, the username is shown as the display name
- **Purpose**: A friendly name shown throughout the app

### Display Name Helper Function
Created `lib/utils/displayName.ts` with `getDisplayName()` function:
- Returns `display_name` if set
- Falls back to `username` if `display_name` is null/empty
- Falls back to `full_name` if both are missing (for backward compatibility)
- Returns `'User'` as final fallback

## Database Changes

### SQL Migration: `ADD_USERNAME_DISPLAYNAME.sql`
```sql
-- USERNAME: Mandatory, unique (e.g., "joshua_solomon_314")
-- DISPLAY_NAME: Optional (e.g., "Joshua Solomon"), falls back to username if not provided

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS username text NOT NULL UNIQUE,
ADD COLUMN IF NOT EXISTS display_name text;
```

**Key Features:**
- Generates usernames for existing users from their email
- Handles duplicate usernames by adding numeric suffixes
- Makes `username` NOT NULL after populating existing rows
- Optionally copies `full_name` to `display_name` for existing users

**To apply**: Run the SQL file in Supabase SQL Editor.

## New Files Created

### Settings Pages
1. **`app/student/settings/page.tsx`**
   - Full profile editing for students
   - Username (required, unique)
   - Display name (optional, falls back to username)
   - Includes subjects management with `SubjectMultiSelect`
   - Password change functionality

2. **`app/tutor/settings/page.tsx`**
   - Full profile editing for tutors
   - Username (required, unique)
   - Display name (optional, falls back to username)
   - Note directing tutors to dashboard for subject management
   - Password change functionality

3. **`app/parent/settings/page.tsx`**
   - Full profile editing for parents
   - Username (required, unique)
   - Display name (optional, falls back to username)
   - Password change functionality

### Components
4. **`components/student/EditSubjectsModal.tsx`**
   - Quick edit modal for students to update subjects
   - Used on student dashboard for immediate access

### Utilities
5. **`lib/utils/displayName.ts`**
   - `getDisplayName()` function for consistent name display
   - Returns display_name if set, otherwise username
   - Used throughout all dashboard and settings pages

## Modified Files

### Navigation
- **`components/DashboardLayout.tsx`**
  - Added Settings link to all role navigations (student, tutor, parent)

### Dashboards
- **`app/student/dashboard/page.tsx`**
  - Added "Edit My Subjects" button below profile header
  - Integrated `EditSubjectsModal` for quick subject editing
  - Uses `getDisplayName()` for user name display

- **`app/tutor/dashboard/page.tsx`**
  - Uses `getDisplayName()` for user name display

- **`app/parent/dashboard/page.tsx`**
  - Uses `getDisplayName()` for user name display

## Validation Rules

### Username Validation
- **Required**: Cannot be empty
- **Format**: `/^[a-zA-Z0-9_-]+$/` (letters, numbers, underscore, hyphen only)
- **Unique**: Checked by database constraint
- **Error Messages**:
  - "Username is required" - if empty
  - "Username can only contain letters, numbers, underscores, and hyphens" - if format invalid
  - "This username is already taken" - if duplicate (error code 23505)

### Display Name Validation
- **Optional**: Can be empty or null
- **No format restrictions**: Any characters allowed
- **Trimmed**: Leading/trailing spaces removed before saving
- **Stored as null**: If empty after trimming

## Usage Flow

### For Students
1. **Full Settings**: Navigate to Settings from sidebar
   - Edit username, display name, email, school, country, subjects, password
2. **Quick Subject Edit**: Click "Edit My Subjects" on dashboard
   - Fast access to update subjects without going to Settings

### For Tutors
1. **Profile Settings**: Navigate to Settings from sidebar
   - Edit username, display name, email, school, country, password
2. **Subject Management**: Go to dashboard to add/edit/remove subjects

### For Parents
1. **Profile Settings**: Navigate to Settings from sidebar
   - Edit username, display name, email, country, password

## Display Name Throughout the App

All pages now use `getDisplayName(profile)` to show user names:
- **Student Dashboard**: Shows display name or username
- **Tutor Dashboard**: Shows display name or username
- **Parent Dashboard**: Shows display name or username
- **Settings Pages**: Shows display name or username in header
- **All navigation**: Uses display name or username

## Example Scenario

**User Signup:**
- Username: `joshua_solomon_314` (required, unique)
- Display Name: `Joshua Solomon` (optional)

**Display Behavior:**
- If display name is set: Shows "Joshua Solomon" everywhere
- If display name is NOT set: Shows "joshua_solomon_314" everywhere
- User can update display name anytime in Settings

## Next Steps

### Immediate Actions
1. ✅ Run `ADD_USERNAME_DISPLAYNAME.sql` in Supabase
2. ✅ Test settings pages for all roles
3. ✅ Verify display name fallback logic

### Pending Tasks
1. Update signup flows to collect username (mandatory) and display_name (optional)
2. Add username validation during signup (check uniqueness)
3. Show both username and display name in tutor search results
4. Add @username mentions in chat/messaging features (future)
5. Create profile URLs using username (e.g., `/tutors/@joshua_solomon_314`)

## Technical Notes

- Username is stored in lowercase automatically via `toLowerCase()` in input handlers
- Display name preserves original case (e.g., "Joshua Solomon")
- Both fields are trimmed before saving to prevent whitespace issues
- Database has check constraints to prevent empty strings
- Unique constraint on username prevents duplicates at database level
- The migration handles existing users gracefully by generating usernames from emails
