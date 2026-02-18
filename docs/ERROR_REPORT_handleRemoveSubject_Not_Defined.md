# Error Report: handleRemoveSubject is not defined

**Date:** 2026-02-18  
**Component:** Admin verification – Remove verified subject  
**File:** `app/reviewer/verification/[requestId]/page.tsx`  
**Error:** `Uncaught ReferenceError: handleRemoveSubject is not defined`  
**Location:** `onClick` at `page.tsx` (button in Verified Subjects list)

---

## Summary

When an admin clicked the "Remove" button next to a verified subject on the verification request detail page, the browser threw `ReferenceError: handleRemoveSubject is not defined`. The handler was implemented in the same component but was not reliably in scope for the button’s `onClick`, leading to the runtime error.

---

## Root Cause

- `handleRemoveSubject` was defined as an **async function declaration** in the component body (e.g. `async function handleRemoveSubject(...) { ... }`).
- In this context it behaves like a **function expression**, not a hoisted declaration, so it is only available after that line runs in the same render.
- Under certain conditions (e.g. hot reload, bundle order, or closure capture), the `onClick` callback could run in a context where that function reference was not available, causing "handleRemoveSubject is not defined".

---

## Fix Applied

1. **Import `useCallback`** from React in `app/reviewer/verification/[requestId]/page.tsx`.
2. **Define the handler with `useCallback`** so it is a stable, named reference in the component scope:

```tsx
const handleRemoveSubject = useCallback(
  async (verifiedSubjectId: string) => {
    if (!confirm('Remove this verified subject from the list?')) return;
    setRemovingId(verifiedSubjectId);
    try {
      const res = await fetch(
        `/api/admin/verification/requests/${params.requestId}/verified-subjects/${verifiedSubjectId}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove');
      }
      setVerifiedSubjects((prev) => prev.filter((s) => s.id !== verifiedSubjectId));
    } catch (err: any) {
      alert(err.message || 'Failed to remove subject');
    } finally {
      setRemovingId(null);
    }
  },
  [params.requestId]
);
```

- **Why this works:** `handleRemoveSubject` is now a variable assigned on every render, so it is always part of the component’s scope. The `onClick` handler (`() => handleRemoveSubject(subject.id)`) consistently resolves `handleRemoveSubject` from that scope, avoiding the ReferenceError. Using `useCallback` also keeps the function reference stable when `params.requestId` is unchanged, which is good for performance and avoids unnecessary re-renders.

---

## Verification

- After the change, the Remove button runs without throwing.
- Confirmation dialog appears, the DELETE request is sent, and the list updates on success.
- No new linter issues; existing behaviour preserved.

---

## Recommendation

For event handlers that are passed to child elements or used in dynamic UI (e.g. list item buttons), define them with `useCallback` so they are always a clear, stable reference in the component scope and avoid "is not defined" or stale-closure issues, especially with hot reload.
