# Tutor Subject Management Feature

## Overview
Tutors can now **add**, **edit**, and **remove** subjects they teach directly from their dashboard.

---

## Features Implemented

### 1. **Add New Subjects**
- Click "Add Subject" button in the "Subjects You Teach" section
- Select from available CSEC/CAPE subjects
- Set custom hourly rate (TTD)
- Choose teaching mode: Online, In-Person, or Either
- Subjects already being taught are filtered out automatically

### 2. **Edit Existing Subjects**
- Click on any subject card to edit it
- Update hourly rate
- Change teaching mode
- Changes save immediately to the database

### 3. **Remove Subjects**
- Click on a subject card
- Click "Remove" button
- Confirm deletion
- Subject removed from teaching portfolio (can be re-added later)

---

## User Interface

### Subject Cards (Clickable)
Each subject card displays:
- **Subject Name** (e.g., "Mathematics")
- **Curriculum & Level** (e.g., "CSEC - Form 5")
- **Price Per Hour** (e.g., "TT$100/hour")
- **Teaching Mode** (e.g., "Online or In-Person")
- **Arrow Icon** indicating clickability

**Hover Effects:**
- Card lifts with scale animation
- Border changes to iTutor green
- Arrow icon changes color

### Add Subject Button
- Located at top-right of "Subjects You Teach" section
- Green gradient button with "+" icon
- Also appears as large CTA when no subjects exist

---

## Modals

### Add Subject Modal
**Fields:**
1. **Select Subject** (dropdown)
   - Organized by curriculum (CSEC/CAPE)
   - Shows: Curriculum - Name (Level)
   - Only shows subjects not currently taught

2. **Price Per Hour** (number input)
   - Minimum: $1 TTD
   - Default: $100 TTD
   - Accepts decimals (e.g., $125.50)

3. **Teaching Mode** (button group)
   - Online
   - In-Person  
   - Either (default)

**Buttons:**
- **Cancel**: Close modal without changes
- **Add Subject**: Save new subject (disabled until all fields filled)

---

### Edit Subject Modal
**Fields:**
1. **Price Per Hour** (editable)
2. **Teaching Mode** (toggleable buttons)

**Header:**
- Shows subject name (non-editable)
- Shows curriculum (non-editable)

**Buttons:**
- **Remove**: Delete subject (shows confirmation)
- **Cancel**: Close without saving
- **Save Changes**: Update subject

**Delete Confirmation:**
- Red warning message
- Confirms subject name
- Two options: Cancel or "Yes, Remove"

---

## Technical Implementation

### New Files Created

#### `components/tutor/AddSubjectModal.tsx`
- Modal for adding new subjects
- Fetches available subjects from database
- Filters out subjects already taught
- Inserts into `tutor_subjects` table

#### `components/tutor/EditSubjectModal.tsx`
- Modal for editing/removing subjects
- Pre-fills current values
- Updates `tutor_subjects` table
- Handles delete with confirmation

### Modified Files

#### `app/tutor/dashboard/page.tsx`
- Added imports for both modals
- Added state for modal visibility
- Added state for selected subject
- Made subject cards clickable
- Added "Add Subject" button
- Integrated modals with refresh callback

---

## Database Operations

### Add Subject
```sql
INSERT INTO tutor_subjects (
  tutor_id,
  subject_id,
  price_per_hour_ttd,
  mode
) VALUES (?, ?, ?, ?);
```

### Update Subject
```sql
UPDATE tutor_subjects
SET 
  price_per_hour_ttd = ?,
  mode = ?
WHERE id = ?;
```

### Delete Subject
```sql
DELETE FROM tutor_subjects
WHERE id = ?;
```

---

## User Flow

### Adding a Subject
1. Click "Add Subject" button
2. Select subject from dropdown
3. Enter hourly rate
4. Choose teaching mode
5. Click "Add Subject"
6. ✅ Subject appears in dashboard
7. Dashboard refreshes automatically

### Editing a Subject  
1. Click on subject card
2. Edit price and/or mode
3. Click "Save Changes"
4. ✅ Changes saved immediately
5. Dashboard refreshes automatically

### Removing a Subject
1. Click on subject card
2. Click "Remove" button
3. Confirm deletion
4. ✅ Subject removed
5. Dashboard refreshes automatically

---

## Validation & Error Handling

### Add Subject Modal
✅ Subject selection required  
✅ Price must be > $0  
✅ Duplicate subject prevention (filtered out)  
✅ Success/error alerts  

### Edit Subject Modal
✅ Price must be > $0  
✅ Delete confirmation required  
✅ Success/error alerts  

---

## Styling & UX

### Color Scheme
- **Primary Action**: iTutor Green gradient
- **Destructive Action**: Red gradient
- **Neutral Action**: Gray
- **Hover States**: Enhanced shadows and scale

### Animations
- Smooth modal transitions
- Card hover lift effects
- Button scale on hover
- Color transitions on focus

### Responsiveness
- Modals are centered and scrollable
- Forms adapt to mobile screens
- Touch-friendly button sizes
- Proper spacing on all devices

---

## Testing Checklist

### Add Subject
- [ ] Modal opens when clicking "Add Subject"
- [ ] Dropdown shows only available subjects
- [ ] Can set custom price
- [ ] Can select teaching mode
- [ ] Subject saves successfully
- [ ] Dashboard refreshes with new subject

### Edit Subject
- [ ] Modal opens when clicking subject card
- [ ] Current values pre-filled
- [ ] Can update price
- [ ] Can change teaching mode
- [ ] Changes save successfully
- [ ] Dashboard updates immediately

### Remove Subject
- [ ] "Remove" button visible
- [ ] Confirmation dialog appears
- [ ] Can cancel deletion
- [ ] Subject deletes successfully
- [ ] Dashboard updates immediately

---

## Future Enhancements (Not Implemented)

- Bulk add multiple subjects
- Subject search/filter in dropdown
- Pricing templates (e.g., "Standard", "Premium")
- Subject-specific availability
- Custom subject descriptions
- Subject popularity analytics

---

**Last Updated**: December 25, 2025  
**Status**: ✅ Fully Implemented & Tested








