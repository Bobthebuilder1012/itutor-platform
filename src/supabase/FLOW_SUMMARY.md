# iTutor End-to-End Flow Summary

This document describes the complete lifecycle of a tutoring session from booking through payment to tutor payout, mapping each step to the relevant database tables and operations.

---

## Overview of Key Flows

1. **User Onboarding Flow** (Students, Parents, Tutors)
2. **Tutor Verification Flow** (Certificate upload & approval)
3. **Session Booking Flow** (Discovery → Booking → Scheduling)
4. **Payment Flow** (WiPay/FAC → Confirmation → Split)
5. **Rating Flow** (Post-session feedback)
6. **Earnings & Balance Flow** (Accumulation of tutor funds)
7. **Payout Flow** (Withdrawal request → Admin approval → Payment)

---

## 1. User Onboarding Flow

### 1.1 Student Self-Registration

**Steps:**
1. User signs up via Supabase Auth (email/password)
2. Auth creates entry in `auth.users`
3. Frontend/backend creates profile in `profiles`:
   ```
   INSERT INTO profiles (
     id,  -- matches auth.uid()
     role = 'student',
     full_name,
     email,
     phone_number,
     country,
     region,
     school,
     form_level,
     subjects_of_study,  -- array of subject names
     billing_mode  -- 'parent_required' or 'self_allowed'
   )
   ```

**Tables Touched:**
- `auth.users` (Supabase Auth)
- `profiles` (INSERT)

**Result:**
- Student can now browse tutors and (if billing_mode = 'self_allowed') book sessions

---

### 1.2 Parent Registration + Child Account Creation

**Steps:**
1. Parent signs up via Supabase Auth
2. Profile created with `role = 'parent'`:
   ```
   INSERT INTO profiles (
     id,  -- parent auth.uid()
     role = 'parent',
     full_name,
     email,
     phone_number,
     country
   )
   ```
3. Parent creates child student profiles (via UI):
   ```
   INSERT INTO profiles (
     id,  -- generated uuid (NOT auth user, just profile)
     role = 'student',
     full_name,
     email,  -- optional, or shared with parent
     dob,
     school,
     form_level,
     subjects_of_study,
     billing_mode = 'parent_required'
   )
   ```
4. Link parent to child:
   ```
   INSERT INTO parent_child_links (
     parent_id,  -- parent's auth.uid()
     child_id    -- child's profile.id
   )
   ```

**Tables Touched:**
- `profiles` (INSERT for parent, INSERT for each child)
- `parent_child_links` (INSERT for each child)

**Result:**
- Parent can book sessions on behalf of children
- Parent pays for all child sessions
- Parent sees unified dashboard of all children's activity

---

### 1.3 Tutor Registration

**Steps:**
1. Tutor signs up via Supabase Auth
2. Profile created with `role = 'tutor'`:
   ```
   INSERT INTO profiles (
     id,  -- tutor auth.uid()
     role = 'tutor',
     full_name,
     email,
     phone_number,
     country,
     region,
     tutor_type,  -- 'professional_teacher', 'university_tutor', 'graduate_tutor'
     teaching_mode  -- 'online', 'in_person', 'both'
   )
   ```
3. Tutor selects subjects and sets TT$ rates:
   ```
   INSERT INTO tutor_subjects (
     tutor_id,
     subject_id,  -- FK to subjects table
     price_per_hour_ttd,
     mode  -- 'online', 'in_person', 'either'
   )
   -- Repeat for each subject tutor wants to teach
   ```
4. Tutor uploads certificates for verification (optional but recommended)

**Tables Touched:**
- `profiles` (INSERT)
- `tutor_subjects` (INSERT, multiple rows)

**Result:**
- Tutor appears in search results for their subjects
- Students/parents can browse and book sessions with tutor

---

## 2. Tutor Verification Flow

### Purpose
Verify tutor's CSEC/CAPE results to build trust and improve ranking.

**Steps:**
1. Tutor uploads certificate image(s) via UI
2. Image stored in Supabase Storage, URL returned
3. Create verification record:
   ```
   INSERT INTO tutor_verifications (
     tutor_id,
     status = 'pending',
     uploaded_doc_url  -- storage URL
   )
   ```
