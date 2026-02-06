import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireAdmin } from '@/lib/middleware/adminAuth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

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

    const { userIds, subject, htmlContent } = await request.json();

    if (!userIds || userIds.length === 0 || !subject || !htmlContent) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Fetch user emails
    const { data: users, error: fetchError } = await supabase
      .from('profiles')
      .select('id, email, full_name, display_name')
      .in('id', userIds);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!users || users.length === 0) {
      return NextResponse.json({ error: 'No users found' }, { status: 404 });
    }

    // Send emails using Resend
    let successCount = 0;
    let failedEmails: string[] = [];

    for (const user of users) {
      try {
        // Personalize content by replacing {{firstName}} placeholder
        // Use display_name first, then fall back to full_name, then 'there'
        const firstName = user.display_name || user.full_name?.split(' ')[0] || 'there';
        const personalizedContent = htmlContent.replace(/\{\{firstName\}\}/g, firstName);
        const personalizedSubject = subject.replace(/\{\{firstName\}\}/g, firstName);
        
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'iTutor <hello@myitutor.com>',
            to: user.email,
            subject: personalizedSubject,
            html: personalizedContent
          })
        });

        if (response.ok) {
          successCount++;
        } else {
          const errorData = await response.text();
          console.error(`Failed to send to ${user.email}:`, errorData);
          failedEmails.push(user.email);
        }
      } catch (error) {
        console.error(`Error sending email to ${user.email}:`, error);
        failedEmails.push(user.email);
      }
    }

    return NextResponse.json({
      sent: successCount,
      failed: failedEmails.length,
      failedEmails,
      message: `Successfully sent ${successCount} out of ${users.length} emails`
    });
  } catch (error) {
    console.error('Error in send email route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
