# iTutor Supabase Backend Schema

This directory contains the complete Supabase/Postgres database schema for the iTutor platform MVP.

## 📁 Contents

- **`migrations/001_initial_schema.sql`** - Complete SQL migration to create all tables, constraints, indexes, and triggers
- **`RLS_POLICIES.md`** - Row-Level Security policy specifications in plain English
- **`FLOW_SUMMARY.md`** - End-to-end flow documentation showing how data moves through the system

## 🎯 Schema Overview

The iTutor schema is designed for a **TTD-only tutoring marketplace** connecting students, parents, and tutors in Trinidad & Tobago (with future Caribbean expansion).

### Core Design Principles

1. **TTD-only payments** via WiPay/FAC (no Stripe, no USD)
2. **90/10 split**: 90% to tutors, 10% to platform
3. **Unified profiles table** for all user roles (student, parent, tutor, admin)
4. **Parent-managed children** with billing and oversight
5. **Immutable verification** for tutor credentials (CSEC/CAPE results)
6. **Internal wallet system** for tutor balances and payouts
7. **Audit-friendly** with created_at/updated_at timestamps on all tables

## 📊 Database Tables (13 total)

### User & Relationship Tables
1. **profiles** - All users (students, parents, tutors, admins)
2. **parent_child_links** - Parent ↔ child relationships

### Academic Structure
3. **subjects** - CSEC/CAPE subjects with curriculum and level
4. **tutor_subjects** - Tutor-subject mappings with TTD hourly rates

### Verification System
5. **tutor_verifications** - Certificate upload records
6. **tutor_verified_subject_grades** - Immutable verified grades

### Core Transaction Tables
7. **sessions** - Tutoring session bookings
8. **ratings** - Student ratings of completed sessions

### Payment & Money Tables
9. **payments** - TTD payments from WiPay/FAC
10. **tutor_earnings** - Per-session earnings (90/10 split)
11. **tutor_balances** - Current tutor wallet balances
12. **commission_ledger** - Platform revenue tracking
13. **payout_requests** - Tutor withdrawal requests

## 🚀 Getting Started

### Prerequisites
- Supabase project (cloud or self-hosted)
- Postgres 14+ (Supabase default)
- Admin access to Supabase dashboard

### Installation Steps

1. **Run the migration**
   ```bash
   # Via Supabase CLI
   supabase migration new initial_schema
   # Copy contents of migrations/001_initial_schema.sql
   supabase db push
   
   # OR via Supabase Dashboard
   # SQL Editor → paste migration → Run
   ```

2. **Verify tables created**
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public'
   ORDER BY table_name;
   ```
   
   You should see all 13 tables listed above.

3. **Enable RLS on all tables**
   ```sql
   -- Already included in migration, but verify:
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public';
   ```

4. **Implement RLS policies**
   - Review `RLS_POLICIES.md`
   - Convert English policies to SQL `CREATE POLICY` statements
   - Test with different user roles

5. **Seed reference data**
   ```sql
   -- Example: Seed subjects
   INSERT INTO subjects (name, curriculum, level) VALUES
   ('Physics', 'CSEC', 'Form 4'),
   ('Physics', 'CSEC', 'Form 5'),
   ('Chemistry', 'CSEC', 'Form 4'),
   ('Additional Mathematics', 'CSEC', 'Form 5'),
   ('Biology', 'CAPE', 'Unit 1'),
   ('Biology', 'CAPE', 'Unit 2');
   -- Add more subjects as needed
   ```

## 🔐 Security Model

### Row-Level Security (RLS)

All tables have RLS enabled. Key access patterns:

- **Users** can read/update their own profiles
- **Parents** can read/manage their children's data (via parent_child_links)
- **Tutors** can read their earnings, balances, and payout requests
- **Admins** have full access to all tables
- **Backend service key** controls all money-related writes (payments, earnings, balances)

See `RLS_POLICIES.md` for complete policy specifications.

### Backend vs Client Operations

**Client (user authentication token):**
- Read own profile, sessions, ratings
- Create sessions (if authorized)
- Create ratings for completed sessions
- Create payout requests

**Backend (service key):**
- Write to `payments` after gateway confirmation
- Create `tutor_earnings` records
- Update `tutor_balances`
- Write to `commission_ledger`
- Update session `payment_status`

## 💰 Payment Flow Summary

1. **Session booked** → `sessions` (status: booked, payment_status: unpaid)
2. **Payment initiated** → `payments` (status: PENDING)
3. **WiPay/FAC webhook** → `payments` (status: SUCCESS)
4. **Backend splits revenue:**
   - `tutor_earnings` created (90% tutor, 10% platform)
   - `tutor_balances.available_ttd` increased
   - `commission_ledger` entry created
5. **Session delivered** → `sessions` (status: completed)
6. **Student rates** → `ratings` created, tutor stats updated via trigger
7. **Tutor requests payout** → `payout_requests` (status: PENDING)
8. **Admin approves & pays** → `payout_requests` (status: PAID), balance reduced

See `FLOW_SUMMARY.md` for detailed step-by-step flows.

## 🔍 Key Features

### Automatic Rating Updates
When a student rates a tutor, a trigger automatically updates the tutor's `rating_average` and `rating_count` in the `profiles` table.

### Immutable Financial Records
- `payments` - Cannot be deleted (audit trail)
- `tutor_earnings` - Cannot be deleted (ledger integrity)
- `commission_ledger` - Admin-only access
- `tutor_verified_subject_grades` - Tutors can hide but not edit grades

### Parent-Child Management
Parents can:
- Create multiple child profiles
- Book sessions for any linked child
- View all children's sessions and ratings
- Make payments for all children

Children cannot:
- Change their billing_mode
- Access payment methods
- Book sessions if billing_mode = 'parent_required'

## 📈 Useful Queries

### Get tutor's total earnings
```sql
SELECT SUM(tutor_share_ttd) AS total_earned
FROM tutor_earnings
WHERE tutor_id = '<tutor-uuid>' AND status = 'EARNED';
```

### Get tutor's current balance
```sql
SELECT available_ttd, pending_ttd
FROM tutor_balances
WHERE tutor_id = '<tutor-uuid>';
```

### Get platform revenue
```sql
SELECT SUM(commission_ttd) AS total_revenue
FROM commission_ledger;
```

### Find top-rated tutors for a subject
```sql
SELECT 
  p.full_name,
  p.rating_average,
  p.rating_count,
  ts.price_per_hour_ttd
