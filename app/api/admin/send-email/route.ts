import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

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

    console.log(`Preparing to send batch emails to ${users.length} users`);

    // Prepare batch emails with personalization
    const batchEmails = users.map(user => {
      const firstName = user.display_name || user.full_name?.split(' ')[0] || 'there';
      const personalizedContent = htmlContent.replace(/\{\{firstName\}\}/g, firstName);
      const personalizedSubject = subject.replace(/\{\{firstName\}\}/g, firstName);
      
      return {
        from: 'iTutor <hello@myitutor.com>',
        to: user.email,
        subject: personalizedSubject,
        html: personalizedContent,
      };
    });

    // Send batch emails using Resend batch API
    // Resend batch API handles rate limiting automatically
    console.log(`Sending batch of ${batchEmails.length} emails...`);
    
    let result;
    try {
      result = await resend.batch.send(batchEmails);
      console.log('Resend batch.send result:', JSON.stringify(result, null, 2));
    } catch (batchError: any) {
      console.error('Resend batch.send threw error:', batchError);
      return NextResponse.json({ 
        error: 'Failed to send batch emails',
        details: batchError?.message || 'Unknown batch send error'
      }, { status: 500 });
    }

    const { data, error } = result;

    if (error) {
      console.error('Resend batch error:', error);
      return NextResponse.json({ 
        error: 'Failed to send batch emails',
        details: error.message || error
      }, { status: 500 });
    }

    // Process results
    let successCount = 0;
    let failedEmails: string[] = [];

    console.log('Processing batch results, data:', data);

    if (data && Array.isArray(data)) {
      data.forEach((result: any, index: number) => {
        if (result && result.id) {
          successCount++;
        } else if (result && result.error) {
          console.error(`Failed to send to ${users[index]?.email}:`, result.error);
          failedEmails.push(users[index]?.email || 'unknown');
        } else {
          // If we can't determine status, count as failed
          console.warn(`Indeterminate result for ${users[index]?.email}:`, result);
          failedEmails.push(users[index]?.email || 'unknown');
        }
      });
    } else if (data && typeof data === 'object') {
      // Handle case where data is an object with id (single success)
      if ((data as any).id) {
        successCount = users.length;
      }
    } else {
      console.warn('Unexpected data format from Resend:', typeof data, data);
      // Assume success if no error
      successCount = users.length;
    }

    console.log(`Batch send complete: ${successCount} succeeded, ${failedEmails.length} failed`);

    return NextResponse.json({
      sent: successCount,
      failed: failedEmails.length,
      failedEmails,
      message: `Successfully sent ${successCount} out of ${users.length} emails`,
      details: data
    });
  } catch (error) {
    console.error('Error in send email route:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
