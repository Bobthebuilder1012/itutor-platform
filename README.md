# iTutor Platform

A comprehensive tutoring platform connecting students, parents, and tutors for CXC exam preparation.

## Features

- **Student Dashboard**: Find tutors, book sessions, manage bookings
- **Tutor Dashboard**: Manage availability, sessions, and curriculum
- **Parent Dashboard**: Manage children and approve bookings
- **Admin/Reviewer Dashboard**: Review and approve tutor verifications
- **Real-time Messaging**: Chat between students, parents, and tutors
- **Payment Integration**: Secure payment processing
- **CXC Verification System**: Verify tutor qualifications with official CXC results

## CXC Verification System

The platform includes a comprehensive verification system for tutors to prove their CXC qualifications.

### Admin Role Configuration

Admins have `is_reviewer=true` OR `role='admin'` in the profiles table.

To grant admin access:

```sql
UPDATE profiles SET is_reviewer = true WHERE id = 'USER_UUID';
-- OR
UPDATE profiles SET role = 'admin' WHERE id = 'USER_UUID';
```

### Storage Bucket

- **Bucket**: `tutor-verifications`
- **Path**: `{tutor_id}/requests/{request_id}.{ext}`
- **Access**: RLS enforced (tutor + admins only)

### Verification Flow

1. **Tutor Uploads**: Tutor uploads CXC results slip (PDF/JPG/PNG, max 5MB)
2. **Admin Reviews**: Admin reviews document and adds verified subjects with grades
3. **Approval**: Admin approves request, tutor status becomes "VERIFIED"
4. **Public Display**: Tutor can choose which verified subjects to display publicly
5. **Student View**: Students and parents can view verified subjects on tutor profiles

### API Endpoints

#### Tutor Endpoints
- `GET /api/tutor/verified-subjects` - Get all verified subjects (public + hidden)
- `PATCH /api/tutor/verified-subjects/[id]/visibility` - Toggle subject visibility
- `POST /api/tutor/verification/upload` - Upload verification document
- `GET /api/tutor/verification/status` - Get latest submission status

#### Admin Endpoints
- `GET /api/admin/verification/requests` - Get verification requests (filtered by status)
- `GET /api/admin/verification/requests/[id]` - Get single request with document
- `POST /api/admin/verification/requests/[id]/add-subject` - Add verified subject
- `POST /api/admin/verification/requests/[id]/approve` - Approve request
- `POST /api/admin/verification/requests/[id]/reject` - Reject request with reason

#### Public Endpoints
- `GET /api/public/tutors/[tutorId]/verified-subjects` - Get public verified subjects

### Pages

#### Tutor Pages
- `/tutor/verification/upload` - Upload CXC results slip
- `/tutor/verification/manage-subjects` - Manage visibility of verified subjects

#### Admin Pages
- `/reviewer/verification/queue` - View pending verification requests
- `/reviewer/verification/[requestId]` - Review and process verification request

### Database Tables

#### tutor_verified_subjects
Stores individual verified subjects with grades from CXC results slips.

Fields:
- `id` - UUID primary key
- `tutor_id` - Foreign key to profiles
- `subject_id` - Foreign key to subjects
- `exam_type` - CSEC or CAPE
- `grade` - Integer 1-9
- `year` - Optional exam year
- `session` - Optional exam session
- `verified_by_admin_id` - Admin who verified
- `verified_at` - Timestamp of verification
- `is_public` - Boolean for public visibility
- `visibility_updated_at` - Timestamp of last visibility change
- `source_request_id` - Foreign key to tutor_verification_requests

### RLS Policies

- **Tutors**: Can view all their own verified subjects, can update only `is_public` field
- **Admins**: Can view, insert, update, and delete all verified subjects
- **Public**: Can view only subjects where `is_public = true`

### Security Features

- File type validation (PDF, JPG, PNG only)
- File size limit (5MB)
- Rate limiting (1 submission per day)
- Row Level Security (RLS) on all tables
- Signed URLs for document access (1 hour expiry)
- Admin-only access to verification management

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage
- **Styling**: Tailwind CSS
- **Language**: TypeScript

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables (see `.env.example`)
4. Run migrations: `npm run migrate`
5. Start development server: `npm run dev`

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Database Migrations

Migrations are located in `src/supabase/migrations/` and should be run in order:

1. `032_add_verified_subjects_table.sql` - Creates tutor_verified_subjects table
2. `033_verification_storage_policies.sql` - Sets up storage bucket and policies

## License

Proprietary - All rights reserved



