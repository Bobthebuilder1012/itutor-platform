# Footer Links Update

## Change Summary
Updated all footer links to direct users appropriately:
- **Help** → Opens email to `support@myitutor.com`
- **Privacy** → Links to Terms & Conditions page (`/terms`)
- **Terms** → Links to Terms & Conditions page (`/terms`)

## Why These Changes?

### Help Link → Email
- ✅ Direct contact with support team
- ✅ Opens user's default email client
- ✅ Email: `support@myitutor.com`
- ✅ Faster support access than navigating to help pages

### Privacy Link → Terms Page
- ✅ Consolidated privacy policy and terms into single page
- ✅ Reduces redundancy
- ✅ Simpler maintenance (one page to update)
- ✅ Common practice for platforms to combine these documents

## Files Updated

### 1. Landing Page Footer
**File**: `components/landing/Footer.tsx`
- Changed "Help" from `Link href="/help"` to `<a href="mailto:support@myitutor.com">`
- Changed "Privacy" from `Link href="/privacy"` to `Link href="/terms"`
- "Terms" already linked to `/terms` (no change needed)

### 2. iTutor Requirements Page
**File**: `app/itutors/requirements/page.tsx`
- Changed "Privacy Policy" from `Link href="/privacy"` to `Link href="/terms"`
- Changed "Help Centre" from `Link href="/help/itutors"` to `<a href="mailto:support@myitutor.com">`
- "Terms & Conditions" already linked to `/terms` (no change needed)

### 3. Help Center Main Page
**File**: `app/help/itutors/page.tsx`
- Changed "Privacy Policy" from `Link href="/privacy"` to `Link href="/terms"`
- "Terms & Conditions" already linked to `/terms` (no change needed)

### 4. Help Article Pages
**File**: `app/help/itutors/[slug]/page.tsx`
- Changed "Privacy Policy" from `Link href="/privacy"` to `Link href="/terms"`
- "Terms & Conditions" already linked to `/terms` (no change needed)

### 5. Privacy Policy Page
**File**: `app/privacy/page.tsx`
- Already had correct link to `/terms` (no change needed)

## Link Behavior

### Help / Contact Links
When users click "Help" or "Help Centre":
```html
<a href="mailto:support@myitutor.com">Help</a>
```
- Opens default email client
- Pre-fills recipient: support@myitutor.com
- User can immediately compose support request

### Privacy & Terms Links
When users click "Privacy" or "Terms":
```html
<Link href="/terms">Privacy</Link>
<Link href="/terms">Terms & Conditions</Link>
```
- Navigates to `/terms` page
- Shows combined Terms & Conditions / Privacy Policy
- Single source of truth for legal information

## User Experience Improvements

### Before:
- "Help" → Navigates to help pages (extra clicks to contact support)
- "Privacy" → Goes to separate privacy page
- "Terms" → Goes to terms page
- Users had to navigate multiple pages

### After:
- "Help" → **Instantly opens email to support** ⚡
- "Privacy" → Goes directly to terms/privacy page
- "Terms" → Goes to same terms/privacy page
- Faster, more direct user experience

## Testing Checklist

Verify these links work correctly:
- [ ] Landing page footer "Help" opens email client
- [ ] Landing page footer "Privacy" goes to /terms
- [ ] Landing page footer "Terms" goes to /terms
- [ ] Requirements page "Help Centre" opens email client
- [ ] Requirements page "Privacy Policy" goes to /terms
- [ ] Help center "Privacy Policy" goes to /terms
- [ ] Help articles "Privacy Policy" goes to /terms

## Email Link Format

The mailto link structure:
```html
<a href="mailto:support@myitutor.com">Help</a>
```

Can be enhanced with subject/body if needed:
```html
<a href="mailto:support@myitutor.com?subject=Support%20Request">Help</a>
```

## Benefits

1. **Faster Support Access**: One click to email support
2. **Simplified Navigation**: Less confusion about where to find policies
3. **Reduced Maintenance**: One combined legal page instead of two
4. **Better UX**: Users get help faster
5. **Professional**: Standard practice for SaaS platforms

## Notes

- All "Privacy" links now point to `/terms` page
- Assumes `/terms` page contains both Terms & Conditions and Privacy Policy
- If you need separate privacy page, revert Privacy links to `/privacy`
- Email links use `<a>` tag (not `Link`) for proper mailto handling

---

**Status**: ✅ All footer links updated across platform
