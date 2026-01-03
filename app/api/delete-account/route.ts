import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

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
