# iTutor Payments System - WiPay Integration (MVP)

## Overview

This payment system implements prepayment with parent approval gating for Trinidad & Tobago using WiPay as the payment provider. The system includes:

- **Parent Approval**: Parents must approve and pay for their children's booking requests
- **Prepayment**: Payment is captured before session confirmation
- **Tiered Platform Fees**: 10% (<$50), 15% ($50-$199), 20% (≥$200)
- **Payout Tracking**: Ledger system for tutor payouts (no automatic transfers in MVP)
- **Escrow-style Flow**: Funds held until session completion

## Architecture

```
Student Request → Parent Approval → Payment → Tutor Receives → Tutor Accepts → Session Confirmed
                                                                                        ↓
                                                                            Session Completed
                                                                                        ↓
                                                                         Payout Released
```

## Database Schema

### New Tables

1. **`tutor_payout_accounts`** - Tutor bank/payout account information
2. **`payments`** - Payment transaction records
3. **`payout_ledger`** - Tutor earnings tracking

### Extended Tables

1. **`bookings`** - Added payment fields (payer_id, payment_status, fees, etc.)
2. **`sessions`** - Added payment fields (payer_id, payment_status, fees, etc.)

## Key Functions

### Platform Fee Calculation

```sql
SELECT * FROM compute_platform_fee(150.00);
-- Returns: pct=15, fee=22.50, payout=127.50
```

### Payment Flow Functions

- `get_payer_for_student(student_id)` - Determines who pays (parent or student)
- `complete_booking_payment(booking_id, payment_id, reference)` - Marks payment as successful
- `mark_session_completed_with_payout(session_id)` - Creates payout ledger entry
- `release_payout(session_id)` - Marks payout as released (admin only)

## Installation Steps

### 1. Run Database Migrations

Execute migrations in order:

```bash
# From Supabase SQL Editor or using migration tool

# 1. Create payment tables and extend existing tables
# Run: src/supabase/migrations/020_payments_system.sql

# 2. Create payment functions
# Run: src/supabase/migrations/021_payment_functions.sql

# 3. Integrate payments into booking creation
# Run: src/supabase/migrations/022_integrate_payments_into_bookings.sql

# 4. Add RLS policies for payment tables
# Run: src/supabase/migrations/023_payment_rls_policies.sql

# 5. Grandfather existing bookings (mark as paid)
# Run: GRANDFATHER_EXISTING_BOOKINGS.sql
```

### 2. Environment Variables

Add to `.env.local`:

```env
# WiPay Configuration
WIPAY_API_KEY=your_wipay_api_key
WIPAY_MERCHANT_ID=your_merchant_id
WIPAY_BASE_URL=https://api.wipay.com/v1  # Or sandbox URL for testing
WIPAY_WEBHOOK_SECRET=your_webhook_secret

# App URLs (for payment redirects)
NEXT_PUBLIC_APP_URL=http://localhost:3000  # or production URL

# Supabase (should already exist)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Update Notification Types (if needed)

If you encounter notification type errors, run:

```sql
-- Add new payment notification types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  -- ... existing types ...
  'payment_succeeded',
  'payment_failed',
  'booking_request_received'
  -- ... other types ...
));
```

## WiPay Configuration

### Current Status: **STUB MODE**

The WiPay client (`lib/payments/wipayClient.ts`) is currently in stub mode for development. It:

- Returns mock transaction IDs
- Redirects to success page immediately
- Does NOT make actual API calls to WiPay
- Does NOT verify webhook signatures properly

### To Enable Real WiPay Integration

1. **Obtain WiPay Credentials**:
   - API Key
   - Merchant ID
   - Webhook Secret
   - Get API documentation from WiPay

2. **Update `lib/payments/wipayClient.ts`**:
   - Replace the `TODO` sections with actual WiPay API calls
   - Implement signature verification
   - Update error handling

3. **Configure Webhook URL**:
   - Set up webhook URL in WiPay dashboard: `https://yourdomain.com/api/payments/wipay/webhook`
   - Ensure webhook includes the transaction ID and status

4. **Test Integration**:
   - Use WiPay sandbox/test environment first
   - Verify payment flow end-to-end
   - Test webhook callbacks

## Testing the System

### Test Flow (Stub Mode)

1. **Create Test Accounts**:
   ```sql
   -- Parent account
   -- Child account (linked to parent)
   -- Tutor account
   ```

2. **Create Booking Request**:
   - Login as child
   - Request a tutoring session
   - Should go to parent for approval

3. **Parent Approval**:
   - Login as parent
   - Go to "Booking Requests"
   - Click "Approve"
   - Should redirect to payment page

4. **Payment (Stub Mode)**:
   - Review payment summary
   - Click "Pay with WiPay"
   - Should redirect to success page immediately
   - Mock transaction ID will be created

