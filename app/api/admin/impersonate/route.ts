// =====================================================
// ADMIN IMPERSONATION — enter / exit a student account
// =====================================================
// POST  { email }  → swaps the caller's session cookies for a REAL session
//                    belonging to that student. Everything the student could do,
//                    the admin can now do, and the student's own view shows
//                    nothing. This is a full login, not a read-only projection.
// GET              → { allowed } so the UI can hide the control from admins who
//                    would only get a 403 from it.
// DELETE           → ends it and restores the admin's session.
//
// Why a magic link: Supabase has no admin "mint a session for user X" API. The
// service role CAN generate a one-time token for any user (generateLink does NOT
// send mail — it returns the token), and verifying that token against the anon
// client produces an ordinary session whose JWT says `sub = student`. So every
// RLS policy, every `auth.uid()` and every API route downstream sees a genuine
// student, with no impersonation-aware code anywhere else in the app.
//
// Gate: superadmin email list, checked server-side on every call. `requireAdmin`
// alone is NOT enough — it also passes reviewers and any role='admin' profile.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { isSuperAdmin } from '@/lib/auth/adminAccess';
import { getServiceClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/services/adminAudit';
import {
  IMPERSONATION_COOKIE,
  IMPERSONATOR_COOKIE,
  IMPERSONATOR_COOKIE_MAX_AGE,
  type ImpersonationState,
} from '@/lib/auth/impersonation';

export const dynamic = 'force-dynamic';

/**
 * A cookie-writing Supabase client. `getServerClient()` deliberately implements
 * only `get`, so it cannot persist a session — this route must write cookies,
 * so it builds its own.
 */
function getCookieWritingClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  return NextResponse.json({ allowed: isSuperAdmin(auth.profile?.email) });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const actorEmail = auth.profile?.email ?? null;
    if (!isSuperAdmin(actorEmail)) {
      return NextResponse.json(
        { error: 'Forbidden: entering another account requires a superadmin login.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const rawEmail = typeof body?.email === 'string' ? body.email.trim() : '';
    if (!rawEmail) {
      return NextResponse.json({ error: 'Enter the student email address.' }, { status: 400 });
    }
    const email = rawEmail.toLowerCase();

    const admin = getServiceClient();

    // eq, not ilike: an address is matched literally. ilike would treat a typed
    // % or _ as a wildcard and could hand back somebody else's account.
    let { data: target } = await admin
      .from('profiles')
      .select('id, email, full_name, role, is_suspended')
      .eq('email', email)
      .maybeSingle();

    // Older rows predate the lowercase-on-signup rule, so retry as typed.
    if (!target && rawEmail !== email) {
      ({ data: target } = await admin
        .from('profiles')
        .select('id, email, full_name, role, is_suspended')
        .eq('email', rawEmail)
        .maybeSingle());
    }

    if (!target) {
      return NextResponse.json({ error: `No account found for ${rawEmail}.` }, { status: 404 });
    }

    // Student accounts only. Entering another admin would let a superadmin walk
    // sideways into a peer's account, and entering a tutor is already covered by
    // the separate "Enter as Tutor" path.
    if (target.role !== 'student') {
      return NextResponse.json(
        {
          error: `${target.email} is a ${target.role} account. Only student accounts can be entered.`,
        },
        { status: 400 }
      );
    }

    const supabase = getCookieWritingClient();

    // Grab the admin's refresh token BEFORE the swap — a moment later these
    // cookies belong to the student and the admin's token is unreachable.
    const {
      data: { session: adminSession },
    } = await supabase.auth.getSession();
    const adminRefreshToken = adminSession?.refresh_token ?? null;

    // One-time token for the target. No email is sent; the link is returned.
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: target.email,
    });

    const hashedToken = link?.properties?.hashed_token;
    if (linkError || !hashedToken) {
      return NextResponse.json(
        {
          error: `Could not create a session for ${target.email}: ${
            linkError?.message ?? 'no token returned'
          }`,
        },
        { status: 502 }
      );
    }

    // Spending the token writes the student's session into the cookie jar,
    // overwriting the admin's. From here the browser IS the student.
    const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: hashedToken,
      type: 'magiclink',
    });

    if (verifyError || !verified?.session) {
      return NextResponse.json(
        {
          error: `Sign-in as ${target.email} failed: ${
            verifyError?.message ?? 'no session returned'
          }`,
        },
        { status: 502 }
      );
    }

    const state: ImpersonationState = {
      studentId: target.id,
      studentEmail: target.email,
      studentName: target.full_name || target.email,
      adminEmail: actorEmail ?? 'unknown admin',
      startedAt: new Date().toISOString(),
    };

    const cookieStore = cookies();
    const secure = process.env.NODE_ENV === 'production';

    // Readable on purpose: the banner is client-rendered and needs the labels.
    cookieStore.set(IMPERSONATION_COOKIE, encodeURIComponent(JSON.stringify(state)), {
      httpOnly: false,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: IMPERSONATOR_COOKIE_MAX_AGE,
    });

    // The return ticket. A credential — locked down accordingly.
    if (adminRefreshToken) {
      cookieStore.set(IMPERSONATOR_COOKIE, adminRefreshToken, {
        httpOnly: true,
        secure,
        sameSite: 'strict',
        path: '/',
        maxAge: IMPERSONATOR_COOKIE_MAX_AGE,
      });
    }

    await logAdminAction(
      { id: auth.profile?.id, email: actorEmail },
      {
        action: 'account.impersonate.enter',
        targetType: 'account',
        targetId: target.id,
        targetLabel: target.email,
        details: {
          role: target.role,
          is_suspended: target.is_suspended,
          full_session: true,
          can_return_without_login: Boolean(adminRefreshToken),
        },
      }
    );

    return NextResponse.json({
      ok: true,
      redirectTo: '/student/dashboard',
      student: { id: target.id, email: target.email, name: state.studentName },
    });
  } catch (error: any) {
    console.error('[impersonate] enter failed:', error);
    return NextResponse.json({ error: error?.message ?? 'Impersonation failed' }, { status: 500 });
  }
}

