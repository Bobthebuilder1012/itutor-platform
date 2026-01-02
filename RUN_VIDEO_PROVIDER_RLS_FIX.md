# Fix Video Provider Connections RLS Policies

## Problem
Getting 406 (Not Acceptable) errors when trying to read from `tutor_video_provider_connections` table.

## Cause
The table exists but doesn't have Row Level Security (RLS) policies, so users can't read their own data.

## Solution
Run the SQL script to add RLS policies.

## Steps to Fix:

### 1. Open Supabase SQL Editor
1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in the left sidebar
4. Click **New query**

### 2. Run the SQL Script
1. Copy ALL the contents from `FIX_VIDEO_PROVIDER_RLS.sql`
2. Paste into the SQL editor
3. Click **Run** (or press Ctrl+Enter / Cmd+Enter)

### 3. Verify Success
You should see output showing the policies were created:

```
schemaname | tablename                          | policyname
-----------|------------------------------------|----------------------------------
public     | tutor_video_provider_connections   | Service role has full access...
public     | tutor_video_provider_connections   | Tutors can insert their own...
public     | tutor_video_provider_connections   | Tutors can update their own...
public     | tutor_video_provider_connections   | Tutors can view their own...
```

### 4. Test
1. **Refresh your browser** (important!)
2. Go to `/tutor/video-setup`
3. The 406 errors should be gone
4. You should see "Not Connected" or your connection status

## What These Policies Do:

- ✅ **Tutors can view** their own video provider connections
- ✅ **Tutors can insert** their own connections
- ✅ **Tutors can update** their own connections (to switch providers)
- ✅ **Service role** (OAuth callbacks) can do everything

## Security
- Each tutor can ONLY see/edit their own connections
- Students/Parents cannot access this table
- Encrypted tokens remain secure




