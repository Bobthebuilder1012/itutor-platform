// =====================================================
// WIPAY PAYMENT INITIATION API ROUTE
// =====================================================
// Initiates a payment with WiPay for a booking

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { WiPayClient } from '@/lib/payments/wipayClient';
import { isPaidClassesEnabled } from '@/lib/featureFlags/paidClasses';
import { paidClassesForbiddenResponse } from '@/lib/featureFlags/http';

export async function POST(request: NextRequest) {
  try {
    if (!isPaidClassesEnabled()) {
      return paidClassesForbiddenResponse();
    }

    const { bookingId } = await request.json();

    if (!bookingId) {
      return NextResponse.json(
        { error: 'Booking ID is required' },
        { status: 400 }
      );
    }

    // Initialize Supabase client with user session
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch booking with subject details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*, subjects(name, label)')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('Booking fetch error:', bookingError);
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Verify user is the payer
    if (booking.payer_id !== user.id) {
      return NextResponse.json(
        { error: 'Not authorized to pay for this booking' },
        { status: 403 }
      );
    }

    // Check payment not already completed
    if (booking.payment_status === 'paid') {
      return NextResponse.json(
        { error: 'Booking already paid' },
        { status: 400 }
      );
    }

    // Check payment is required
    if (!booking.payment_required) {
      return NextResponse.json(
        { error: 'Payment not required for this booking' },
        { status: 400 }
      );
    }

    // Get user profile for email
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', user.id)
      .single();

    // Create payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        booking_id: bookingId,
        payer_id: user.id,
        provider: 'wipay',
        amount_ttd: booking.price_ttd,
        status: 'initiated',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (paymentError || !payment) {
      console.error('Payment creation error:', paymentError);
      return NextResponse.json(
        { error: 'Failed to create payment record' },
        { status: 500 }
      );
    }

    // Initiate WiPay payment
    const wipay = new WiPayClient();
    
    // Get subject name for description
    const subjectName = (booking as any).subjects?.label || (booking as any).subjects?.name || 'Tutoring Session';
    
    try {
      const wipayResponse = await wipay.initiatePayment({
        amount: booking.price_ttd,
        currency: 'TTD',
        reference: payment.id,
        returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payments/success?bookingId=${bookingId}`,
        callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/wipay/webhook`,
        description: `${subjectName} - ${booking.duration_minutes} minutes`,
        customerEmail: profile?.email || user.email,
      });

      // Update payment with provider reference
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          provider_reference: wipayResponse.transaction_id,
          status: 'requires_action',
          raw_provider_payload: wipayResponse,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.id);

      if (updateError) {
        console.error('Payment update error:', updateError);
        // Continue anyway as the main payment was initiated
      }

      return NextResponse.json({
        success: true,
        paymentId: payment.id,
        paymentUrl: wipayResponse.payment_url,
        transactionId: wipayResponse.transaction_id,
        amount: booking.price_ttd,
        currency: 'TTD',
      });
    } catch (wipayError: any) {
      console.error('WiPay initiation error:', wipayError);
      
      // Update payment status to failed
      await supabase
        .from('payments')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.id);

      return NextResponse.json(
        { error: 'Failed to initiate payment with WiPay', details: wipayError.message },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Payment initiation error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}













