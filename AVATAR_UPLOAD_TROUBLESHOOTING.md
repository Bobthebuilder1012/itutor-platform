# Avatar Upload Troubleshooting Guide

## Issue: Profile Picture Upload Not Working

### Quick Fix Steps:

#### 1. **Run the Storage Setup SQL**
1. Open your Supabase Dashboard
2. Go to SQL Editor
3. Open and run `SETUP_AVATAR_STORAGE.sql`
4. Verify it says "Success" after running

#### 2. **Check Browser Console for Errors**
1. Open browser DevTools (F12)
2. Go to Console tab
3. Try uploading an avatar
4. Look for any error messages that say:
   - "Bucket not found"
   - "Policy violation"
   - "Storage error"
   - "Failed to upload"

#### 3. **Common Issues & Solutions**

##### Issue A: "Bucket not found" or "The resource was not found"
**Solution:** The avatars bucket doesn't exist
- Run `SETUP_AVATAR_STORAGE.sql` in Supabase SQL Editor
- Or manually create it in Supabase Dashboard > Storage > Create bucket
  - Name: `avatars`
  - Public: ✅ (checked)

##### Issue B: "new row violates row-level security policy"
**Solution:** Storage policies are missing or incorrect
- Run `SETUP_AVATAR_STORAGE.sql` to create policies
- Verify policies in Supabase Dashboard > Storage > Policies

##### Issue C: Upload button doesn't do anything
**Solution:** Check these:
1. Make sure you selected an image file (PNG, JPG, WebP)
2. File size should be under 5MB
3. Check browser console for JavaScript errors
4. Make sure you're logged in (check if `profile.id` exists)

##### Issue D: "Failed to update profile"
**Solution:** Database permission issue
- Check if the profiles table allows updates to `avatar_url`
- Verify RLS policies allow users to update their own profile

##### Issue E: Image uploads but doesn't show
**Solution:** Cache or URL issue
1. Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
2. Check if the avatar_url is correct in database
3. Verify the storage bucket is set to public

#### 4. **Manual Verification in Supabase Dashboard**

##### Check if bucket exists:
1. Supabase Dashboard > Storage
2. You should see an "avatars" bucket
3. It should be marked as "Public"

##### Check policies:
1. Supabase Dashboard > Storage > Policies
2. You should see 4 policies for the avatars bucket:
   - ✅ Avatar images are publicly accessible (SELECT)
   - ✅ Users can upload their own avatar (INSERT)
   - ✅ Users can update their own avatar (UPDATE)
   - ✅ Users can delete their own avatar (DELETE)

#### 5. **Test the Upload Process**

1. Click on your avatar/profile picture
2. The modal should open with "Upload Profile Picture"
3. Click "Choose file" or drag & drop an image
4. You should see the cropper interface
5. Adjust zoom and position
6. Click "Upload"
7. It should show "Uploading..." briefly
8. Page should refresh and show new avatar

#### 6. **Check Network Tab**

1. Open DevTools > Network tab
2. Try uploading again
3. Look for requests to:
   - `/storage/v1/object/avatars/...` (should be 200 OK)
   - `/rest/v1/profiles?id=eq...` (should be 200 OK)
4. If any show errors, check the response for details

## Still Having Issues?

If none of the above work, please check:

1. **Environment Variables:**
   - Is `NEXT_PUBLIC_SUPABASE_URL` correct in `.env.local`?
   - Is `NEXT_PUBLIC_SUPABASE_ANON_KEY` correct in `.env.local`?

2. **Restart Development Server:**
   ```bash
   # Stop the server (Ctrl+C)
   # Then restart:
   npm run dev
   ```

3. **Clear Browser Cache:**
   - Hard refresh (Ctrl+Shift+R)
   - Or clear cache completely

4. **Check File Size & Type:**
   - Must be PNG, JPG, JPEG, or WebP
   - Must be under 5MB
   - Try a smaller, simpler image first

5. **Browser Console Errors:**
   - Look for specific error messages
   - They usually indicate exactly what's wrong

## Expected Behavior

✅ **What should happen:**
1. Click avatar → Modal opens
2. Select image → Cropper appears
3. Adjust & click Upload → Shows "Uploading..."
4. Upload completes → Page refreshes
5. New avatar is visible immediately

❌ **What shouldn't happen:**
- Nothing happens when clicking avatar
- Upload button is disabled/greyed out
- Error messages in browser console
- Avatar doesn't change after upload
- Page crashes or freezes