/**
 * Exit. Deliberately NOT gated by requireAdmin: by now the session is the
 * student's, so an admin check would always fail. The gate is possession of the
 * httpOnly return-ticket cookie, which only this route ever set and only the
 * admin's own browser holds.
 */
export async function DELETE() {
  const cookieStore = cookies();
  const adminRefreshToken = cookieStore.get(IMPERSONATOR_COOKIE)?.value;
  const supabase = getCookieWritingClient();

  const clearCookies = () => {
    cookieStore.set(IMPERSONATION_COOKIE, '', { path: '/', maxAge: 0 });
    cookieStore.set(IMPERSONATOR_COOKIE, '', { path: '/', maxAge: 0 });
  };

  if (!adminRefreshToken) {
    await supabase.auth.signOut();
    clearCookies();
    return NextResponse.json({ ok: true, redirectTo: '/login', restored: false });
  }

  // Swapping the student's cookies back for the admin's.
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: adminRefreshToken,
  });

  if (error || !data?.session) {
    // The ticket expired or was already spent — fall back to a clean logout
    // rather than leaving the browser sitting inside the student's account.
    await supabase.auth.signOut();
    clearCookies();
    return NextResponse.json({ ok: true, redirectTo: '/login', restored: false });
  }

  clearCookies();

  await logAdminAction(
    { id: data.user?.id, email: data.user?.email },
    {
      action: 'account.impersonate.exit',
      targetType: 'account',
      targetId: null,
      targetLabel: data.user?.email ?? null,
      details: { restored: true },
    }
  );

  return NextResponse.json({ ok: true, redirectTo: '/admin/accounts', restored: true });
}
