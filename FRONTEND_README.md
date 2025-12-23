# iTutor Frontend - Next.js 14 App Router

Complete Next.js 14 frontend for the iTutor platform with role-based routing and Supabase integration.

## 🚀 Features Implemented

### ✅ Role-Based Routing
- Automatic redirect based on user role after login
- Student → `/student/dashboard`
- Tutor → `/tutor/dashboard`
- Parent → `/parent/dashboard`

### ✅ Student Pages
- **Dashboard** (`/student/dashboard`)
  - Profile information
  - Recent sessions
  - Ratings summary
  - Find tutors button
- **Sessions** (`/student/sessions`)
  - Complete list of all sessions
  - Status and payment tracking
- **Ratings** (`/student/ratings`)
  - All ratings given by student
  - Rating details with comments

### ✅ Tutor Pages
- **Dashboard** (`/tutor/dashboard`)
  - Profile with verification badge
  - Subjects taught with pricing
  - Recent sessions
  - Rating display
- **Sessions** (`/tutor/sessions`)
  - All tutoring sessions
  - Earnings calculation (90% of amount)
- **Verification** (`/tutor/verification`)
  - Upload CSEC/CAPE certificates
  - View verification status
  - Upload history

### ✅ Parent Pages
- **Dashboard** (`/parent/dashboard`)
  - Parent profile
  - List of all children
  - Quick actions for each child
- **Add Child** (`/parent/add-child`)
  - Create new student profile
  - Link to parent account
  - Set billing mode to parent_required
- **Child Profile** (`/parent/child/[childId]`)
  - View child details
  - Quick actions
- **Child Sessions** (`/parent/child/[childId]/sessions`)
  - All sessions for specific child
- **Child Ratings** (`/parent/child/[childId]/ratings`)
  - All ratings for specific child

## 📁 Project Structure

```
├── app/
│   ├── page.tsx                    # Root redirect
│   ├── layout.tsx                  # Root layout
│   ├── globals.css                 # Global styles
│   ├── student/
│   │   ├── dashboard/page.tsx
│   │   ├── sessions/page.tsx
│   │   └── ratings/page.tsx
│   ├── tutor/
│   │   ├── dashboard/page.tsx
│   │   ├── sessions/page.tsx
│   │   └── verification/page.tsx
│   └── parent/
│       ├── dashboard/page.tsx
│       ├── add-child/page.tsx
│       └── child/[childId]/
│           ├── page.tsx
│           ├── sessions/page.tsx
│           └── ratings/page.tsx
├── components/
│   ├── RoleRedirect.tsx            # Post-login redirect logic
│   └── DashboardLayout.tsx         # Reusable dashboard layout
├── lib/
│   ├── supabase/
│   │   └── client.ts               # Supabase client setup
│   ├── types/
│   │   └── database.ts             # TypeScript types
│   └── hooks/
│       └── useProfile.ts           # Profile fetching hook
└── Configuration files
```

## 🛠️ Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. Supabase Storage Setup

Create a storage bucket for certificate uploads:

1. Go to Supabase Dashboard → Storage
2. Create new bucket: `verification_docs`
3. Set to **Public** (or configure RLS policies)

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 🔐 Authentication Flow

1. User logs in (login page not included - assumed to exist)
2. App fetches user profile from Supabase
3. Based on `role` field, user is redirected to appropriate dashboard
4. All subsequent navigation respects role-based permissions

## 📊 Data Flow

### Profile Fetching
```typescript
// lib/hooks/useProfile.ts
1. Get authenticated user from Supabase Auth
2. Query profiles table with user.id
3. Return profile with role information
```

### Parent Adding Child
```typescript
1. Parent fills form with child details
2. Create new profile with role='student'
3. Insert parent_child_links record
4. Redirect to parent dashboard
```

### Tutor Verification Upload
```typescript
1. Tutor selects certificate file (PDF/JPG/PNG)
2. Upload to Supabase Storage (verification_docs bucket)
3. Create tutor_verifications record with URL
4. Set status to 'pending'
5. Admin reviews and approves/rejects
```

## 🔒 RLS Policy Requirements

The frontend assumes the following RLS policies are active in Supabase:

- Students can read their own sessions
- Tutors can read their own sessions
- Parents can read their children's sessions (via parent_child_links)
- Students can create ratings for completed sessions
- Tutors can upload verifications
- Parents can create child profiles and link them

Refer to the Supabase migration files for complete RLS setup.

## 🎨 Styling

- **Framework**: TailwindCSS
- **Color Scheme**: Blue primary (#2563eb)
- **Design**: Clean, functional, minimal
- **Responsive**: Mobile-first approach

## 🚧 Not Yet Implemented

The following are placeholders for future development:

- [ ] Find Tutors functionality
- [ ] Session booking
- [ ] Payment processing
- [ ] Edit profile
- [ ] Messaging
- [ ] Notifications
- [ ] Admin dashboard

## 📝 Key TypeScript Types

All database types are defined in `lib/types/database.ts`:

- `Profile` - User profiles
- `Session` - Tutoring sessions
- `Rating` - Session ratings
- `TutorVerification` - Certificate uploads
- `TutorSubject` - Tutor subjects & pricing
- `ParentChildLink` - Parent-child relationships

## 🔗 Supabase Integration

### Tables Used
- `profiles` - All user data
- `sessions` - Tutoring sessions
- `ratings` - Session ratings
- `parent_child_links` - Parent-child relationships
- `tutor_subjects` - Tutor offerings
- `tutor_verifications` - Certificate uploads
- `subjects` - CSEC/CAPE subjects

### Storage
- `verification_docs` - Certificate uploads

## 🧪 Testing Checklist

### Student Flow
- [ ] Login as student
- [ ] View dashboard
- [ ] Check sessions list
- [ ] View ratings

### Tutor Flow
- [ ] Login as tutor
- [ ] View dashboard with verification badge
- [ ] Upload certificate
- [ ] View sessions

### Parent Flow
- [ ] Login as parent
- [ ] Add new child
- [ ] View child profile
- [ ] Check child sessions
- [ ] View child ratings

## 🐛 Troubleshooting

### "Failed to fetch profile"
- Check Supabase connection
- Verify RLS policies are enabled
- Ensure user is authenticated

### "Child not found"
- Verify parent_child_links table has correct entries
- Check parent_id matches logged-in user

### Upload fails
- Ensure `verification_docs` bucket exists
- Check bucket is public or has correct RLS policies
- Verify file size limits

## 📚 Dependencies

```json
{
  "@supabase/auth-helpers-nextjs": "^0.8.7",
  "@supabase/supabase-js": "^2.39.0",
  "next": "14.0.4",
  "react": "^18.2.0",
  "tailwindcss": "^3.3.0",
  "typescript": "^5"
}
```

## 🔄 Next Steps

1. Implement tutor discovery/search
2. Add session booking functionality
3. Integrate WiPay/FAC payment gateway
4. Build admin dashboard
5. Add real-time notifications
6. Implement messaging system

## 📞 Support

For issues or questions about the frontend implementation:
- Check Supabase logs for RLS policy violations
- Verify environment variables are set correctly
- Ensure all database migrations have run successfully

---

**Version**: 1.0.0  
**Framework**: Next.js 14 (App Router)  
**Backend**: Supabase  
**Styling**: TailwindCSS  
**Language**: TypeScript



