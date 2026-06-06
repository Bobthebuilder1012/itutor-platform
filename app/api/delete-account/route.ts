import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function DELETE() {
  try {
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

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if service role key exists
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('SUPABASE_SERVICE_ROLE_KEY not found in environment');
      return NextResponse.json(
        { error: 'Server configuration error: Missing service role key' },
        { status: 500 }
      );
    }

    // Use service role client to bypass RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Delete related data first (to respect foreign keys)
    // Using admin client to bypass RLS
    try {
      // ── Subscription data (must be cleared before profile cascade) ──────────
      // 1. Fetch student's enrollment IDs so we can clean their dependencies
      const { data: enrollments } = await supabaseAdmin
        .from('group_enrollments')
        .select('id')
        .eq('student_id', user.id);
      const enrollmentIds = (enrollments ?? []).map((e: any) => e.id);

      if (enrollmentIds.length > 0) {
        // 2. Fetch subscription_payment IDs for those enrollments
        const { data: subPayments } = await supabaseAdmin
          .from('subscription_payments')
          .select('id')
          .in('enrollment_id', enrollmentIds);
        const subPaymentIds = (subPayments ?? []).map((p: any) => p.id);

        // 3. Delete payout_ledger rows that reference those subscription payments
        if (subPaymentIds.length > 0) {
          await supabaseAdmin
            .from('payout_ledger')
            .delete()
            .in('subscription_payment_id', subPaymentIds);
        }

        // 4. Delete credit refund liabilities for this student
        await supabaseAdmin
          .from('credit_refund_liabilities')
          .delete()
          .eq('student_id', user.id);

        // 5. Delete subscription refund requests for these enrollments
        await supabaseAdmin
          .from('subscription_refund_requests')
          .delete()
          .in('enrollment_id', enrollmentIds);

        // 6. Delete the subscription payments
        await supabaseAdmin
          .from('subscription_payments')
          .delete()
          .in('enrollment_id', enrollmentIds);

        // 7. Now safe to delete enrollments
        await supabaseAdmin
          .from('group_enrollments')
          .delete()
          .eq('student_id', user.id);
      }

      // ── Standard user data ───────────────────────────────────────────────────
      await supabaseAdmin.from('booking_messages').delete().eq('sender_id', user.id);
      await supabaseAdmin.from('ratings').delete().eq('tutor_id', user.id);
      await supabaseAdmin.from('ratings').delete().eq('student_id', user.id);
      await supabaseAdmin.from('sessions').delete().eq('tutor_id', user.id);
      await supabaseAdmin.from('sessions').delete().eq('student_id', user.id);
      await supabaseAdmin.from('bookings').delete().eq('tutor_id', user.id);
      await supabaseAdmin.from('bookings').delete().eq('student_id', user.id);
      await supabaseAdmin.from('tutor_subjects').delete().eq('tutor_id', user.id);
      await supabaseAdmin.from('user_subjects').delete().eq('user_id', user.id);
      await supabaseAdmin.from('notifications').delete().eq('user_id', user.id);
      await supabaseAdmin.from('messages').delete().eq('sender_id', user.id);
      await supabaseAdmin.from('messages').delete().eq('receiver_id', user.id);
      await supabaseAdmin.from('parent_child_links').delete().eq('parent_id', user.id);
      await supabaseAdmin.from('parent_child_links').delete().eq('child_id', user.id);
    } catch (relatedError) {
      console.error('Error deleting related data:', relatedError);
      // Continue anyway - profile deletion might still work
    }

    // Delete user profile
    const { error: deleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', user.id);

    if (deleteError) {
      console.error('Error deleting profile:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete profile data: ' + deleteError.message },
        { status: 500 }
      );
    }

    // Delete auth user
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (authDeleteError) {
      console.error('Error deleting auth user:', authDeleteError);
      // Profile already deleted, continue anyway
    }

    // Sign out the user
    await supabase.auth.signOut();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}
