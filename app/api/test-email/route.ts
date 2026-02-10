import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    console.log('Testing email configuration...');
    console.log('RESEND_API_KEY exists:', !!process.env.RESEND_API_KEY);
    console.log('RESEND_API_KEY starts with:', process.env.RESEND_API_KEY?.substring(0, 8));

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev', // Using Resend's test domain
        to: 'delivered@resend.dev', // Resend's test inbox
        subject: 'iTutor Email Test',
        html: '<h1>Test Email</h1><p>If you see this, email sending works!</p>'
      })
    });

    const responseText = await response.text();
    console.log('Resend Response Status:', response.status);
    console.log('Resend Response:', responseText);

    if (!response.ok) {
      return NextResponse.json({
        error: 'Email test failed',
        status: response.status,
        response: responseText,
        apiKeyConfigured: !!process.env.RESEND_API_KEY
      }, { status: 500 });
    }

    const data = JSON.parse(responseText);
    return NextResponse.json({
      success: true,
      message: 'Email test successful!',
      data,
      apiKeyConfigured: true
    });

  } catch (error) {
    console.error('Email test error:', error);
    return NextResponse.json({
      error: 'Email test failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      apiKeyConfigured: !!process.env.RESEND_API_KEY
    }, { status: 500 });
  }
}
