// =====================================================
// SUPPORT CONTACT API
// =====================================================
// Sends support requests to support@myitutor.com

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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
    // In production, you'd integrate with an email service (SendGrid, Resend, etc.)
    
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

    // Simulate email sending
    // In production, replace this with actual email service:
    /*
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'iTutor Support <noreply@myitutor.com>',
        to: 'support@myitutor.com',
        reply_to: email,
        subject: `Support Request from ${name} (${userRole})`,
        html: `
          <h2>New Support Request</h2>
          <p><strong>From:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>User ID:</strong> ${userId}</p>
          <p><strong>Role:</strong> ${userRole}</p>
          <hr>
          <h3>Issue:</h3>
          <p>${issue}</p>
        `,
      }),
    });
    */

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