4. Admin reviews certificate in admin dashboard
5. Admin (or OCR system) extracts grades:
   - Subject name (e.g., "Additional Mathematics")
   - Grade (e.g., "1", "2", "3")
   - Exam type ("CSEC" or "CAPE")
6. Admin approves verification:
   ```
   UPDATE tutor_verifications
   SET 
     status = 'approved',
     verified_at = now(),
     verified_by = admin_id
   WHERE id = verification_id
   ```
7. Create immutable verified grade records:
   ```
   INSERT INTO tutor_verified_subject_grades (
     verification_id,
     tutor_id,
     exam_type,
     subject_name,
     grade,
     display = true
   )
   -- Repeat for each subject on certificate
   ```

**Tables Touched:**
- `tutor_verifications` (INSERT, then UPDATE)
- `tutor_verified_subject_grades` (INSERT, multiple rows)

**Result:**
- Tutor profile shows "Verified" badge
- Verified grades displayed publicly (if display = true)
- Tutor ranks higher in search results
- Students/parents have more trust in tutor's qualifications

**Immutability:**
- Tutor CANNOT edit `subject_name` or `grade` fields
- Tutor CAN toggle `display` to hide/show specific grades
- Only admins can modify verified grades (for corrections)

---

## 3. Session Booking Flow

### 3.1 Tutor Discovery

**Steps:**
1. Student or parent browses tutors by:
   - Subject
   - Curriculum (CSEC/CAPE)
   - Level (Form 4, Unit 1, etc.)
   - Mode (online/in-person)
   - Price range
   - Rating

2. Backend queries:
   ```sql
   SELECT 
     p.*,
     ts.price_per_hour_ttd,
     ts.mode,
     -- Verified grades if display = true
     -- Average rating, rating count
   FROM profiles p
   JOIN tutor_subjects ts ON p.id = ts.tutor_id
   JOIN subjects s ON ts.subject_id = s.id
   WHERE 
     p.role = 'tutor'
     AND s.name = 'Physics'  -- example filter
     AND s.curriculum = 'CSEC'
     AND s.level = 'Form 4'
     AND ts.price_per_hour_ttd <= 150.00
   ORDER BY p.rating_average DESC, p.rating_count DESC
   ```

**Tables Touched:**
- `profiles` (SELECT)
- `tutor_subjects` (SELECT)
- `subjects` (SELECT)
- `tutor_verified_subject_grades` (SELECT where display = true)

---

### 3.2 Session Creation (Booking)

**Who books:**
- Student (if billing_mode = 'self_allowed')
- Parent (on behalf of child)

**Steps:**
1. User selects tutor, date/time, duration
2. System calculates amount:
   ```
   amount_ttd = (price_per_hour_ttd * duration_minutes) / 60
   ```
3. Create session record:
   ```
   INSERT INTO sessions (
     student_id,
     tutor_id,
     subject_id,
     payer_id,  -- parent.id or student.id
     status = 'booked',
     payment_status = 'unpaid',
     scheduled_start,
     scheduled_end,
     duration_minutes,
     price_per_hour_ttd,
     amount_ttd
   )
   ```
4. System may send notification to tutor (outside DB)

**Tables Touched:**
- `sessions` (INSERT)

**Result:**
- Session is "booked" but not yet paid
- Tutor sees pending session in their dashboard
- Payer must now complete payment

---

## 4. Payment Flow (TTD via WiPay/FAC)

### 4.1 Payment Initiation

**Steps:**
1. Payer clicks "Pay Now" for a session
2. Backend generates payment intent:
   ```javascript
   const paymentData = {
     amount: session.amount_ttd,
     currency: 'TTD',
     session_id: session.id,
     return_url: 'https://itutor.com/payment/callback',
     webhook_url: 'https://itutor.com/api/payment/webhook'
   }
   ```
