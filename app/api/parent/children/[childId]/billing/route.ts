// GET / PATCH /api/parent/children/[childId]/billing — handover §7 and §10.5.
//
// The three per-child controls: the approval gate, the monthly spend limit, and
// the self-pay toggle.
//
// §7 IS A TRIPWIRE, NOT A GATE — AND THAT SHAPES THIS ROUTE
// Enabling self-pay takes effect immediately. There is no confirmation step,
// because the threat model is a child using their parent's already-unlocked
// phone, and a confirmation dialog stops that for exactly zero seconds. What
// does work is telling the parent out of band, and making a password change
// undo it. So this route's job on enable is: write it, then send the alert.
//
// The alert is sent even when the parent themselves just made the change. A
// parent who deliberately enabled self-pay and then gets an email about it is
// mildly redundant; a parent who did NOT and gets nothing is the entire failure
// this mechanism exists to prevent.

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ParentAccessError, requireParentContext, requireParentChild } from '@/lib/server/parentAccess';
import { checkSpendLimit, getChildBilling, setSelfPay } from '@/lib/server/childBilling';
import { sendEmail, logEmailSend } from '@/lib/services/emailService';
import { notifyInApp } from '@/lib/server/bookingRequestNotify';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ childId: string }> };

function appUrl(path: string): string {
  return `${(process.env.NEXT_PUBLIC_APP_URL ?? 'https://myitutor.com').replace(/\/$/, '')}${path}`;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const { childId } = await params;
    await requireParentChild(parentProfile.id, childId);

    const settings = await getChildBilling(admin, childId);
    if (!settings) return NextResponse.json({ error: 'No link found' }, { status: 404 });

    const spend = await checkSpendLimit(admin, settings);

    return NextResponse.json({
      billingMode: settings.billingMode,
      selfPayEnabled: settings.billingMode === 'self_allowed',
      requiresApproval: settings.requiresApproval,
      monthlySpendLimit: settings.monthlySpendLimit,
      selfPayEnabledAt: settings.selfPayEnabledAt,
      spend: {
        limit: spend.limit,
        spent: spend.spent,
        remaining: spend.remaining,
        // Surfaced so the UI can explain why approval is being asked for even
        // though self-pay is on — otherwise it reads as the toggle not working.
        limitReached: spend.reached,
      },
    });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[GET /api/parent/children/[childId]/billing]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const { childId } = await params;
    await requireParentChild(parentProfile.id, childId);

    const body = (await request.json().catch(() => ({}))) as {
      selfPayEnabled?: boolean;
      requiresApproval?: boolean;
      monthlySpendLimit?: number | null;
    };

    const before = await getChildBilling(admin, childId);
    if (!before) return NextResponse.json({ error: 'No link found' }, { status: 404 });

    // ---- self-pay ---------------------------------------------------------
    if (typeof body.selfPayEnabled === 'boolean') {
      const changed = body.selfPayEnabled !== (before.billingMode === 'self_allowed');

      const result = await setSelfPay(admin, {
        childId,
        parentId: parentProfile.id,
        enabled: body.selfPayEnabled,
      });
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 500 });

      if (changed && body.selfPayEnabled) {
        // Fire and forget, but logged: the change has already taken effect and
        // must not be rolled back because an email bounced.
        try {
          await sendSelfPayAlert(admin, {
            parentId: parentProfile.id,
            parentEmail: parentProfile.email ?? null,
            parentName: parentProfile.full_name ?? null,
            childId,
          });
        } catch (e) {
          console.error('[billing] self-pay alert failed:', e);
        }
      }
    }

    // ---- approval gate and spend limit ------------------------------------
    const patch: Record<string, unknown> = {};

    if (typeof body.requiresApproval === 'boolean') {
      patch.requires_approval = body.requiresApproval;
    }

    if (body.monthlySpendLimit !== undefined) {
      const raw = body.monthlySpendLimit;
      if (raw === null) {
        patch.monthly_spend_limit = null;
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json({ error: 'Spend limit must be zero or more' }, { status: 400 });
        }
        patch.monthly_spend_limit = n;
      }
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await admin
        .from('parent_child_links')
        .update(patch)
        .eq('child_id', childId)
        .eq('parent_id', parentProfile.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const after = await getChildBilling(admin, childId);
    const spend = after ? await checkSpendLimit(admin, after) : null;

    return NextResponse.json({
      ok: true,
      billingMode: after?.billingMode,
      selfPayEnabled: after?.billingMode === 'self_allowed',
      requiresApproval: after?.requiresApproval,
      monthlySpendLimit: after?.monthlySpendLimit ?? null,
      spend: spend
        ? { limit: spend.limit, spent: spend.spent, remaining: spend.remaining, limitReached: spend.reached }
        : null,
    });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[PATCH /api/parent/children/[childId]/billing]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * §7's security alert.
 *
 * "If this was you, no action is required. If not, secure your account." The
 * email MUST state the consequence of the password change — that it turns
 * self-pay back off — because otherwise a parent who legitimately enabled it and
 * then cautiously clicks through to change their password will find the setting
 * silently reverted and think the product broke.
 */
async function sendSelfPayAlert(
  admin: SupabaseClient,
  params: {
    parentId: string;
    parentEmail: string | null;
    parentName: string | null;
    childId: string;
  }
): Promise<void> {
  const { data } = await admin
    .from('profiles')
    .select('full_name, display_name')
    .eq('id', params.childId)
    .maybeSingle();

  const child = data as { full_name: string | null; display_name: string | null } | null;
  const childName = child?.display_name || child?.full_name || 'your child';

  await notifyInApp(admin, {
    userId: params.parentId,
    type: 'payment',
    title: `Self-pay was turned on for ${childName}`,
    message: 'If this was not you, change your password — that turns it back off.',
    link: '/parent/settings',
  });

  if (!params.parentEmail) return;

  const first = (params.parentName ?? 'there').split(' ')[0];
  const subject = `Security alert: ${childName} can now pay for their own classes`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111827;line-height:1.6">
    <p>Hi ${first},</p>
    <p><strong>Self-pay was just turned on for ${childName}.</strong> They can now pay for their own
       classes with their own card, and their bookings no longer come to you for approval.</p>
    <p>This took effect immediately.</p>
    <p style="background:#f9fafb;border-left:3px solid #199356;padding:12px 14px">
      <strong>If this was you, no action is required.</strong>
    </p>
    <p style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 14px;color:#991b1b">
      <strong>If this was not you</strong>, someone has used your account. Change your password now —
      completing a password change turns self-pay back off for every child on your account.
    </p>
    <p><a href="${appUrl('/forgot-password')}"
          style="display:inline-block;background:#199356;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">Secure my account</a></p>
    <p style="color:#6b7280;font-size:13px">
      You can also turn self-pay off yourself at any time under Settings → Children.
    </p>
  </div>`;

  const result = await sendEmail({ to: params.parentEmail, subject, html });
  await logEmailSend({
    userId: params.parentId,
    emailType: 'self_pay_security_alert',
    recipientEmail: params.parentEmail,
    subject,
    status: result.success ? 'success' : 'failed',
    errorMessage: result.error,
  });
}