FROM profiles p
JOIN tutor_subjects ts ON p.id = ts.tutor_id
JOIN subjects s ON ts.subject_id = s.id
WHERE 
  p.role = 'tutor'
  AND s.name = 'Physics'
  AND s.curriculum = 'CSEC'
ORDER BY p.rating_average DESC, p.rating_count DESC
LIMIT 10;
```

### Get parent's children and their recent sessions
```sql
SELECT 
  p.full_name AS child_name,
  s.scheduled_start,
  s.status,
  s.payment_status,
  sub.name AS subject
FROM parent_child_links pcl
JOIN profiles p ON pcl.child_id = p.id
LEFT JOIN sessions s ON p.id = s.student_id
LEFT JOIN subjects sub ON s.subject_id = sub.id
WHERE 
  pcl.parent_id = '<parent-uuid>'
  AND s.scheduled_start > NOW() - INTERVAL '30 days'
ORDER BY s.scheduled_start DESC;
```

## 🧪 Testing Recommendations

1. **Create test users** for each role:
   - Student (self-pay)
   - Student (parent-required)
   - Parent with multiple children
   - Tutor (verified and unverified)
   - Admin

2. **Test RLS policies** by attempting unauthorized actions:
   - Student trying to read another student's sessions
   - Tutor trying to modify payment records
   - Parent trying to access non-child data

3. **Test payment flow** with WiPay/FAC sandbox:
   - Successful payment
   - Failed payment
   - Webhook retry logic

4. **Test triggers**:
   - Rating insertion updates tutor stats
   - Updated_at timestamps auto-update

## 🔄 Migration Strategy

For production deployment:

1. **Backup existing data** (if any)
2. **Run migration in transaction**
3. **Verify all tables created**
4. **Enable RLS**
5. **Implement and test RLS policies**
6. **Seed reference data** (countries, regions, subjects)
7. **Monitor for errors**

## 📝 Future Enhancements

The following are NOT in MVP but can be added later:

- **Community tables**: Forums, posts, leaderboards
- **School tables**: Normalized school data with regional hierarchy
- **Messaging**: Direct student-tutor communication
- **Scheduling**: Tutor availability blocks
- **Reviews**: Separate from ratings (text reviews)
- **Refunds**: Refund tracking table
- **Promotions**: Discount codes and campaigns
- **Analytics**: Pre-computed stats tables
- **Cram sessions**: Premium rush booking type

## 🛠️ Maintenance

### Regular Tasks
- Monitor `payout_requests` for pending approvals
- Review `tutor_verifications` submissions
- Check `payments` for failures
- Audit `commission_ledger` for revenue reconciliation

### Performance Monitoring
- Monitor query performance on:
  - Tutor search/filtering
  - Session history queries
  - Earnings calculations
- Add indexes as needed based on slow query logs

### Data Integrity Checks
```sql
-- Verify balance accuracy
SELECT 
  tb.tutor_id,
  tb.available_ttd AS current_balance,
  COALESCE(SUM(te.tutor_share_ttd), 0) - COALESCE(SUM(pr.amount_requested_ttd), 0) AS calculated_balance
FROM tutor_balances tb
LEFT JOIN tutor_earnings te ON tb.tutor_id = te.tutor_id AND te.status = 'EARNED'
LEFT JOIN payout_requests pr ON tb.tutor_id = pr.tutor_id AND pr.status = 'PAID'
GROUP BY tb.tutor_id, tb.available_ttd
HAVING ABS(tb.available_ttd - (COALESCE(SUM(te.tutor_share_ttd), 0) - COALESCE(SUM(pr.amount_requested_ttd), 0))) > 0.01;
```

## 📚 Reference Documents

This schema is based on three core iTutor specification documents:

1. **iTutor Platform Foundation Document** - Vision, architecture, phases
2. **iTutor Core Functional Foundations** - Profiles, matching, sessions, verification
3. **iTutor TTD Payment Model** - Payment gateway integration, splits, balances, payouts

All design decisions trace back to these specifications.

## 🤝 Contributing

When modifying the schema:

1. Create a new migration file (don't edit existing ones)
2. Update this README with changes
3. Update RLS_POLICIES.md if access patterns change
4. Update FLOW_SUMMARY.md if data flow changes
5. Test thoroughly in development environment
6. Document breaking changes

## 📞 Support

For questions about:
- **Schema design**: See FLOW_SUMMARY.md
- **Security**: See RLS_POLICIES.md
- **Migration issues**: Check Supabase logs
- **Payment integration**: Review iTutor TTD Payment Model doc

---

**Version**: 1.0.0 (MVP)  
**Last Updated**: 2025-12-09  
**Database**: PostgreSQL 14+ (Supabase)  
**Currency**: TTD only  
**Region**: Trinidad & Tobago (MVP), Caribbean (future)









