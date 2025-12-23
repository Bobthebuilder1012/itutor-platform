# iTutor Backend API Documentation

This document describes the backend implementation for iTutor, built with Supabase Edge Functions and PostgreSQL with Row Level Security (RLS).

## Table of Contents
1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [Row Level Security](#row-level-security)
4. [Edge Functions](#edge-functions)
5. [Testing](#testing)
6. [Payment Gateway Integration](#payment-gateway-integration)

---

## Overview

iTutor uses Supabase for:
- **Authentication**: via `auth.users`
- **Database**: PostgreSQL with RLS
- **Backend Logic**: Edge Functions (Deno-based)

### Key Principles
- **TTD currency only** (Trinidad & Tobago Dollars)
- **90/10 split**: Tutors receive 90%, iTutor platform takes 10%
- **Role-based access**: student, parent, tutor, admin
- **Secure payments**: Only service role can insert/update payments

---

## Database Schema

### Tables

#### `profiles`
Extends `auth.users` with role and profile information.

```sql
id              UUID (PK, FK → auth.users.id)
role            TEXT ('student' | 'parent' | 'tutor' | 'admin')
full_name       TEXT
email           TEXT
phone           TEXT
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

#### `parent_child_links`
Links parents to their children.

```sql
id              UUID (PK)
parent_id       UUID (FK → profiles.id)
child_id        UUID (FK → profiles.id)
created_at      TIMESTAMPTZ
```

#### `sessions`
Tutoring sessions between students and tutors.

```sql
id              UUID (PK)
student_id      UUID (FK → profiles.id)
tutor_id        UUID (FK → profiles.id)
status          TEXT ('draft' | 'pending_payment' | 'confirmed' | 'completed' | 'cancelled')
subject         TEXT
level           TEXT (e.g., 'CSEC', 'CAPE', 'Form 1-3')
scheduled_start TIMESTAMPTZ
scheduled_end   TIMESTAMPTZ
created_at      TIMESTAMPTZ
completed_at    TIMESTAMPTZ
```

#### `ratings`
Tutor ratings from students and parents.

```sql
id              UUID (PK)
rater_id        UUID (FK → profiles.id, student or parent)
tutor_id        UUID (FK → profiles.id)
session_id      UUID (FK → sessions.id)
score           INTEGER (1-5)
comment         TEXT
created_at      TIMESTAMPTZ
```

**Unique constraint**: `(session_id, rater_id)` - one rating per session per rater

#### `payments`
Payment transactions in TTD with 90/10 split.

```sql
id                  UUID (PK)
session_id          UUID (FK → sessions.id ON DELETE CASCADE)
parent_id           UUID (FK → profiles.id, payer)
tutor_id            UUID (FK → profiles.id)
amount_ttd          NUMERIC(10,2) - total amount
tutor_share_ttd     NUMERIC(10,2) - 90% of amount
platform_fee_ttd    NUMERIC(10,2) - 10% of amount
status              TEXT ('pending' | 'confirmed' | 'failed' | 'refunded')
payment_method      TEXT (e.g., 'wipay', 'fac', 'cash', 'test')
external_reference  TEXT (gateway transaction ID)
created_at          TIMESTAMPTZ
```

**Indexes**: `session_id`, `parent_id`, `tutor_id`, `status`, `created_at`
**Unique constraint**: Only one confirmed payment per session

---

## Row Level Security

### Profiles
- Users can read their own profile
- Parents can read their children's profiles via `parent_child_links`

### Sessions
- **Students**: Can create and view their own sessions
- **Tutors**: Can view and update sessions where they are the tutor
- **Parents**: Can view their children's sessions
- **Service role**: Full access (for Edge Functions)

### Ratings
- **Students**: Can view and create ratings for their own completed sessions
- **Parents**: Can view and create ratings for their children's completed sessions
- **Tutors**: Can view all ratings about themselves
- **Unique constraint**: One rating per session per rater

### Payments
- **Parents**: Can view payments they made
- **Tutors**: Can view payments for their sessions
- **Admins**: Can view all payments
- **Service role**: Can insert/update payments (Edge Functions only)
- **No deletes**: Payments are immutable; use 'refunded' status for soft delete

---

## Edge Functions

All Edge Functions are located in `supabase/functions/<name>/index.ts`.

### 1. `create-session`

**Allowed roles**: student

**Purpose**: Students create new tutoring sessions.

**Request**:
```bash
POST /create-session
Authorization: Bearer <student-jwt>
Content-Type: application/json

{
  "tutor_id": "uuid",
  "subject": "Mathematics",
  "level": "CSEC",
  "scheduled_start": "2025-12-20T10:00:00Z",
  "scheduled_end": "2025-12-20T11:00:00Z"
}
```

**Response**:
```json
{
  "success": true,
  "session": { ...session object }
}
```

**Logic**:
1. Validates caller is a student
2. Validates tutor exists and has role 'tutor'
3. Creates session with `status = 'pending_payment'`
4. RLS ensures `student_id = auth.uid()`

---

### 2. `confirm-payment`

**Allowed roles**: service_role (gateway callbacks, admin tools)

**Purpose**: Confirms payment, applies 90/10 split, updates session status.

**⚠️ SECURITY**: This endpoint should ONLY be called by:
- Payment gateway webhooks (with signature verification)
- Admin tools (with service role key)
- Never exposed to client-side code

**Request**:
```bash
POST /confirm-payment
Authorization: Bearer <service-role-key>
Content-Type: application/json

{
  "session_id": "uuid",
  "parent_id": "uuid",
  "amount_ttd": 150.00,
  "payment_method": "wipay",
  "external_reference": "WIPAY_TX_12345"
}
```

**Response**:
```json
{
  "success": true,
  "payment": { ...payment object },
  "session": { ...updated session },
  "split": {
    "total_ttd": 150.00,
    "tutor_share_ttd": 135.00,
    "platform_fee_ttd": 15.00
  }
}
```

**Logic**:
1. Validates session exists
2. Checks for existing confirmed payment (prevents duplicates)
3. Verifies payer relationship (student or parent via `parent_child_links`)
4. Calculates split: `tutor_share = amount * 0.9`, `platform_fee = amount * 0.1`
5. Inserts payment with `status = 'confirmed'`
6. Updates `sessions.status` from `'pending_payment'` → `'confirmed'`

**TODO**: Implement gateway signature verification (e.g., WiPay, FAC)

---

### 3. `complete-session`

**Allowed roles**: tutor, admin

**Purpose**: Marks session as completed, enabling ratings.

**Request**:
```bash
POST /complete-session
Authorization: Bearer <tutor-jwt>
Content-Type: application/json

{
  "session_id": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "session": { ...updated session },
  "message": "Session marked as completed. Student and parent can now submit ratings."
}
```

**Logic**:
1. Validates caller is tutor or admin
2. Verifies tutor owns the session (unless admin)
3. Ensures session is in `'confirmed'` status
4. Updates `sessions.status` to `'completed'` and sets `completed_at`

---

### 4. `create-rating`

**Allowed roles**: student, parent

**Purpose**: Allows rating tutors after session completion.

**Request**:
```bash
POST /create-rating
Authorization: Bearer <student-or-parent-jwt>
Content-Type: application/json

{
  "session_id": "uuid",
  "score": 5,
  "comment": "Excellent tutor, very patient and knowledgeable!"
}
```

**Response**:
```json
{
  "success": true,
  "rating": { ...rating object },
  "message": "Rating submitted successfully"
}
```

**Logic**:
1. Validates caller is student or parent
2. Validates score is 1-5
3. Fetches session and ensures `status = 'completed'`
4. **Authorization**:
   - Students: Must be `session.student_id`
   - Parents: Must have link via `parent_child_links`
5. Checks for existing rating (one per session per rater)
6. Inserts rating with `rater_id = auth.uid()`

---

### 5. `tutor-earnings-summary`

**Allowed roles**: tutor

**Purpose**: Returns earnings summary for authenticated tutor.

**Request**:
```bash
GET /tutor-earnings-summary
Authorization: Bearer <tutor-jwt>
```

**Response**:
```json
{
  "success": true,
  "summary": {
    "total_earned_ttd": 1350.00,
    "total_sessions_paid": 10,
    "total_platform_fees_ttd": 150.00,
    "currency": "TTD"
  },
  "recent_payments": [
    {
      "id": "uuid",
      "session_id": "uuid",
      "amount_ttd": 150.00,
      "tutor_share_ttd": 135.00,
      "platform_fee_ttd": 15.00,
      "payment_method": "wipay",
      "created_at": "2025-12-01T10:00:00Z",
      "session_details": {
        "subject": "Mathematics",
        "level": "CSEC"
      }
    }
    // ... up to 10 most recent
  ]
}
```

**Logic**:
1. Validates caller is tutor
2. Fetches all confirmed payments where `tutor_id = auth.uid()`
3. Aggregates totals
4. Returns last 10 payments with session details
5. RLS ensures tutors only see their own payments

---

## Testing

### Manual Testing with cURL

#### 1. Create Session (as student)
```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/create-session \
  -H "Authorization: Bearer <student-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "tutor_id": "<tutor-uuid>",
    "subject": "Physics",
    "level": "CAPE",
    "scheduled_start": "2025-12-20T14:00:00Z",
    "scheduled_end": "2025-12-20T15:00:00Z"
  }'
```

#### 2. Confirm Payment (as service role - admin/gateway)
```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/confirm-payment \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "<session-uuid>",
    "parent_id": "<parent-uuid>",
    "amount_ttd": 200.00,
    "payment_method": "test"
  }'
```

#### 3. Complete Session (as tutor)
```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/complete-session \
  -H "Authorization: Bearer <tutor-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "<session-uuid>"}'
```

#### 4. Create Rating (as student)
```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/create-rating \
  -H "Authorization: Bearer <student-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "<session-uuid>",
    "score": 5,
    "comment": "Great session!"
  }'
```

#### 5. Get Tutor Earnings (as tutor)
```bash
curl https://<project-ref>.supabase.co/functions/v1/tutor-earnings-summary \
  -H "Authorization: Bearer <tutor-jwt>"
```

---

## Payment Gateway Integration

### Current State
Payment confirmation is implemented with **mock verification**. The `confirm-payment` endpoint accepts payment data and applies the 90/10 split, but does NOT verify signatures from real payment gateways.

### Future Integration (WiPay / FAC)

#### WiPay Integration Steps:
1. **Webhook setup**: Register iTutor's webhook URL with WiPay
2. **Signature verification**: Implement signature check in `confirm-payment`:
```typescript
function verifyWiPaySignature(payload: any, signature: string): boolean {
  const secret = Deno.env.get('WIPAY_SECRET_KEY')
  const computedSig = hmacSHA256(JSON.stringify(payload), secret)
  return computedSig === signature
}
```
3. **Update confirm-payment**: Add signature validation before processing
4. **Handle gateway states**: Map WiPay status codes to iTutor payment statuses
5. **Test with sandbox**: Use WiPay test environment before going live

#### FAC Integration:
Similar approach with FAC's specific API and webhook format.

### Security Checklist for Production:
- [ ] Implement gateway signature verification
- [ ] Use HTTPS for all webhook endpoints
- [ ] Log all payment attempts for audit trail
- [ ] Set up monitoring/alerts for failed payments
- [ ] Test refund flow
- [ ] Implement idempotency keys to prevent duplicate charges

---

## Environment Variables

Required for Edge Functions:

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Future payment gateway keys
WIPAY_SECRET_KEY=<wipay-secret>
WIPAY_MERCHANT_ID=<wipay-merchant-id>
FAC_API_KEY=<fac-key>
```

---

## Migration Files

Execute migrations in order:
1. `001_create_payments_table.sql` - Creates payments table with RLS
2. `002_sessions_rls_policies.sql` - Sessions RLS policies
3. `003_ratings_rls_policies.sql` - Ratings RLS policies

Run with:
```bash
psql -h <db-host> -U postgres -d postgres -f supabase/migrations/001_create_payments_table.sql
```

Or use Supabase Dashboard → SQL Editor

---

## Support

For questions or issues, contact the iTutor development team.



