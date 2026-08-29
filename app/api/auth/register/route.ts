import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { createHash } from 'crypto';
import { isParentAccountsEnabled, PARENT_ACCOUNTS_DISABLED_MESSAGE } from '@/lib/featureFlags/parentAccounts';
import { getRequestAttribution, track } from '@/lib/analytics/track';
import { PRODUCT_EVENTS } from '@/lib/analytics/events';
import { syncProfileNow } from '@/lib/customerio/sync';

export const dynamic = 'force-dynamic';

const RESERVED = new Set(['admin', 'itutor', 'support', 'help', 'system', 'null', 'undefined', 'test']);
const VALID_ROLES = new Set(['student', 'tutor', 'parent']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

function validate(body: Record<string, unknown>): string | null {
  const { username, email, country, password, role, verificationCode } = body;

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
  // Hiding the card in the UI is not the control — this is. Without it an
  // account could still be registered as a parent by posting here directly.
  if (role === 'parent' && !isParentAccountsEnabled())
    return PARENT_ACCOUNTS_DISABLED_MESSAGE;
  if (!verificationCode || typeof verificationCode !== 'string' || !/^\d{6}$/.test(verificationCode))
    return 'Verification code must be 6 digits';

  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, email, country, password, role, verificationCode } = body;
    const name: string = (typeof body.name === 'string' && body.name.trim().length >= 2)
      ? body.name.trim()
      : username;

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
      // Check whether a real auth user still backs this profile — if not it's an
      // orphan left behind when someone deleted the user from the Supabase dashboard
      // without deleting the corresponding profiles row. Purge and allow re-registration.
      const { data: authUser } = await supabase.auth.admin.getUserById(emailTaken.id);
      if (authUser?.user) {
        return NextResponse.json({ error: 'Email is already registered' }, { status: 409 });
      }
      await supabase.from('profiles').delete().eq('id', emailTaken.id);
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

    // Stamp the campaign that produced this account (Find Your iTutor plan
    // §2.1). Read from the httpOnly cookies middleware wrote on the landing
    // page, never from the request body — attribution the client can name is
    // attribution the payment reports in §7.2 cannot be trusted on.
    const { attribution, anonId } = await getRequestAttribution();

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
        first_touch: attribution,
        last_touch: attribution,
        signup_ref: attribution?.ref ?? null,
      },
      { onConflict: 'id' },
    );

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
    }

    // Clean up verification code
    await supabase.from('verification_codes').delete().eq('id', codeRow.id);

    // Ship the profile to Customer.io BEFORE the signup event fires.
    // Customer.io auto-creates a profile when it receives an event for an
    // unknown id, and a profile born that way has no email address — so a
    // welcome campaign triggered on signup_completed would have nobody to mail.
    // Identifying first guarantees the attributes are there when it triggers.
    // No-op unless the integration is switched on; never throws.
    await syncProfileNow(authData.user.id);

    // First event in the funnel that carries a user_id. track() swallows its
    // own failures, so this cannot fail a registration.
    await track(
      PRODUCT_EVENTS.SIGNUP_COMPLETED,
      { role: role as string },
      { userId: authData.user.id, anonId, attribution },
    );

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
