# Logout Bug Fix - Search Bar Issue

## Problem
Users were being logged out when typing in the search bar on their dashboard pages (parent, student, tutor).

## Root Cause
The issue was caused by a race condition in the authentication check logic. When users typed in the search bar:

1. The search component would trigger re-renders
2. During re-renders, the `useProfile` hook could temporarily return `null` or `undefined` for the profile
3. The dashboard's `useEffect` would run and see `!profile`, immediately redirecting to `/login`
4. This happened even though the user was still authenticated

## Files Fixed

### 1. `lib/hooks/useProfile.ts`
**Problem**: The hook could be called multiple times, causing unnecessary re-fetches and temporary `null` states.

**Solution**: Added a `useRef` to prevent multiple fetches:
```typescript
const hasFetched = useRef(false);

useEffect(() => {
  // Prevent multiple fetches
  if (hasFetched.current) return;
  hasFetched.current = true;
  
  // ... fetch logic
}, []);
```

### 2. `app/parent/dashboard/page.tsx`
**Problem**: The redirect logic was too aggressive:
```typescript
if (!profile || profile.role !== 'parent') {
  router.push('/login');
  return;
}
```

**Solution**: Split the logic to only redirect when loading is complete:
```typescript
// Only redirect if loading is complete and there's definitely no profile
if (!loading && !profile) {
  router.push('/login');
  return;
}

// Only redirect if we have a profile but it's the wrong role
if (!loading && profile && profile.role !== 'parent') {
  router.push('/login');
  return;
}

// Only fetch children if we have a valid profile
if (profile && profile.role === 'parent') {
  fetchChildren();
}
```

### 3. `app/student/dashboard/page.tsx`
Applied the same fix as parent dashboard.

### 4. `app/tutor/dashboard/page.tsx`
Applied the same fix as parent dashboard.

## Key Improvements

1. **Prevented Multiple Profile Fetches**: Using `useRef` ensures the profile is only fetched once per component mount
2. **Safer Redirect Logic**: Only redirects when we're certain the user is not authenticated (loading complete + no profile)
3. **Race Condition Prevention**: Checks both `loading` state and `profile` state before making routing decisions
4. **Consistent Behavior**: Applied the same fix across all dashboard pages

## Testing
To verify the fix:
1. Log in as a parent/student/tutor
2. Navigate to the dashboard
3. Type in the search bar
4. Verify you remain logged in and can search successfully

## Impact
This fix prevents false logouts across all user roles (parent, student, tutor) when using any interactive features that cause component re-renders.



