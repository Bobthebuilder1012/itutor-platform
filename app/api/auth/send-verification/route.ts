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

    const code = String(randomInt(100000, 999999));
    const codeHash = createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const supabase = getServiceClient();

    const { error: deleteError } = await supabase
      .from('verification_codes')
      .delete()
      .eq('email', email);
    if (deleteError) {
      console.error('[send-verification] delete error:', deleteError);
    }

    const { error: insertError } = await supabase
      .from('verification_codes')
      .insert({ email, code_hash: codeHash, expires_at: expiresAt });

    if (insertError) {
      console.error('[send-verification] insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to store verification code', detail: insertError.message, code: insertError.code },
        { status: 500 }
      );
    }

    const { error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'iTutor <hello@myitutor.com>',
      to: email,
      subject: 'Your iTutor Verification Code',
      text: `Your iTutor verification code is: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, ignore this email.`,
    });

    if (emailError) {
      console.error('[send-verification] email error:', emailError);
      return NextResponse.json(
        { error: 'Failed to send verification email', detail: emailError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ sent: true, expiresIn: 600 });
  } catch (err) {
    console.error('[send-verification] unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