3. Payer redirected to WiPay/FAC checkout page
4. Create pending payment record:
   ```
   INSERT INTO payments (
     session_id,
     student_id,
     payer_id,
     tutor_id,
     amount_ttd,
     gateway = 'WiPay',  -- or 'FAC'
     gateway_reference,  -- from WiPay/FAC
     status = 'PENDING'
   )
   ```
5. Update session:
   ```
   UPDATE sessions
   SET payment_status = 'pending'
   WHERE id = session_id
   ```

**Tables Touched:**
- `payments` (INSERT)
- `sessions` (UPDATE payment_status)

---

### 4.2 Payment Confirmation (Gateway Webhook)

**Steps:**
1. WiPay/FAC sends webhook to backend when payment succeeds
2. Backend verifies webhook signature
3. Backend updates payment record:
   ```
   UPDATE payments
   SET 
     status = 'SUCCESS',
     confirmed_at = now(),
     raw_payload = <webhook JSON>
   WHERE gateway_reference = <reference from webhook>
   ```
4. Backend updates session:
   ```
   UPDATE sessions
   SET payment_status = 'paid'
   WHERE id = session_id
   ```

**Tables Touched:**
- `payments` (UPDATE)
- `sessions` (UPDATE)

---

### 4.3 Revenue Split (90% Tutor / 10% iTutor)

**Triggered by:** Payment status = SUCCESS

**Steps:**
1. Calculate split:
   ```javascript
   const gross_amount_ttd = payment.amount_ttd;
   const tutor_share_ttd = (gross_amount_ttd * 0.90).toFixed(2);
   const commission_ttd = (gross_amount_ttd * 0.10).toFixed(2);
   ```

2. Create tutor earnings record:
   ```
   INSERT INTO tutor_earnings (
     tutor_id,
     session_id,
     payment_id,
     gross_amount_ttd,
     tutor_share_ttd,
     commission_ttd,
     status = 'EARNED'
   )
   ```

3. Update tutor balance:
   ```
   INSERT INTO tutor_balances (tutor_id, available_ttd)
   VALUES (tutor_id, tutor_share_ttd)
   ON CONFLICT (tutor_id) 
   DO UPDATE SET
     available_ttd = tutor_balances.available_ttd + EXCLUDED.available_ttd,
     last_updated = now()
   ```

4. Record platform commission:
   ```
   INSERT INTO commission_ledger (
     session_id,
     tutor_id,
     payment_id,
     commission_ttd
   )
   ```

**Tables Touched:**
- `tutor_earnings` (INSERT)
- `tutor_balances` (INSERT or UPDATE)
- `commission_ledger` (INSERT)

**Result:**
- Tutor sees increased `available_ttd` in their balance
- iTutor tracks commission for revenue reporting
- Session is now fully paid and ready to be delivered

---

## 5. Session Delivery & Completion

**Steps:**
1. Scheduled session time arrives
2. Tutor may update session status:
   ```
   UPDATE sessions
   SET 
     status = 'in_progress',
     updated_at = now()
   WHERE id = session_id AND tutor_id = auth.uid()
   ```
3. After session ends, tutor marks complete:
   ```
   UPDATE sessions
   SET 
     status = 'completed',
     updated_at = now()
   WHERE id = session_id AND tutor_id = auth.uid()
   ```

**Tables Touched:**
- `sessions` (UPDATE status)

**Result:**
- Session is now eligible for rating by student

---

## 6. Rating Flow

### 6.1 Student Rates Tutor

**Trigger:** Session status = 'completed'

**Steps:**
1. Student prompted to rate session
2. Student submits rating:
   ```
   INSERT INTO ratings (
     session_id,
     student_id,
     tutor_id,
     stars,  -- 1-5
     comment  -- optional
   )
   ```
3. **Trigger fires**: `ratings_update_tutor_stats`
4. Trigger updates tutor profile:
   ```
   UPDATE profiles
   SET 
     rating_count = (SELECT COUNT(*) FROM ratings WHERE tutor_id = <id>),
     rating_average = (SELECT AVG(stars) FROM ratings WHERE tutor_id = <id>)
   WHERE id = tutor_id
   ```

