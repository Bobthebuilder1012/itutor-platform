# How to Get FCM_SERVICE_ACCOUNT_JSON Key

## Step-by-Step Guide

### 1. Go to Firebase Console
Visit: https://console.firebase.google.com/

### 2. Select Your Project
Click on your iTutor project (or create one if you haven't)

### 3. Access Project Settings
- Click the ⚙️ gear icon next to "Project Overview" in the left sidebar
- Select "Project settings"

### 4. Go to Service Accounts Tab
- Click on the "Service accounts" tab at the top
- You should see a section titled "Firebase Admin SDK"

### 5. Generate New Private Key
- Click the button "Generate new private key"
- A warning popup will appear
- Click "Generate key" to confirm

### 6. Download the JSON File
- A JSON file will be downloaded to your computer
- The file name will be something like: `itutor-platform-firebase-adminsdk-xxxxx-xxxxxxxxxx.json`

### 7. Copy the JSON Content
- Open the downloaded JSON file in a text editor
- Copy the ENTIRE contents (all the JSON)
- It should look like this:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

### 8. Add to Supabase Edge Function Secrets

#### Option A: Via Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to **Edge Functions** → **Settings** (or Configuration)
3. Find "Secrets" or "Environment Variables" section
4. Add a new secret:
   - **Name**: `FCM_SERVICE_ACCOUNT_JSON`
   - **Value**: Paste the entire JSON content (as one line or formatted)
5. Click "Add Secret" or "Save"

#### Option B: Via Supabase CLI
```bash
supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat path/to/your-service-account.json)"
```

### 9. Verify the Secret is Set
Run this command to list secrets:
```bash
supabase secrets list
```

You should see `FCM_SERVICE_ACCOUNT_JSON` in the list.

### 10. Redeploy Edge Function (if already deployed)
If you already deployed the `session-reminder-10-min` function, redeploy it to use the new secret:
```bash
supabase functions deploy session-reminder-10-min
```

---

## Important Notes

⚠️ **SECURITY WARNING**: 
- **NEVER** commit this JSON file to GitHub
- **NEVER** expose it in client-side code
- Only use it in server-side/Edge Functions
- Keep the file secure and backed up

✅ **What this key does**:
- Allows the server to send push notifications via Firebase Cloud Messaging (FCM)
- Used ONLY in Supabase Edge Functions (server-side)
- Different from the client-side Firebase config (NEXT_PUBLIC_FIREBASE_* variables)

---

## Troubleshooting

### "Firebase project not found"
- Make sure you selected the correct project in Firebase Console
- Verify the project_id in the JSON matches your Firebase project

### "Permission denied"
- Make sure you're an owner or editor of the Firebase project
- Check that the Firebase Admin SDK is enabled

### "Invalid JSON format"
- Make sure you copied the ENTIRE JSON file content
- Don't modify the JSON structure
- Include all the newlines in the private_key field (they're important!)

### "Secret not found in Edge Function"
- Make sure the secret name is exactly `FCM_SERVICE_ACCOUNT_JSON` (case-sensitive)
- Redeploy the Edge Function after adding the secret
- Check Supabase logs for any errors
