# Error Report: Admin Authentication Failure (401 Unauthorized)

**Date:** February 15, 2026  
**Severity:** High  
**Status:** Resolved  
**Affected Component:** Admin/Reviewer Account Management Pages

---

## Executive Summary

Admin and reviewer users were unable to access the Account Management page (`/reviewer/accounts`). All API requests returned `401 Unauthorized` errors with "Auth session missing!" messages, despite users being successfully authenticated and logged in on the client side.

---

## Root Cause

### The Core Issue: Storage Mechanism Mismatch

The application had a **fundamental mismatch** between how authentication sessions were stored on the client and how they were retrieved on the server:

#### Client-Side (Browser):
- Used `createClient()` from `@supabase/supabase-js`
- Stored authentication tokens in **localStorage** or **sessionStorage**
- Sessions existed in browser storage but were NOT accessible to server-side code

#### Server-Side (API Routes):
- Used `createServerClient()` from `@supabase/ssr`
- Attempted to read authentication tokens from **HTTP cookies**
- Could not find any session data because nothing was stored in cookies

**Result:** The client had a valid session in localStorage, but the server had no way to access it. From the server's perspective, every request appeared to be unauthenticated.

---

## Technical Details

### Affected Files (Before Fix):

**`lib/supabase/client.ts`** (Client Configuration)
```typescript
// ❌ INCORRECT - Uses localStorage/sessionStorage
return createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: window.localStorage,  // Server cannot read this!
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
```

**`app/api/admin/accounts/route.ts`** (Server Configuration)
```typescript
// ✅ CORRECT - Reads from cookies
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookies: {
      getAll() {
        return cookieStore.getAll();  // Looking for cookies that don't exist!
      },
    },
  }
);
```

### Diagnostic Evidence

Server logs confirmed no cookies were being received:
```
📋 All cookies: 
🔍 Supabase cookies: []
🔐 Auth result: { user: 'none', error: 'Auth session missing!' }
❌ Auth failed: Auth session missing!
```

Browser localStorage check confirmed session existed locally:
```javascript
localStorage.getItem('supabase.auth.token')
// Returns: null (after logout) or JSON token data (when logged in)
```

---

## Solution Implemented

### Code Changes

**Modified: `lib/supabase/client.ts`**

Changed from localStorage-based to cookie-based authentication:

```typescript
// ✅ FIXED - Uses cookies that both client and server can access
import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseClient(persistSession: boolean = true): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Use createBrowserClient for proper SSR cookie support
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
```

**Key Changes:**
1. Removed `createClient` import from `@supabase/supabase-js`
2. Switched to `createBrowserClient` from `@supabase/ssr`
3. Removed manual storage configuration (cookies are handled automatically)

### Why This Works

`createBrowserClient` from `@supabase/ssr`:
- Automatically stores auth tokens in **HTTP cookies**
- Cookies are sent with every HTTP request (including API routes)
- Server-side code can read cookies using Next.js `cookies()` helper
- Provides proper Server-Side Rendering (SSR) support

---

## Required User Action

Users who were logged in during the fix deployment **must log out and log back in** to establish new cookie-based sessions. Old localStorage sessions are incompatible with the new cookie-based system.

### Steps for Existing Users:
1. Click "Logout" button
2. Clear browser cache (optional but recommended)
3. Log back in with credentials
4. New cookie-based session will be created automatically

---

## Verification

After implementing the fix and users logging back in:

**Server logs now show:**
```
📋 All cookies: sb-<project>-auth-token, sb-<project>-auth-token-code-verifier
🔍 Supabase cookies: [auth token data present]
🔐 Auth result: { user: 'admin@myitutor.com', error: undefined }
✅ Admin authenticated: admin@myitutor.com
```

**API responses:**
- Status changed from `401 Unauthorized` to `200 OK`
- Account data successfully returned
- Admin dashboard now loads correctly

---

## Lessons Learned

### Best Practices for Next.js + Supabase Authentication:

1. **Always use `@supabase/ssr` package for Next.js applications**
   - Client: `createBrowserClient()` for cookie-based sessions
   - Server: `createServerClient()` with cookie handlers
   - Middleware: Proper cookie getAll/setAll implementation

2. **Avoid `@supabase/supabase-js` in Next.js apps**
   - Designed for client-only applications (e.g., single-page apps)
   - Uses localStorage which is invisible to server-side code
   - Breaks SSR and API route authentication

3. **Test authentication end-to-end**
   - Verify cookies are created on login
   - Confirm server can read cookies in API routes
   - Check both client and server logs during debugging

4. **Storage migration requires user re-authentication**
   - Sessions cannot be automatically migrated between storage types
   - Users must create new sessions when authentication method changes

---

## Prevention

To prevent similar issues in the future:

1. ✅ Added debug logging to API routes showing cookie presence
2. ✅ Documented proper Supabase SSR setup in codebase
3. ✅ Standardized on `@supabase/ssr` for all authentication code
4. ⚠️ **TODO:** Add automated tests for server-side authentication
5. ⚠️ **TODO:** Add health check endpoint that verifies cookie-based auth

---

## Related Files Modified

- `lib/supabase/client.ts` - Switched to cookie-based auth
- `app/api/admin/accounts/route.ts` - Added debug logging
- `app/api/admin/filter-options/route.ts` - Consistent cookie handling
- `lib/middleware/adminAuth.ts` - Updated cookie configuration
- `components/DashboardLayout.tsx` - Enhanced logout to clear storage

---

## References

- [Supabase SSR Documentation](https://supabase.com/docs/guides/auth/server-side-rendering)
- [Next.js Cookies Documentation](https://nextjs.org/docs/app/api-reference/functions/cookies)
- [HTTP Cookie Specification](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)

---

**Report Prepared By:** AI Assistant  
**Reviewed By:** Development Team  
**Date:** February 15, 2026