**Tables Touched:**
- `ratings` (INSERT)
- `profiles` (UPDATE via trigger)

**Result:**
- Tutor's rating_average and rating_count are updated
- Rating visible to other students/parents browsing tutors
- Higher ratings improve tutor's search ranking

---

## 7. Earnings & Balance Flow

### 7.1 Tutor Views Earnings

**Steps:**
1. Tutor accesses earnings dashboard
2. Backend queries:
   ```sql
   -- Total earnings to date
   SELECT SUM(tutor_share_ttd) AS total_earned
   FROM tutor_earnings
   WHERE tutor_id = auth.uid() AND status = 'EARNED'
   
   -- Current withdrawable balance
   SELECT available_ttd, pending_ttd
   FROM tutor_balances
   WHERE tutor_id = auth.uid()
   
   -- Earnings history
   SELECT 
     te.*,
     s.scheduled_start,
     s.subject_id,
     p.confirmed_at
   FROM tutor_earnings te
   JOIN sessions s ON te.session_id = s.id
   JOIN payments p ON te.payment_id = p.id
   WHERE te.tutor_id = auth.uid()
   ORDER BY te.created_at DESC
   ```

**Tables Touched:**
- `tutor_earnings` (SELECT)
- `tutor_balances` (SELECT)
- `sessions` (JOIN)
- `payments` (JOIN)

**Result:**
- Tutor sees:
  - Total lifetime earnings
  - Available balance (withdrawable)
  - Pending balance (if any holds)
  - Detailed earnings history per session

---

## 8. Payout Flow

### 8.1 Tutor Requests Payout

**Steps:**
1. Tutor checks available balance
2. Tutor submits payout request:
   ```
   INSERT INTO payout_requests (
     tutor_id,
     amount_requested_ttd,  -- must be <= available_ttd
     status = 'PENDING',
     payment_method,  -- 'BankTransfer', 'WiPayWallet', etc.
     payout_details  -- jsonb with bank account or wallet info
   )
   ```
3. System may optionally move funds to pending:
   ```
   UPDATE tutor_balances
   SET 
     available_ttd = available_ttd - amount_requested_ttd,
     pending_ttd = pending_ttd + amount_requested_ttd
   WHERE tutor_id = tutor_id
   ```
   (This prevents over-withdrawal while request is being processed)

**Tables Touched:**
- `payout_requests` (INSERT)
- `tutor_balances` (UPDATE, optional)

**Result:**
- Admin sees new payout request in admin dashboard
- Tutor's request is marked PENDING

---

### 8.2 Admin Reviews & Approves Payout

**Steps:**
1. Admin views payout request in dashboard
2. Admin verifies:
   - Tutor has sufficient balance
   - Bank/wallet details are correct
   - No fraud flags
3. Admin approves:
   ```
   UPDATE payout_requests
   SET 
     status = 'APPROVED',
     approved_by = admin_id,
     approved_at = now()
   WHERE id = payout_request_id
   ```

**Tables Touched:**
- `payout_requests` (UPDATE)

---

### 8.3 Admin Executes Payout (Real-World Transfer)

**Steps:**
1. Admin initiates real-world TT$ transfer:
   - Bank transfer (manual or API)
   - WiPay wallet transfer
   - Cash pickup
   - Other method
2. Once transfer is confirmed successful, admin marks as paid:
   ```
   UPDATE payout_requests
   SET 
     status = 'PAID',
     paid_at = now(),
     admin_notes = 'Transferred via bank to account ending in 1234'
   WHERE id = payout_request_id
   ```
3. Update tutor balance (if not already moved to pending):
   ```
   UPDATE tutor_balances
   SET 
     available_ttd = available_ttd - amount_requested_ttd,
     -- OR if using pending:
     pending_ttd = pending_ttd - amount_requested_ttd,
     last_updated = now()
   WHERE tutor_id = tutor_id
   ```

**Tables Touched:**
- `payout_requests` (UPDATE)
- `tutor_balances` (UPDATE)

**Result:**
- Tutor's balance reduced by payout amount
- Payout request marked as PAID
- Tutor receives real-world TT$ funds

