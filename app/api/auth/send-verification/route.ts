import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { randomInt, createHash } from 'crypto';
import { renderEmail } from '@/lib/email/design';
import { sendEmail } from '@/lib/services/emailService';

export const dynamic = 'force-dynamic';

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

    // Routed through sendEmail rather than a provider SDK directly, so this —
    // the single most important email the platform sends, the one without
    // which nobody can finish signing up — follows the EMAIL_PROVIDER switch
    // like everything else. It previously held its own Resend client, which
    // meant a provider swap would have left signup broken while every other
    // email migrated cleanly. It also built that client at module scope, so a
    // missing RESEND_API_KEY threw on import and took the whole route down
    // rather than failing one send.
    const result = await sendEmail({ to: email, subject, html, text });

    if (!result.success) {
      console.error('[send-verification] email error:', result.error);
      return NextResponse.json(
        { error: 'Failed to send verification email', detail: result.error },
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