5. **Tutor Receives Request**:
   - Login as tutor
   - Check "Booking Requests"
   - Should see the paid request
   - Accept the booking

6. **Session Confirmation**:
   - Check student/parent dashboard
   - Should see confirmed session

### Manual Webhook Testing (Stub Mode)

You can test the webhook manually using curl:

```bash
curl -X POST http://localhost:3000/api/payments/wipay/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "mock_txn_12345",
    "status": "success",
    "amount": 100.00,
    "currency": "TTD"
  }'
```

## Payment Flow Details

### For Parent-Linked Students

1. Student creates booking request → Status: `PENDING_PARENT_APPROVAL`
2. Parent approves → Redirects to payment page
3. Parent pays → Payment status: `paid`, Booking status: `PENDING`
4. Tutor receives notification of paid request
5. Tutor accepts → Booking status: `CONFIRMED`, Session created
6. Session occurs → Session status: `COMPLETED_ASSUMED`
7. System creates payout ledger entry → Payout status: `release_ready`
8. Admin releases payout → Payout status: `released`

### For Independent Students (Future)

1. Student creates booking request → Redirects to payment page immediately
2. Student pays → Booking status: `PENDING`
3. (Continue from step 4 above)

## Platform Fee Tiers

| Price Range (TTD) | Fee % | Example (Price → Fee → Tutor Gets) |
|-------------------|-------|-------------------------------------|
| < $50             | 10%   | $40 → $4 → $36                     |
| $50 - $199        | 15%   | $100 → $15 → $85                   |
| ≥ $200            | 20%   | $250 → $50 → $200                  |

## API Endpoints

### `/api/payments/wipay/initiate` (POST)

**Purpose**: Initiates a payment with WiPay

**Request**:
```json
{
  "bookingId": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "paymentId": "uuid",
  "paymentUrl": "https://wipay.com/checkout/...",
  "transactionId": "wipay_txn_12345",
  "amount": 100.00,
  "currency": "TTD"
}
```

### `/api/payments/wipay/webhook` (POST)

**Purpose**: Receives payment status updates from WiPay

**Expected Payload**:
```json
{
  "transaction_id": "wipay_txn_12345",
  "status": "success",
  "amount": 100.00,
  "currency": "TTD"
}
```

**Response**:
```json
{
  "received": true,
  "status": "success",
  "message": "Payment completed successfully"
}
```

## Frontend Pages

### `/payments/checkout?bookingId=<id>`

Payment checkout page showing:
- Session details (subject, tutor, date/time, duration)
- Payment breakdown (price, platform fee, tutor payout)
- "Pay with WiPay" button
- Security notice

### `/payments/success?bookingId=<id>`

Payment success/receipt page showing:
- Success confirmation
- Payment receipt with transaction ID
- Session details
- Next steps information
- Print receipt option

## Security Considerations

1. **RLS Policies**: All payment tables have RLS enabled
2. **Service Role**: Webhook uses service role to bypass RLS
3. **Signature Verification**: Webhook should verify WiPay signature (TODO)
4. **Payment Authorization**: Only payer can initiate payment for their bookings
5. **Double Payment Prevention**: System checks if booking already paid

## Known Limitations (MVP)

1. **No Automatic Payouts**: Payouts are tracked in ledger but not automatically transferred
2. **No Refunds**: Refund logic not implemented (manual process)
3. **No Payment Disputes**: No dispute resolution flow
4. **No Multiple Payment Methods**: Only WiPay supported
5. **No Payment Plans**: Single payment only
6. **Stub WiPay Integration**: Real WiPay API not yet implemented

## Future Enhancements

1. Implement real WiPay API integration
2. Add automated payout processing
3. Add refund functionality
4. Add payment plan support (installments)
5. Add payment history/invoice downloads
6. Add dispute resolution workflow
7. Add support for multiple payment providers
8. Add payment reminders
9. Add partial payments for long sessions
10. Add promotional codes/discounts

## Troubleshooting

### Payment Not Completing

1. Check browser console for errors
2. Verify environment variables are set
3. Check Supabase logs for RPC errors
4. Verify payment record was created in `payments` table
5. Check webhook logs in API route

### Webhook Not Working

1. Verify webhook URL is correct in WiPay dashboard
2. Check that service role key is set correctly
3. Test webhook manually with curl
4. Check for signature verification errors

### RLS Permission Errors

1. Verify all policies are created correctly
2. Check that service role key is used in webhook
3. Verify user is authenticated when initiating payment

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Supabase logs
3. Check browser console for frontend errors
4. Review API route logs for backend errors

---

**Status**: ✅ MVP Complete - Stub Mode
**Next Step**: Integrate real WiPay API when credentials are available







