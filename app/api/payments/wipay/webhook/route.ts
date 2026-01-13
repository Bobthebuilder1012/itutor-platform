// =====================================================
// WIPAY WEBHOOK HANDLER API ROUTE
// =====================================================
// Processes webhook callbacks from WiPay after payment completion

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { WiPayClient, WiPayWebhookPayload } from '@/lib/payments/wipayClient';

export async function POST(request: NextRequest) {
  try {
    const payload: WiPayWebhookPayload = await request.json();
    const signature = request.headers.get('x-wipay-signature') || '';

    console.log('📨 WiPay webhook received:', {
      transaction_id: payload.transaction_id,
      status: payload.status,
      amount: payload.amount,
    });

    // Verify webhook signature
    const wipay = new WiPayClient();
    if (!wipay.verifyWebhookSignature(payload, signature)) {
      console.error('❌ Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Use service role client to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Find payment by provider reference
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*, bookings(*)')
      .eq('provider_reference', payload.transaction_id)
      .single();

    if (paymentError || !payment) {
      console.error('❌ Payment not found:', payload.transaction_id, paymentError);
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 }
      );
    }

    console.log('✅ Payment found:', payment.id, 'for booking:', payment.booking_id);

    // Handle payment status
    if (payload.status === 'success') {
      console.log('💰 Processing successful payment...');

      // Call the complete_booking_payment function
      const { error: completeError } = await supabase.rpc('complete_booking_payment', {
        p_booking_id: payment.booking_id,
        p_payment_id: payment.id,
        p_provider_reference: payload.transaction_id,
      });

      if (completeError) {
        console.error('❌ Error completing payment:', completeError);
        return NextResponse.json(
          { error: 'Failed to complete payment', details: completeError.message },
          { status: 500 }
        );
      }

      console.log('✅ Payment completed successfully');

      // Get booking details for notification
      const booking = (payment as any).bookings;

      // Create notification for payer
      const { error: payerNotificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: payment.payer_id,
          type: 'payment_succeeded',
          title: 'Payment Successful',
          message: `Your payment of $${payment.amount_ttd} TTD was successful. The tutor will now review your booking request.`,
          link: `/payments/${payment.id}/receipt`,
          created_at: new Date().toISOString(),
        });

      if (payerNotificationError) {
        console.error('⚠️ Failed to create payer notification:', payerNotificationError);
      }

      // Notify tutor that booking is ready for review
      if (booking) {
        const { error: tutorNotificationError } = await supabase
          .from('notifications')
          .insert({
            user_id: booking.tutor_id,
            type: 'booking_request_received',
            title: 'New Paid Booking Request',
            message: `You have a new booking request for ${booking.duration_minutes} minutes. Payment has been received.`,
            link: `/tutor/bookings/${booking.id}`,
            created_at: new Date().toISOString(),
          });

        if (tutorNotificationError) {
          console.error('⚠️ Failed to create tutor notification:', tutorNotificationError);
        }
      }

      return NextResponse.json({
        received: true,
        status: 'success',
        message: 'Payment completed successfully',
      });
    } else if (payload.status === 'failed' || payload.status === 'cancelled') {
      console.log('❌ Payment failed or cancelled');

      // Mark payment as failed
      const { error: updatePaymentError } = await supabase
        .from('payments')
        .update({
          status: payload.status,
          raw_provider_payload: payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.id);

      if (updatePaymentError) {
        console.error('❌ Error updating payment status:', updatePaymentError);
      }

      // Mark booking payment as failed
      const { error: updateBookingError } = await supabase
        .from('bookings')
        .update({
          payment_status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.booking_id);

      if (updateBookingError) {
        console.error('❌ Error updating booking status:', updateBookingError);
      }

      // Notify payer of failure
      const { error: failNotificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: payment.payer_id,
          type: 'payment_failed',
          title: 'Payment Failed',
          message: `Your payment of $${payment.amount_ttd} TTD was not successful. Please try again.`,
          link: `/payments/checkout?bookingId=${payment.booking_id}`,
          created_at: new Date().toISOString(),
        });

      if (failNotificationError) {
        console.error('⚠️ Failed to create failure notification:', failNotificationError);
      }

      return NextResponse.json({
        received: true,
        status: 'failed',
        message: 'Payment marked as failed',
      });
    }

    // Unknown status
    console.warn('⚠️ Unknown payment status:', payload.status);
    return NextResponse.json({
      received: true,
      status: 'unknown',
      message: 'Unknown payment status',
    });
  } catch (error: any) {
    console.error('❌ Webhook processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// Also support GET for webhook URL verification (if WiPay requires it)
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    message: 'WiPay webhook endpoint is active',
  });
}













