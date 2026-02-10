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
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 30px 0; background: #000000; border-radius: 8px 8px 0 0; }
    .logo { height: 60px; width: auto; display: block; margin: 0 auto; }
    .content { background: #ffffff; padding: 40px; border-radius: 0 0 8px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .title { font-size: 24px; color: #1f2937; margin-bottom: 20px; font-weight: 600; }
    .text { font-size: 16px; color: #4b5563; line-height: 1.6; margin-bottom: 20px; }
    .code-box { background: linear-gradient(135deg, #199358 0%, #157a48 100%); border-radius: 12px; padding: 30px; text-align: center; margin: 30px 0; }
    .code-label { margin: 0 0 10px 0; color: #ffffff; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; }
    .code { margin: 0; color: #ffffff; font-size: 42px; font-weight: bold; letter-spacing: 8px; font-family: 'Courier New', monospace; }
    .footer { text-align: center; padding: 30px 0; color: #6b7280; font-size: 14px; }
    .social-links { margin: 20px 0; }
    .social-links a { display: inline-block; margin: 0 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://myitutor.com/assets/logo/itutor-logo-dark.png" alt="iTutor" class="logo" style="height: 60px; width: auto; display: block; margin: 0 auto;" />
    </div>
    <div class="content">
      <h1 class="title">Verify Your Email</h1>
      <p class="text">
        Thank you for signing up with iTutor! To get started, please verify your email address by entering the code below:
      </p>
      
      <div class="code-box">
        <p class="code-label">Your Verification Code</p>
        <p class="code">${code}</p>
      </div>

      <p class="text">
        Enter this code on the verification page to complete your signup. This code will expire in <strong>1 hour</strong>.
      </p>

      <p class="text" style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
        If you didn't create an account with iTutor, you can safely ignore this email.
      </p>
    </div>
    <div class="footer">
      <div class="social-links">
        <a href="https://www.facebook.com/share/1E91o2u1yM/">
          <img src="https://img.icons8.com/ios-filled/50/6b7280/facebook-new.png" alt="Facebook" style="width: 28px; height: 28px; filter: grayscale(100%);" />
        </a>
        <a href="https://www.instagram.com/myitutor?igsh=MXgyNjdrMTR1ampyag%3D%3D&utm_source=qr">
          <img src="https://img.icons8.com/ios-filled/50/6b7280/instagram-new.png" alt="Instagram" style="width: 28px; height: 28px; filter: grayscale(100%);" />
        </a>
        <a href="https://www.linkedin.com/company/myitutor/">
          <img src="https://img.icons8.com/ios-filled/50/6b7280/linkedin.png" alt="LinkedIn" style="width: 28px; height: 28px; filter: grayscale(100%);" />
        </a>
      </div>
      <p style="margin-top: 15px; color: #6b7280;">Trinidad & Tobago</p>
      <p style="margin-top: 10px; color: #9ca3af; font-size: 13px;">© iTutor. Nora Digital, Ltd.</p>
    </div>
  </div>
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
