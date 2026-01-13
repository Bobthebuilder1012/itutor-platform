# ✅ Fixed: Student Name & View Profile Button

## 🔧 What Was Fixed:

### **1. Student Name Display**
The booking detail page now properly fetches and displays the student's name instead of "Unknown Student"

### **2. View Profile Button**
Added a "View Profile" button next to the student name that links to `/tutor/students/[studentId]`

---

## 📝 Changes Made:

### **File: `app/tutor/bookings/[bookingId]/page.tsx`**

#### **Added:**
- Store `studentId` state variable
- Better error handling for profile fetch
- "View Profile" button with icon
- Only shows button when student name is successfully loaded

#### **Improved:**
- Header layout with flex alignment
- Student name fetching with error logging
- Visual feedback for clickable profile link

---

## 🧪 How to Test:

### **Step 1: Verify RLS Policy**

Open **Supabase SQL Editor** and run the verification script:

```sql
-- Check if you can read student profiles as a tutor
SELECT 
  id,
  username,
  display_name,
  full_name,
  role
FROM public.profiles
WHERE role = 'student'
LIMIT 5;
```

**Expected:** Should return student profiles  
**If empty:** Run `VERIFY_STUDENT_PROFILE_FIX.sql` (see below)

---

### **Step 2: Hard Refresh Browser**

```
Windows: Ctrl + Shift + R
Mac: Cmd + Shift + R
```

---

### **Step 3: Test the Booking Page**

1. **Login as tutor**
2. Go to **"Booking Requests"**
3. **Click any booking** from a student
4. **Verify:**
   - ✅ Shows student's actual name (not "Unknown Student")
   - ✅ "View Profile" button appears next to name
   - ✅ Clicking button opens student profile page

---

## 🐛 If Student Name Still Shows "Unknown":

### **Option A: Run Verification Script**

1. Open **Supabase SQL Editor**
2. Copy & paste contents of `VERIFY_STUDENT_PROFILE_FIX.sql`
3. Run the script
4. Follow the instructions in the output

### **Option B: Quick Fix (Recommended)**

Run this in **Supabase SQL Editor**:

```sql
-- Make student profiles viewable by all authenticated users
DROP POLICY IF EXISTS "Tutors can view student profiles" ON public.profiles;
DROP POLICY IF EXISTS "Students can be viewed by authenticated users" ON public.profiles;

CREATE POLICY "Students can be viewed by authenticated users"
ON public.profiles
FOR SELECT
TO authenticated
USING (role = 'student');

-- Test it
SELECT 
  id,
  username,
  display_name,
  full_name,
  role
FROM public.profiles
WHERE role = 'student'
LIMIT 5;
```

**Expected:** Returns student profiles ✅

---

## 🎨 What It Looks Like Now:

### **Before:**
```
Session with Unknown Student
CSEC Principles of Business (POB)
```

### **After:**
```
Session with Sarah Williams    [View Profile →]
CSEC Principles of Business (POB)
```

The "View Profile" button:
- ✅ Green text (itutor-green)
- ✅ Hover effect (emerald-400)
- ✅ External link icon
- ✅ Opens `/tutor/students/[studentId]` page

---

## 📊 Check Browser Console:

If still seeing "Unknown Student":

1. Press **F12** to open developer tools
2. Go to **Console** tab
3. Refresh the booking page
4. Look for error messages like:
   ```
   Error fetching student profile: {...}
   ```

**Share the error message if you see one!**

---

## ✅ Success Checklist:

After fix:
- [ ] RLS query returns student profiles
- [ ] Browser hard refreshed
- [ ] Booking page shows student's real name
- [ ] "View Profile" button appears
- [ ] Clicking button opens student profile
- [ ] No errors in browser console

---

## 🔍 Debug Steps:

### **1. Check if bookings have student_id:**

```sql
SELECT 
  b.id,
  b.student_id,
  p.username as student_username,
  p.display_name as student_display_name
FROM bookings b
LEFT JOIN profiles p ON p.id = b.student_id
LIMIT 5;
```

**Expected:** Should show student usernames/names

---

### **2. Check RLS policies:**

```sql
SELECT policyname, permissive, roles, cmd
FROM pg_policies 
WHERE tablename = 'profiles'
AND policyname LIKE '%student%';
```

**Expected:** Should show policy allowing tutors to read student profiles

---

### **3. Test profile query directly:**

```sql
-- Replace with actual student_id from a booking
SELECT username, display_name, full_name
FROM public.profiles
WHERE id = 'STUDENT_ID_FROM_BOOKING';
```

**Expected:** Returns the student's info

---

## 🚀 Quick Summary:

**Problem:** "Session with Unknown Student" + no profile button  
**Cause:** Either RLS blocking profile read OR frontend not fetching correctly  
**Fix:** 
1. Updated frontend to better handle student profile fetching
2. Added "View Profile" button
3. Ensured RLS allows tutors to read student profiles  

**Test:** 
1. Run `VERIFY_STUDENT_PROFILE_FIX.sql` in Supabase
2. Hard refresh browser
3. Check booking detail page

---

## 📁 Files:

- ✅ `app/tutor/bookings/[bookingId]/page.tsx` - Updated
- ✅ `VERIFY_STUDENT_PROFILE_FIX.sql` - New verification script
- ✅ `FIX_BOOKING_STUDENT_NAME.md` - This guide

---

**Ready to test! Start with running `VERIFY_STUDENT_PROFILE_FIX.sql` in Supabase SQL Editor.** 🎯














