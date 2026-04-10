import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

const RESERVED = new Set(['admin', 'itutor', 'support', 'help', 'system', 'null', 'undefined', 'test']);
const VALID_ROLES = new Set(['student', 'tutor', 'parent']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

function validate(body: Record<string, unknown>): string | null {
  const { name, username, email, country, password, role, verificationCode } = body;

  if (!name || typeof name !== 'string' || name.length < 2 || name.length > 50)
    return 'Name must be 2-50 characters';
  if (!username || typeof username !== 'string' || username.length < 3 || username.length > 30 || !USERNAME_RE.test(username))
    return 'Username must be 3-30 alphanumeric/underscore characters';
  if (RESERVED.has((username as string).toLowerCase()))
    return 'Username is reserved';
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email))
    return 'Valid email is required';
  if (!country || typeof country !== 'string')
    return 'Country is required';
  if (!password || typeof password !== 'string' || password.length < 8 || password.length > 128)
    return 'Password must be 8-128 characters';
  if (!role || !VALID_ROLES.has(role as string))
    return 'Role must be student, tutor, or parent';
  if (!verificationCode || typeof verificationCode !== 'string' || !/^\d{8}$/.test(verificationCode))
    return 'Verification code must be 8 digits';

  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, username, email, country, password, role, verificationCode } = body;

    const validationError = validate(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Verify code
    const { data: codeRow } = await supabase
      .from('verification_codes')
      .select('id, code_hash, attempts, expires_at')
      .eq('email', email)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!codeRow) {
      return NextResponse.json({ error: 'Verification code expired or not found' }, { status: 400 });
    }

    const inputHash = createHash('sha256').update(String(verificationCode)).digest('hex');
    if (inputHash !== codeRow.code_hash) {
      const attempts = (codeRow.attempts || 0) + 1;
      if (attempts >= 5) {
        await supabase.from('verification_codes').delete().eq('id', codeRow.id);
      } else {
        await supabase.from('verification_codes').update({ attempts }).eq('id', codeRow.id);
      }
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    // Race-condition guard: re-check availability
    const [{ data: emailTaken }, { data: usernameTaken }] = await Promise.all([
      supabase.from('profiles').select('id').ilike('email', email).limit(1).maybeSingle(),
      supabase.from('profiles').select('id').ilike('username', username).limit(1).maybeSingle(),
    ]);

    if (emailTaken) {
      return NextResponse.json({ error: 'Email is already registered' }, { status: 409 });
    }
    if (usernameTaken) {
      return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, username, role, country, terms_accepted: true },
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || 'Failed to create user' },
        { status: 500 },
      );
    }

    // Upsert profile
    const { error: profileError } = await supabase.from('profiles').upsert(
      {
        id: authData.user.id,
        email,
        full_name: name,
        username,
        display_name: name.split(' ')[0],
        role,
        country,
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
    }

    // Clean up verification code
    await supabase.from('verification_codes').delete().eq('id', codeRow.id);

    return NextResponse.json({
      success: true,
      user: {
        id: authData.user.id,
        email,
        role,
        name,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
