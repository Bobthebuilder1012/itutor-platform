# Video Provider Switching System

## Overview
When a tutor switches their video provider (e.g., from Google Meet to Zoom or vice versa), all their existing **future scheduled sessions** are automatically updated with new meeting links from the new provider.

## How It Works

### 1. Detection
When a tutor connects a video provider through OAuth:
- **Before saving** the new connection, we check if they had a previous provider
- If the previous provider is different from the new one, we trigger session migration

### 2. Session Migration Process

**File:** `lib/services/migrateSessionsToNewProvider.ts`

The migration function:

1. **Finds Future Sessions**
   - Queries all sessions where:
     - `tutor_id` matches
     - `status` is `SCHEDULED` or `JOIN_OPEN`
     - `scheduled_start_at` is in the future (>= now)

2. **Creates New Meetings**
   - For each session:
     - Fetches the associated booking details
     - Calls the new provider's API to create a meeting
     - Gets new meeting ID and join URL

3. **Updates Sessions**
   - Updates each session with:
     - New `provider` (google_meet or zoom)
     - New `meeting_external_id`
     - New `join_url`
     - New `meeting_created_at` timestamp

4. **Error Handling**
   - Continues migrating even if some sessions fail
   - Logs all errors
   - Returns summary of successful/failed migrations

### 3. OAuth Callbacks

**Files:**
- `app/api/auth/google/callback/route.ts`
- `app/api/auth/zoom/callback/route.ts`

Both callbacks:

1. **Check Previous Provider**
   ```typescript
   const { data: existingConnection } = await supabase
     .from('tutor_video_provider_connections')
     .select('provider')
     .eq('tutor_id', tutorId)
     .single();
   
   const previousProvider = existingConnection?.provider;
   const isSwitchingProvider = previousProvider && previousProvider !== 'google_meet';
   ```

2. **Save New Connection**
   - Upsert the new provider connection
   - Store encrypted OAuth tokens

3. **Trigger Migration** (if switching)
   ```typescript
   if (isSwitchingProvider) {
     const migrationResult = await migrateSessionsToNewProvider(tutorId, 'google_meet');
     // Redirect with migration results
   }
   ```

4. **Redirect with Results**
   - Success: `/tutor/video-setup?success=true&migrated=N`
   - Warning: `/tutor/video-setup?success=true&migration_warning=true`

### 4. User Feedback

**File:** `app/tutor/video-setup/page.tsx`

The video setup page displays different messages based on migration results:

- **Successful Migration:**
  ```
  ✅ Successfully connected video provider!
  🔄 X future sessions were automatically updated with new meeting links.
  ```

- **Migration Warning:**
  ```
  ✅ Successfully connected video provider!
  ⚠️ Some future sessions may need to be manually updated. Please check your sessions page.
  ```

- **No Migration Needed:**
  ```
  Successfully connected video provider!
  ```

## Example Flow

### Scenario: Tutor switches from Zoom to Google Meet

1. **Tutor has 5 future sessions** all using Zoom
2. **Tutor clicks "Switch to Google Meet"** on video-setup page
3. **OAuth flow completes**
4. **System detects switch:** Previous provider = `zoom`, New provider = `google_meet`
5. **Migration starts:**
   - Finds 5 sessions with status SCHEDULED
   - For each session:
     - Creates new Google Meet link via Calendar API
     - Updates session record with new provider and link
6. **Migration completes:** 5/5 sessions migrated
7. **Tutor redirected:** Video setup page shows success message
8. **Result:** All 5 sessions now have Google Meet links instead of Zoom

## Database Schema

### Tables Involved

**`tutor_video_provider_connections`**
- `tutor_id` (unique) - One provider per tutor
- `provider` - 'google_meet' or 'zoom'
- `access_token_encrypted`
- `refresh_token_encrypted`
- etc.

**`sessions`**
- `id`
- `tutor_id`
- `student_id`
- `provider` - Updated during migration
- `meeting_external_id` - Updated during migration
- `join_url` - Updated during migration
- `status` - Only SCHEDULED/JOIN_OPEN sessions are migrated
- `scheduled_start_at` - Used to filter future sessions

**`bookings`**
- Linked to sessions via `booking_id`
- Contains booking details needed for meeting creation

## Key Features

✅ **Automatic** - No manual intervention required
✅ **Safe** - Only migrates future sessions (not past/completed)
✅ **Reliable** - Continues even if some sessions fail
✅ **Transparent** - Clear feedback to users about migration status
✅ **Logged** - Detailed console logs for debugging

## Important Notes

1. **Only Future Sessions**
   - Past or completed sessions are NOT migrated
   - Only sessions with status SCHEDULED or JOIN_OPEN

2. **One Provider at a Time**
   - Each tutor can only have ONE active provider
   - Switching replaces the previous provider

3. **Meeting Links**
   - Old meeting links from previous provider become invalid
   - Students automatically get new links through the sessions system

4. **Error Recovery**
   - If migration fails for some sessions, those sessions remain with old provider
   - Manual intervention may be needed (shown in warning message)

## Testing

To test the switching mechanism:

1. Create a tutor account
2. Connect Google Meet
3. Create some future sessions (accept bookings)
4. Go to video setup and switch to Zoom
5. Check that:
   - Success message mentions migrated sessions
   - Sessions now show Zoom links
   - Students can access new Zoom links

## Future Enhancements

Potential improvements:

1. **Email Notifications** - Notify students when meeting provider changes
2. **Batch Migration Status** - Show progress during migration
3. **Rollback Option** - Allow reverting to previous provider if needed
4. **Migration History** - Log all provider switches for audit trail




