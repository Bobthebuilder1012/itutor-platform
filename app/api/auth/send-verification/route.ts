import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { randomInt, createHash } from 'crypto';
import { Resend } from 'resend';
import { renderEmail } from '@/lib/email/design';

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

    // Family 02, `verification-code`. This used to send a text-only body with
    // no HTML part at all — the code arrived as one unbranded sentence, which
    // for a first-time signup is the least trustworthy-looking email the
    // platform produces. The text part is kept, because a code is exactly the
    // kind of mail people read in a text-only client.
    //
    // The digits are grouped for reading aloud: someone typing this in has the
    // phone in one hand.
    const grouped = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
    const { subject, html, text } = renderEmail({
      family: 'verification-code',
      subject: 'Your iTutor verification code',
      preheader: `Your code is ${grouped}. It expires in 10 minutes.`,
      heading: 'Your verification code',
      intro: "Enter this code in iTutor to verify it's you.",
      blocks: [
        {
          kind: 'code',
          code: grouped,
          note: 'This code expires in 10 minutes and can only be used once.',
        },
        { kind: 'divider' },
        {
          kind: 'fineprint',
          text:
            'Never share this code with anyone. iTutor Support will never ask you for it.\nIf you did not request this code, you can safely ignore this email.',
        },
      ],
    });

    const { error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'iTutor <hello@myitutor.com>',
      to: email,
      subject,
      html,
      text,
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
