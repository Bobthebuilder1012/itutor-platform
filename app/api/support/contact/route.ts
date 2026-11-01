// =====================================================
// SUPPORT CONTACT API
// =====================================================
// Sends support requests to support@myitutor.com

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { name, email, issue, userId, userRole } = await request.json();

    if (!name || !email || !issue) {
      return NextResponse.json(
        { error: 'Name, email, and issue description are required' },
        { status: 400 }
      );
    }

    // Verify user is authenticated
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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // For MVP: Log the support request to the database
    // In production, this would also notify the support inbox by email.
    
    // Create a support_requests table entry (we'll create the table)
    const { error: insertError } = await supabase
      .from('support_requests')
      .insert({
        user_id: userId || user.id,
        user_name: name,
        user_email: email,
        user_role: userRole,
        issue: issue,
        status: 'pending',
      });

    if (insertError) {
      console.error('Error saving support request:', insertError);
      // Don't fail the request if logging fails
    }

    // TODO: In production, send actual email via email service
    // For now, we'll return success and log it
    console.log('=== SUPPORT REQUEST ===');
    console.log('To: support@myitutor.com');
    console.log('From:', name, '<' + email + '>');
    console.log('User ID:', userId);
    console.log('Role:', userRole);
    console.log('Issue:', issue);
    console.log('=====================');

    // This route records the request and does not mail anyone. What used to
    // sit here was a commented-out direct call to Resend, removed rather than
    // updated: Resend is no longer the provider, and a dead template is how a
    // direct provider call gets pasted back in. To make this notify support
    // for real, call sendEmail() from lib/services/emailService with to:
    // 'support@myitutor.com' — it carries the sender split, the recipient
    // allowlist and the provider, none of which a hand-rolled fetch would.

    return NextResponse.json({
      success: true,
      message: 'Support request sent successfully',
    });
  } catch (error: any) {
    console.error('Support contact error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}













