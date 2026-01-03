# Subject Management Updates - December 25, 2025

## Changes Made

### 1. **Online-Only Platform** 🌐
- **Removed** "In-Person" and "Either" teaching mode options
- Platform is now **100% online**
- All subjects automatically set to `mode: 'online'`

### 2. **Price Validation** 💰
- **Minimum price: $1 TTD**
- Cannot enter $0 or negative prices
- Validation on both Add and Edit modals
- Clear error messages if invalid price entered

### 3. **New Multi-Select Interface** ✨
- **Changed from dropdown** to search-based multi-select
- Similar to the signup/onboarding flow
- **Add multiple subjects at once**
- Set individual prices for each subject
- Visual feedback with CSEC/CAPE badges

---

## New Add Subject Flow

### How It Works:

1. **Search for subjects**
   - Type to filter (e.g., "Math", "CSEC", "Physics")
   - Shows up to 15 matching results
   - Displays curriculum badges (CSEC/CAPE)

2. **Select subjects**
   - Click to add a subject
   - Appears in "Selected Subjects" list below
   - Each subject has its own price field

3. **Set prices**
   - Default: $100 TTD
   - Minimum: $1 TTD
   - Individual pricing per subject
   - Cannot proceed with $0 or empty prices

4. **Add all at once**
   - Button shows count: "Add 3 Subjects"
   - Validates all prices before saving
   - Inserts all subjects in one transaction

---

## UI Components Updated

### **AddSubjectModal.tsx**
**Before:**
- Single dropdown for subject selection
- One price field
- Three mode buttons (Online/In-Person/Either)
- Add one subject at a time

**After:**
- Search input with live filtering
- Multi-select with badges
- Individual price fields per subject
- Add multiple subjects at once
- Online-only (no mode selection)

### **EditSubjectModal.tsx**
**Before:**
- Price input
- Three mode buttons
- Update and Delete options

**After:**
- Price input with validation
- Info notice: "iTutor is currently online-only"
- Removed mode selection
- Update and Delete options remain

### **Tutor Dashboard**
**Before:**
- Subject cards showed: Name, Curriculum, Price, **Mode**

**After:**
- Subject cards show: Name, Curriculum, Price
- Removed mode display (always online now)

---

## Features

### Add Modal

✅ **Search & Filter**
- Type to search subject names
- Filter by curriculum (CSEC/CAPE)
- Shows 10 by default, up to 15 when searching

✅ **Multi-Select**
- Select multiple subjects before adding
- Visual confirmation with chips/badges
- Easy removal with X button

✅ **Individual Pricing**
- Set unique rate for each subject
- Default: $100 TTD
- Minimum: $1 TTD
- Inline validation

✅ **Batch Add**
- Add all selected subjects at once
- Single database transaction
- Success message shows count

### Edit Modal

✅ **Price Validation**
- Cannot save $0 or negative prices
- Clear error message
- Only allows valid numbers

✅ **Simplified UI**
- Removed unnecessary mode selection
- Clean, focused interface
- Info notice about online-only

---

## Validation Rules

### Price Validation:
```typescript
const priceNum = parseFloat(price);
if (isNaN(priceNum) || priceNum <= 0) {
  alert('Please enter a valid price greater than $0');
  return;
}
```

### Applied To:
- ✅ Adding new subjects (all must be valid)
- ✅ Editing existing subjects
- ✅ Real-time validation on input

---

## User Experience Improvements

### **Faster Subject Addition**
- **Before**: Add subjects one by one (slow)
- **After**: Add 5+ subjects in one action (fast)

### **Better Search**
- **Before**: Scroll through long dropdown
- **After**: Type to find exactly what you need

### **Clear Pricing**
- **Before**: One price field, easy to forget
- **After**: Price field next to each subject, visual reminder

### **No Mode Confusion**
- **Before**: Users might select wrong mode
- **After**: Always online, no choices needed

---

## Database Changes

### New Records Format:
```typescript
{
  tutor_id: string,
  subject_id: string,
  price_per_hour_ttd: number, // Must be > 0
  mode: 'online' // Always 'online', no longer user-selectable
}
```

### Batch Insert:
```typescript
const tutorSubjects = selectedSubjects.map(({ subject, price }) => ({
  tutor_id: tutorId,
  subject_id: subject.id,
  price_per_hour_ttd: parseFloat(price),
  mode: 'online' as const,
}));

await supabase.from('tutor_subjects').insert(tutorSubjects);
```

---

## Testing Checklist

### Add Modal:
- [ ] Search filters subjects correctly
- [ ] Can select multiple subjects
- [ ] Each subject has a price field
- [ ] Cannot add with $0 price
- [ ] Cannot add with empty price
- [ ] Successfully adds multiple subjects
- [ ] Dashboard updates after adding

### Edit Modal:
- [ ] Pre-fills current price
- [ ] Cannot save $0 price
- [ ] Cannot save negative price
- [ ] Shows "online-only" notice
- [ ] No mode selection visible
- [ ] Successfully updates price
- [ ] Delete confirmation works

### Dashboard:
- [ ] Subject cards don't show mode
- [ ] Shows curriculum and level
- [ ] Shows price correctly
- [ ] Click opens edit modal

---

## Migration Notes

### Existing Data:
- Existing subjects with `mode: 'in_person'` or `mode: 'either'` will remain in database
- When edited, they'll be updated to `mode: 'online'`
- No automatic migration needed

### Future Consideration:
If in-person tutoring is added later, the mode selection can be restored in both modals.

---

## Files Modified

1. **components/tutor/AddSubjectModal.tsx**
   - Complete rewrite
   - Multi-select interface
   - Batch subject adding
   - Price validation

2. **components/tutor/EditSubjectModal.tsx**
   - Removed mode selection UI
   - Added price validation
   - Added online-only notice

3. **app/tutor/dashboard/page.tsx**
   - Removed mode display from subject cards

---

## Summary

✅ **Online-only**: Simplified platform focus  
✅ **Price validation**: No $0 or negative rates  
✅ **Multi-select**: Add multiple subjects quickly  
✅ **Better UX**: Search-based interface  
✅ **Cleaner UI**: Removed unnecessary options  

---

**Status:** ✅ Complete and Ready for Testing  
**Last Updated:** December 25, 2025









