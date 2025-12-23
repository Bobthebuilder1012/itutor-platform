# iTutor Backend Implementation - Complete ✅

This README summarizes the backend implementation for iTutor, a Trinidad & Tobago tutoring platform built with Supabase.

## 📁 Project Structure

```
iTutor/
├── src/
│   └── types/
│       └── supabase.ts              # TypeScript database types
├── supabase/
│   ├── migrations/
│   │   ├── 001_create_payments_table.sql      # Payments table + RLS
│   │   ├── 002_sessions_rls_policies.sql       # Sessions RLS policies
│   │   └── 003_ratings_rls_policies.sql        # Ratings RLS policies
│   └── functions/
│       ├── create-session/
│       │   └── index.ts              # Students create sessions
│       ├── confirm-payment/
│       │   └── index.ts              # Confirm payments (90/10 split)
│       ├── complete-session/
│       │   └── index.ts              # Tutors mark sessions complete
│       ├── create-rating/
│       │   └── index.ts              # Students/parents rate tutors
│       └── tutor-earnings-summary/
│           └── index.ts              # Tutors view earnings
├── docs/
│   └── backend-api.md                # Full API documentation
├── itutor-auth.html                  # Frontend auth page
└── README-BACKEND.md                 # This file
```

## ✅ What's Implemented

### 1. **Database Schema & Types** (`src/types/supabase.ts`)
- Complete TypeScript types for all tables
- Type-safe aliases for working with Supabase
- Covers: profiles, parent_child_links, sessions, ratings, payments

### 2. **SQL Migrations** (`supabase/migrations/`)
- **001**: Creates `payments` table with 90/10 split columns, indexes, and RLS
- **002**: Sessions RLS policies (students, tutors, parents access)
- **003**: Ratings RLS policies (completed sessions only, one per rater)

### 3. **Edge Functions** (`supabase/functions/`)

| Function | Role | Purpose |
|----------|------|---------|
| `create-session` | student | Create tutoring sessions with status `pending_payment` |
| `confirm-payment` | service_role | Confirm payment, apply 90/10 split, update session to `confirmed` |
| `complete-session` | tutor/admin | Mark session as `completed`, enable ratings |
| `create-rating` | student/parent | Rate tutors (1-5 stars + comment) after session completion |
| `tutor-earnings-summary` | tutor | View total earnings, session count, recent payments |

### 4. **Row Level Security**
- All tables have RLS enabled
- Students: Can only see/edit their own data
- Parents: Can see their children's data via `parent_child_links`
- Tutors: Can see sessions/payments where they're the tutor
- Service role: Bypasses RLS for secure backend operations

### 5. **Documentation** (`docs/backend-api.md`)
- Complete API reference with curl examples
- Database schema documentation
- Payment gateway integration guide (WiPay/FAC)
- Testing instructions
- Security checklist

## 🚀 Next Steps

### 1. Set Up Supabase Project
```bash
# If you haven't already:
# 1. Create a Supabase project at https://supabase.com
# 2. Get your project credentials
```

### 2. Run Migrations
Execute the SQL migration files in order:

**Option A: Supabase Dashboard**
1. Go to SQL Editor in your Supabase dashboard
2. Copy/paste each migration file content
3. Run them in order: 001 → 002 → 003

**Option B: psql (if you have direct access)**
```bash
psql -h db.<project-ref>.supabase.co -U postgres -d postgres -f supabase/migrations/001_create_payments_table.sql
psql -h db.<project-ref>.supabase.co -U postgres -d postgres -f supabase/migrations/002_sessions_rls_policies.sql
psql -h db.<project-ref>.supabase.co -U postgres -d postgres -f supabase/migrations/003_ratings_rls_policies.sql
```

### 3. Deploy Edge Functions
```bash
# Install Supabase CLI if needed
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref <your-project-ref>

# Deploy all functions
supabase functions deploy create-session
supabase functions deploy confirm-payment
supabase functions deploy complete-session
supabase functions deploy create-rating
supabase functions deploy tutor-earnings-summary
```

### 4. Set Environment Variables
In Supabase Dashboard → Settings → Edge Functions → Secrets:
```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Future payment gateway keys
WIPAY_SECRET_KEY=<will-add-later>
WIPAY_MERCHANT_ID=<will-add-later>
```

### 5. Test the Functions
Use the curl examples in `docs/backend-api.md` to test each endpoint:

```bash
# Example: Create a session
curl -X POST https://<project-ref>.supabase.co/functions/v1/create-session \
  -H "Authorization: Bearer <student-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "tutor_id": "<tutor-uuid>",
    "subject": "Mathematics",
    "level": "CSEC"
  }'
```

## 💰 Payment Flow

1. **Student/Parent creates session** → status: `pending_payment`
2. **Payment gateway webhook calls `confirm-payment`** → 
   - Inserts payment record with 90/10 split
   - Updates session status to `confirmed`
3. **Tutor completes session** → status: `completed`
4. **Student/Parent submits rating** → Tutor receives feedback

## 🔒 Security Notes

- ✅ All payments go through service role (bypasses RLS)
- ✅ Students can only create sessions for themselves
- ✅ Parents need `parent_child_links` to access children's data
- ✅ Tutors can only see their own sessions and payments
- ⚠️ **TODO**: Implement WiPay/FAC signature verification in `confirm-payment`

## 🛠 Technology Stack

- **Database**: PostgreSQL (via Supabase)
- **Backend**: Deno Edge Functions
- **Auth**: Supabase Auth
- **Security**: Row Level Security (RLS)
- **Currency**: TTD (Trinidad & Tobago Dollars)
- **Payment Split**: 90% tutor / 10% platform

## 📚 Further Reading

- Full API documentation: `docs/backend-api.md`
- Type definitions: `src/types/supabase.ts`
- Migration files: `supabase/migrations/`
- Edge Functions: `supabase/functions/*/index.ts`

## 🎯 Current Status

All core backend functionality is implemented and ready for:
- Local testing
- Integration with payment gateways (WiPay/FAC)
- Frontend integration
- Production deployment

---

**Built for iTutor** - Empowering education in Trinidad & Tobago 🇹🇹



