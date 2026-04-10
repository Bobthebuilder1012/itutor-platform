import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { randomInt, createHash } from 'crypto';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const code = String(randomInt(10000000, 99999999));
    const codeHash = createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const supabase = getServiceClient();

    await supabase.from('verification_codes').delete().eq('email', email);

    const { error: insertError } = await supabase
      .from('verification_codes')
      .insert({ email, code_hash: codeHash, expires_at: expiresAt });

    if (insertError) {
      return NextResponse.json({ error: 'Failed to store verification code' }, { status: 500 });
    }

    const { error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'iTutor <hello@myitutor.com>',
      to: email,
      subject: 'Your iTutor Verification Code',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
    <h2 style="color:#111827;margin-bottom:8px">Verify your email</h2>
    <p style="color:#6b7280;margin-bottom:24px">Enter this code to complete your registration:</p>
    <div style="background:#f0fdf4;border:2px solid #0d9668;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
      <span style="font-size:32px;font-weight:800;letter-spacing:0.3em;color:#0d9668">${code}</span>
    </div>
    <p style="color:#9ca3af;font-size:13px">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
  </div>`,
    });

    if (emailError) {
      return NextResponse.json({ error: 'Failed to send verification email' }, { status: 500 });
    }

    return NextResponse.json({ sent: true, expiresIn: 600 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