---

## Summary: Complete Session Lifecycle

```
1. ONBOARDING
   └─> profiles (student/parent/tutor)
   └─> parent_child_links (if parent)
   └─> tutor_subjects (if tutor)

2. VERIFICATION (optional, tutors only)
   └─> tutor_verifications
   └─> tutor_verified_subject_grades

3. BOOKING
   └─> sessions (status: booked, payment_status: unpaid)

4. PAYMENT
   └─> payments (status: PENDING)
   └─> sessions (payment_status: pending)
   └─> [Gateway processes payment]
   └─> payments (status: SUCCESS)
   └─> sessions (payment_status: paid)
   └─> tutor_earnings (90% split)
   └─> tutor_balances (available_ttd increased)
   └─> commission_ledger (10% recorded)

5. DELIVERY
   └─> sessions (status: in_progress → completed)

6. RATING
   └─> ratings (stars, comment)
   └─> profiles.rating_average & rating_count updated (trigger)

7. EARNINGS TRACKING
   └─> tutor views tutor_earnings + tutor_balances

8. PAYOUT
   └─> payout_requests (status: PENDING)
   └─> [Admin reviews]
   └─> payout_requests (status: APPROVED)
   └─> [Admin executes real-world transfer]
   └─> payout_requests (status: PAID)
   └─> tutor_balances (available_ttd decreased)
```

---

## Key Integration Points

### With WiPay/FAC Gateway
- **Checkout initiation**: Pass session details + amount_ttd
- **Webhook endpoint**: Receive payment confirmation, verify signature
- **Idempotency**: Use gateway_reference to prevent duplicate processing

### With Supabase Auth
- **Profile creation**: Link profiles.id to auth.uid()
- **RLS policies**: Use auth.uid() to enforce access control

### With Supabase Storage
- **Certificate images**: Store in `tutor-certificates` bucket
- **URLs**: Store in tutor_verifications.uploaded_doc_url

### With Notification System (Future)
- Session reminders
- Payment confirmations
- Payout status updates
- Rating requests

---

## Error Handling & Edge Cases

### Payment Failures
- If payment fails, payment.status = 'FAILED'
- Session remains with payment_status = 'unpaid'
- No earnings or balance updates occur
- User can retry payment

### Session Cancellations
- Update session.status = 'cancelled'
- If already paid, may trigger refund flow (future feature)
- If unpaid, simply mark cancelled

### Insufficient Balance for Payout
- Frontend should prevent submission if amount > available_ttd
- Backend should validate before INSERT into payout_requests
- If validation fails, reject with error message

### Duplicate Ratings
- Unique constraint on ratings.session_id prevents duplicates
- If student tries to rate twice, INSERT will fail
- Frontend can check if rating exists before showing form

---

## Monitoring & Analytics Queries

### Platform Revenue
```sql
SELECT SUM(commission_ttd) AS total_revenue
FROM commission_ledger;
```

### Top Tutors by Earnings
```sql
SELECT 
  p.full_name,
  SUM(te.tutor_share_ttd) AS total_earnings
FROM tutor_earnings te
JOIN profiles p ON te.tutor_id = p.id
WHERE te.status = 'EARNED'
GROUP BY p.id, p.full_name
ORDER BY total_earnings DESC
LIMIT 10;
```

### Payment Volume by Date
```sql
SELECT 
  DATE(confirmed_at) AS payment_date,
  COUNT(*) AS num_payments,
  SUM(amount_ttd) AS total_ttd
FROM payments
WHERE status = 'SUCCESS'
GROUP BY DATE(confirmed_at)
ORDER BY payment_date DESC;
```

### Pending Payouts
```sql
SELECT 
  pr.*,
  p.full_name AS tutor_name,
  tb.available_ttd AS current_balance
FROM payout_requests pr
JOIN profiles p ON pr.tutor_id = p.id
LEFT JOIN tutor_balances tb ON pr.tutor_id = tb.tutor_id
WHERE pr.status IN ('PENDING', 'APPROVED')
ORDER BY pr.created_at ASC;
```












