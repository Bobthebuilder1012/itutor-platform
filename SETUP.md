# iTutor Frontend Setup Guide

## ✅ Complete File Structure Created

All frontend files have been implemented with working code:

```
iTutor/
├── app/
│   ├── page.tsx                              ✅ Role-based redirect
│   ├── layout.tsx                            ✅ Root layout
│   ├── globals.css                           ✅ Tailwind imports
│   │
│   ├── student/
│   │   ├── dashboard/page.tsx               ✅ Student dashboard
│   │   ├── sessions/page.tsx                ✅ Student sessions list
│   │   └── ratings/page.tsx                 ✅ Student ratings
│   │
│   ├── tutor/
│   │   ├── dashboard/page.tsx               ✅ Tutor dashboard
│   │   ├── sessions/page.tsx                ✅ Tutor sessions list
│   │   └── verification/page.tsx            ✅ Certificate upload
│   │
│   └── parent/
│       ├── dashboard/page.tsx               ✅ Parent dashboard
│       ├── add-child/page.tsx               ✅ Add child form
│       └── child/[childId]/
│           ├── page.tsx                     ✅ Child profile
│           ├── sessions/page.tsx            ✅ Child sessions
│           └── ratings/page.tsx             ✅ Child ratings
│
├── components/
│   ├── RoleRedirect.tsx                     ✅ Auto-redirect logic
│   └── DashboardLayout.tsx                  ✅ Shared layout
│
├── lib/
│   ├── supabase/
│   │   └── client.ts                        ✅ Supabase client
│   ├── types/
│   │   └── database.ts                      ✅ TypeScript types
│   └── hooks/
│       └── useProfile.ts                    ✅ Profile hook
│
└── Config files                              ✅ All configs
```

## 🚀 Quick Start

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Environment Variables

Create `.env.local` in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

Get these from: Supabase Dashboard → Settings → API

### Step 3: Create Storage Bucket

1. Go to Supabase Dashboard → Storage
2. Click "Create bucket"
3. Name: `verification_docs`
4. Public: **false** (uncheck)
5. Click Create

### Step 4: Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 🔐 Role-Based Routing

After login, users are automatically redirected based on their role:

| Role | Redirect To |
|------|------------|
| student | `/student/dashboard` |
| tutor | `/tutor/dashboard` |
| parent | `/parent/dashboard` |
| admin | `/admin/dashboard` |

## 📋 Features by Role

### Student Features
✅ View profile with school, form level, subjects  
✅ View all sessions with status and payment tracking  
✅ View all ratings given  
✅ "Find Tutors" button (placeholder for future)

### Tutor Features
✅ View profile with rating and subjects taught  
✅ Display subjects with TT$ pricing  
✅ View all sessions with earnings (90%)  
✅ Upload CSEC/CAPE certificates  
✅ View verification status (pending/approved/rejected)

### Parent Features
✅ View all linked children  
✅ Add new child (creates student profile + links)  
✅ View each child's profile  
✅ View each child's sessions  
✅ View each child's ratings  
✅ Multi-child management

## 🔧 How It Works

### Profile Loading
1. `useProfile()` hook calls `supabase.auth.getUser()`
2. Fetches matching row from `profiles` table
3. Returns profile with role information
4. Components use role to show/hide features

### Parent Adding Child
1. Parent fills form with child details
2. Creates new `profiles` row with `role='student'`
3. Creates `parent_child_links` row linking parent to child
4. Sets `billing_mode='parent_required'`
5. Redirects to parent dashboard

### File Upload (Tutor Verification)
1. Tutor selects file (PDF/JPG/PNG)
2. Uploads to `verification_docs` bucket
3. Creates `tutor_verifications` row with file URL
4. Sets `status='pending'`
5. Admin reviews in admin panel (not yet built)

## 🎨 UI Components

### DashboardLayout
Shared layout with:
- iTutor logo
- Navigation links (role-specific)
- User name display
- Logout button

### Session Tables
Displays:
- Date & time
- Duration
- Status (booked/completed/cancelled)
- Payment status (for students)
- Amount in TTD

### Rating Display
Shows:
- Star rating (1-5)
- Comment (if provided)
- Date created
- Session reference

## 🔒 Security

All pages check:
1. User is authenticated
2. User has correct role
3. Parent can only access their own children
4. Queries respect RLS policies

## 🐛 Troubleshooting

### "Failed to fetch profile"
- Check Supabase URL and key in `.env.local`
- Verify RLS policies are enabled
- Ensure user is logged in

### "Child not found"
- Verify `parent_child_links` table has entry
- Check `parent_id` matches logged-in user
- RLS policies must allow parent to read child data

### File upload fails
- Ensure `verification_docs` bucket exists
- Check storage policies allow uploads
- Verify file size is within limits

### TypeScript errors
```bash
npm install
# Restart dev server
npm run dev
```

## 📚 Next Steps

To complete the platform, you'll need to add:

1. **Tutor Discovery** - Search/filter tutors by subject
2. **Session Booking** - Create session + redirect to payment
3. **Payment Integration** - WiPay/FAC integration
4. **Admin Dashboard** - Manage verifications, users, payouts
5. **Messaging** - Student-tutor communication
6. **Notifications** - Session reminders, payment confirmations

All foundation code is in place for these features!

## 🧪 Test Users

Create test users for each role in Supabase:

```sql
-- Student test user
INSERT INTO profiles (id, role, full_name, email, school, form_level, subjects_of_study, rating_count)
VALUES (
  'student-uuid-from-auth',
  'student',
  'Test Student',
  'student@test.com',
  'St. Joseph's College',
  'Form 4',
  ARRAY['Physics', 'Chemistry'],
  0
);

-- Tutor test user
INSERT INTO profiles (id, role, full_name, email, tutor_type, teaching_mode, rating_count)
VALUES (
  'tutor-uuid-from-auth',
  'tutor',
  'Test Tutor',
  'tutor@test.com',
  'university_tutor',
  'online',
  0
);

-- Parent test user
INSERT INTO profiles (id, role, full_name, email, rating_count)
VALUES (
  'parent-uuid-from-auth',
  'parent',
  'Test Parent',
  'parent@test.com',
  0
);
```

---

**Status**: ✅ Complete and Ready to Run  
**Framework**: Next.js 14 App Router  
**Backend**: Supabase  
**Styling**: TailwindCSS



