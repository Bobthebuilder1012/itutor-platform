# iTutor Payments System - Quick Start Guide

## 🚀 Getting Started in 5 Minutes

This guide will help you get the payment system up and running quickly.

## Step 1: Run Database Migrations

Execute these SQL files in your Supabase SQL Editor in order:

1. **`src/supabase/migrations/020_payments_system.sql`**
   - Creates payment tables (tutor_payout_accounts, payments, payout_ledger)
   - Extends bookings and sessions tables with payment fields

2. **`src/supabase/migrations/021_payment_functions.sql`**
   - Creates platform fee calculation function
   - Creates payment processing functions

3. **`src/supabase/migrations/022_integrate_payments_into_bookings.sql`**
   - Updates booking creation to include payment calculations

4. **`src/supabase/migrations/023_payment_rls_policies.sql`**
   - Adds Row Level Security policies for payment tables

5. **`GRANDFATHER_EXISTING_BOOKINGS.sql`**
   - Marks all existing bookings/sessions as paid (no payment required)
   - Only affects existing data, new bookings will require payment

## Step 2: Add Environment Variables

Add these to your `.env.local` file:

```env
# WiPay Configuration (use placeholders for now - system will run in stub mode)
WIPAY_API_KEY=YOUR_API_KEY_HERE
WIPAY_MERCHANT_ID=YOUR_MERCHANT_ID_HERE
WIPAY_BASE_URL=https://api.wipay.com/v1
WIPAY_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET_HERE

# App URL (change for production)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> **Note**: The system will run in stub mode if you don't have real WiPay credentials. Payments will be mocked but the full flow will work.

## Step 3: Restart Your Development Server

```bash
npm run dev
```

## Step 4: Test the Payment Flow

### Create Test Accounts (if you don't have them already)

1. **Parent Account**: Sign up as a parent
2. **Child Account**: Add a child to the parent account
3. **Tutor Account**: Sign up as a tutor with at least one subject

### Test the Flow

1. **Login as Child**:
   - Go to "Find Tutors"
   - Request a session with a tutor
   - See message about parent approval

2. **Login as Parent**:
   - Go to "Booking Requests"
   - See the pending request
   - Click "Approve"
   - **You'll be redirected to the payment page**

3. **On Payment Page**:
   - Review the session details
   - See the payment breakdown (price, platform fee, tutor payout)
   - Click "Pay with WiPay"
   - **In stub mode**: Redirects to success page immediately

4. **On Success Page**:
   - See payment receipt
   - See transaction ID
   - See next steps

5. **Login as Tutor**:
   - Go to "Booking Requests"
   - See the paid request (marked as "Payment Received")
   - Accept the booking
   - Session is now confirmed

6. **Login as Student/Parent**:
   - See confirmed session in dashboard
   - Wait for scheduled time to join session

## What's Different Now?

### Before Payments System
```
Student Request → Tutor Accepts → Session Confirmed
```

### After Payments System
```
Student Request → Parent Approves → Parent Pays → Tutor Receives → Tutor Accepts → Session Confirmed
```

## Key Features Enabled

✅ **Parent Approval Gating**: Parents must approve child bookings  
✅ **Prepayment Required**: Payment before tutor sees request  
✅ **Tiered Platform Fees**: Automatic fee calculation (10%, 15%, 20%)  
✅ **Payment Receipts**: Professional receipts for all payments  
✅ **Payout Tracking**: Track what tutors are owed  
✅ **Grandfather Clause**: Existing bookings unaffected  

## Platform Fee Examples

| Session Price | Platform Fee | Tutor Gets |
|--------------|--------------|------------|
| $40 TTD      | $4 (10%)     | $36        |
| $100 TTD     | $15 (15%)    | $85        |
| $250 TTD     | $50 (20%)    | $200       |

## Stub Mode vs Production

### Stub Mode (Current)
- Mock transaction IDs
- Instant "payment" success
- No actual money transfer
- Perfect for development/testing

### Production Mode (When WiPay is configured)
- Real WiPay API calls
- Actual payment processing
- Webhook callbacks
- Real transaction IDs

## Troubleshooting

### "Payment not found" error
- Make sure you ran all migrations in order
- Check Supabase logs for errors

### "Unauthorized" when paying
- Verify you're logged in as the payer (parent or student)
- Check RLS policies are created

### Parent approval not redirecting to payment
- Clear browser cache
- Check console for errors
- Verify booking has `payer_id` set

### Payment page shows error
- Verify booking exists and is in correct status
- Check that booking has payment fields populated
- Review browser console for specific error

## Next Steps

1. **Test thoroughly** with different scenarios
2. **Get WiPay credentials** when ready for production
3. **Update `lib/payments/wipayClient.ts`** with real API calls
4. **Configure webhook URL** in WiPay dashboard
5. **Test with real payments** in WiPay sandbox first

## Need Help?

1. Check `PAYMENTS_SYSTEM_README.md` for detailed documentation
2. Review Supabase logs for backend errors
3. Check browser console for frontend errors
4. Verify all migrations ran successfully

---

**Current Status**: ✅ Ready to Test (Stub Mode)  
**Time to Production**: Configure WiPay API → Test → Deploy  

Happy testing! 🎉













