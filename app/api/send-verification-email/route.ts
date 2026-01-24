import { NextRequest, NextResponse } from 'next/server';

// This API route sends verification emails directly via Resend API
// Use this if Supabase SMTP is too slow

export async function POST(request: NextRequest) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json(
        { error: 'Email and code are required' },
        { status: 400 }
      );
    }

    // Check for Resend API key
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 500 }
      );
    }

    // Send email via Resend API
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'iTutor <noreply@yourdomain.com>', // Replace with your verified domain
        to: email,
        subject: 'Verify Your Email - iTutor',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1f2937 0%, #111827 100%); padding: 40px 30px; text-align: center; border-radius: 16px 16px 0 0;">
              <h1 style="margin: 0; color: #10b981; font-size: 32px; font-weight: bold;">iTutor</h1>
              <p style="margin: 10px 0 0 0; color: #d1d5db; font-size: 16px;">Welcome to Your Learning Journey</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px 0; color: #111827; font-size: 24px;">Verify Your Email</h2>
              
              <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px;">
                Thank you for signing up! Enter this code to verify your email:
              </p>

              <!-- Code Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 12px; padding: 30px;">
                    <p style="margin: 0 0 10px 0; color: #ffffff; font-size: 14px; font-weight: 500; text-transform: uppercase;">Your Verification Code</p>
                    <p style="margin: 0; color: #ffffff; font-size: 42px; font-weight: bold; letter-spacing: 8px; font-family: 'Courier New', monospace;">${code}</p>
                  </td>
                </tr>
              </table>

              <p style="margin: 20px 0; color: #4b5563; font-size: 14px;">
                This code expires in <strong>10 minutes</strong>.
              </p>

              <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 13px;">
                If you didn't create an account, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 11px;">
                © iTutor. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Resend API error:', errorData);
      return NextResponse.json(
        { error: 'Failed to send email' },
        { status: 500 }
      );
    }

    const data = await response.json();
    console.log('✅ Email sent via Resend:', data);

    return NextResponse.json({ success: true, id: data.id });
  } catch (error) {
    console.error('Error sending email:', error);
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    );
  }
}
