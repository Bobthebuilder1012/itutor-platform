# Set Up Avatar Storage - UI Method

## Step 1: Create the Storage Bucket

1. **Go to your Supabase Dashboard**
2. **Click on "Storage"** in the left sidebar
3. **Click "Create a new bucket"** button (or "New Bucket")
4. **Fill in the details:**
   - Bucket name: `avatars`
   - Public bucket: ✅ **Check this box** (IMPORTANT!)
   - File size limit: Leave default (or set to 5MB)
   - Allowed MIME types: Leave empty (or add: image/jpeg, image/png, image/webp)
5. **Click "Create bucket"**

## Step 2: Set Up Storage Policies

After creating the bucket, you need to add policies:

### Method A: Using Policy Templates (Easier)

1. **Stay in Storage section**
2. **Click on "Policies"** tab at the top
3. **Find the "objects in avatars" section**
4. **Click "New Policy"**

#### Policy 1: Public Read Access
1. Click "New Policy"
2. Select template: **"Give public access to a folder"**
3. Or click **"Create a new policy"** and fill in:
   - Policy name: `Public avatar access`
   - Allowed operations: ✅ **SELECT** (read)
   - Target roles: `public`
   - USING expression:
     ```sql
     bucket_id = 'avatars'
     ```
4. Click **"Review"** then **"Save policy"**

#### Policy 2: Users Can Upload/Update/Delete Their Own Avatars
1. Click "New Policy" again
2. Select template: **"Give users access to own folder"**
3. Or click **"Create a new policy"** and fill in:
   - Policy name: `Users own avatar CRUD`
   - Allowed operations: ✅ **INSERT**, ✅ **UPDATE**, ✅ **DELETE**
   - Target roles: `authenticated`
   - USING expression:
     ```sql
     (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text)
     ```
   - WITH CHECK expression (same as above):
     ```sql
     (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text)
     ```
4. Click **"Review"** then **"Save policy"**

### Method B: Manual Policy Creation (If templates don't work)

If you need to create policies manually:

#### For SELECT (Read):
```
Policy name: Avatar images are publicly accessible
Operations: SELECT
Target roles: public
USING: bucket_id = 'avatars'
```

#### For INSERT (Upload):
```
Policy name: Users can upload their own avatar
Operations: INSERT
Target roles: authenticated
WITH CHECK: bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
```

#### For UPDATE:
```
Policy name: Users can update their own avatar
Operations: UPDATE
Target roles: authenticated
USING: bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
WITH CHECK: bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
```

#### For DELETE:
```
Policy name: Users can delete their own avatar
Operations: DELETE
Target roles: authenticated
USING: bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text
```

## Step 3: Verify Setup

1. **Go to Storage > avatars bucket**
2. **Click "Policies" tab**
3. **You should see 4 policies total:**
   - ✅ Public read access (SELECT)
   - ✅ Authenticated users can INSERT
   - ✅ Authenticated users can UPDATE
   - ✅ Authenticated users can DELETE

## Step 4: Test It

1. **Go back to your iTutor app**
2. **Hard refresh the browser** (Ctrl+Shift+R or Cmd+Shift+R)
3. **Click on your profile picture**
4. **Try uploading an avatar**
5. **It should work now!** 🎉

## Troubleshooting

### "Bucket already exists" error
- That's fine! The bucket was already created
- Just skip to Step 2 (policies)

### Can't find "Create policy" button
- Make sure you're on the **Policies** tab
- Look for a section called **"Other policies under storage.objects"** or **"objects in avatars"**
- Click **"New Policy"** button

### Policies aren't showing up
- Refresh the Supabase Dashboard page
- Make sure you selected the correct project

### Still getting errors when uploading
1. **Check browser console** for specific error message
2. **Verify the bucket is set to Public** (go to Storage > avatars > Settings)
3. **Double-check all 4 policies are created** and enabled
4. **Hard refresh your browser** (Ctrl+Shift+R)

## Quick Visual Checklist

After setup, your Storage section should look like:

```
📦 Storage
  └── 📁 avatars (Public)
      ├── 📜 Policies (4 total)
      │   ├── ✅ Avatar images are publicly accessible (SELECT)
      │   ├── ✅ Users can upload their own avatar (INSERT)
      │   ├── ✅ Users can update their own avatar (UPDATE)
      │   └── ✅ Users can delete their own avatar (DELETE)
      └── 📁 Files (will show user folders after uploads)
```

---

**Still having issues?** Check `AVATAR_UPLOAD_TROUBLESHOOTING.md` for more detailed help.







