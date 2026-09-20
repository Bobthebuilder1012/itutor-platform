/**
 * Creating invitations, and listing the funnel.
 *
 * POST takes a LIST of addresses, always — a single invite is a list of one.
 * Building "invite one" and "invite several" as separate paths is how the two
 * drift, and the teacher pasting twenty addresses at once is the case that
 * actually matters when somebody is migrating a class they already teach.
 *
 * EVERY ADDRESS GETS A ROW, including the invalid ones. A teacher who pastes
 * forty lines needs to see which three were wrong later, not only in the
 * response they are about to navigate away from. Bad addresses land as
 * status='failed' and surface under Needs attention.
 */

import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { authenticateUser, requireTutor, requireGroupOwner } from '@/lib/api/groupAuth';
import { ok, fail } from '@/lib/api/http';
import { track } from '@/lib/analytics/track';
import { PRODUCT_EVENTS } from '@/lib/analytics/events';
import { isParentAccountsEnabled } from '@/lib/featureFlags/parentAccounts';
import { requireTeacherActivation } from '@/lib/classInvites/guard';
import { deliverClassInvite } from '@/lib/services/classInvite';
import { buildActivationSnapshot } from '@/lib/classInvites/dashboard';
import { INVITE_COLUMNS } from '@/lib/classInvites/fulfil';
import { mintInviteToken } from '@/lib/classInvites/token';
import {
  MAX_NEW_INVITES_PER_DAY,
  BATCH_SEND_DELAY_MS,
  MAX_CSV_ROWS,
} from '@/lib/classInvites/limits';
import type { ClassInviteRow, InviteeKind } from '@/lib/classInvites/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The same expression the registration route validates against. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Addresses that are almost certainly a slip of the finger. Not a spell
 * checker — just the handful that show up constantly, caught before they
 * become a bounce nobody can explain a week later.
 */
const TYPO_DOMAINS = new Set([
  'gmial.com', 'gmai.com', 'gmail.co', 'gmil.com', 'gnail.com',
  'yahho.com', 'yaho.com', 'yahoo.co',
  'hotmial.com', 'hotmal.com', 'hotmai.com',
  'outlok.com', 'outllok.com',
]);

export type RowOutcome =
  | 'created'
  | 'duplicate'
  | 'already_member'
  | 'invalid_email'
  | 'self'
  | 'send_failed'
  | 'suppressed';

type ParsedRecipient = { email: string; name: string | null };

/**
 * Accept the shapes people actually paste: bare addresses, comma or newline
 * separated, and "Name <addr>" straight out of a mail client.
 */
function parseRecipients(input: unknown): ParsedRecipient[] {
  const raw: string[] = Array.isArray(input)
    ? input.map((v) => String(v ?? ''))
    : String(input ?? '').split(/[\n,;]+/);

  const out: ParsedRecipient[] = [];
  for (const entry of raw) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const angled = trimmed.match(/^(.*?)<([^>]+)>$/);
    if (angled) {
      const name = angled[1].trim().replace(/^["']|["']$/g, '').trim();
      out.push({ email: angled[2].trim().toLowerCase(), name: name || null });
    } else {
      out.push({ email: trimmed.toLowerCase(), name: null });
    }
  }
  return out;
}

function validate(email: string): 'ok' | 'invalid_email' {
  if (!EMAIL_RE.test(email) || email.length > 320) return 'invalid_email';
  const domain = email.split('@')[1] ?? '';
  if (TYPO_DOMAINS.has(domain)) return 'invalid_email';
  return 'ok';
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);
    if (!(await requireTutor(user.id))) return fail('Tutor role required', 403);

    const groupId = new URL(request.url).searchParams.get('groupId');
    const snapshot = await buildActivationSnapshot(getServiceClient(), user.id, { groupId });
    return ok({ rows: snapshot.rows, goal: snapshot.goal, unavailable: snapshot.unavailable });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Internal server error', 500);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);

    const gate = await requireTeacherActivation(user.id);
    if (!gate.ok) return gate.response;

    const body = (await request.json().catch(() => ({}))) as {
      recipients?: unknown;
      email?: unknown;
      groupId?: string | null;
      kind?: string;
      note?: string | null;
      source?: 'single' | 'csv';
    };

    const groupId = body.groupId?.trim() || null;
    if (groupId && !(await requireGroupOwner(groupId, user.id))) {
      return fail('Forbidden', 403);
    }

    // What the teacher SAYS the addresses are. Advisory — claim.ts reconciles
    // it against whoever actually signs up. Forced to 'unknown' when parent
    // accounts are off, because registration would refuse role='parent' and
    // the invitation would dead-end in a flow that cannot complete.
    let kind: InviteeKind =
      body.kind === 'parent' ? 'parent' : body.kind === 'student' ? 'student' : 'unknown';
    if (kind === 'parent' && !isParentAccountsEnabled()) kind = 'unknown';

    const recipients = parseRecipients(body.recipients ?? body.email);
    if (recipients.length === 0) return fail('No addresses given', 400);
    if (recipients.length > MAX_CSV_ROWS) {
      return fail(`That is more than ${MAX_CSV_ROWS} addresses. Split the list and try again.`, 413);
    }

    const admin = getServiceClient();

    const { data: tutorData } = await admin
      .from('profiles')
      .select('email, full_name, display_name')
      .eq('id', user.id)
      .maybeSingle();
    const tutor = tutorData as {
      email: string | null;
      full_name: string | null;
      display_name: string | null;
    } | null;
    const tutorName = tutor?.display_name || tutor?.full_name || 'Your teacher';
    const tutorEmail = (tutor?.email ?? '').toLowerCase();

    let className: string | null = null;
    if (groupId) {
      const { data } = await admin.from('groups').select('name').eq('id', groupId).maybeSingle();
      className = (data as { name: string | null } | null)?.name ?? null;
    }

    // The daily cap. Counted over a rolling 24 hours rather than a calendar
    // day so it cannot be reset by waiting for midnight.
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count: sentToday } = await admin
      .from('class_invites')
      .select('id', { count: 'exact', head: true })
      .eq('tutor_id', user.id)
      .gte('created_at', since);
    if ((sentToday ?? 0) + recipients.length > MAX_NEW_INVITES_PER_DAY) {
      return fail(
        `That would pass the limit of ${MAX_NEW_INVITES_PER_DAY} invitations a day. Try again tomorrow.`,
        429
      );
    }

    // Everything already known about these addresses, in two queries rather
    // than two per row.
    const addresses = Array.from(new Set(recipients.map((r) => r.email)));
    const [{ data: openRows }, { data: existingProfiles }] = await Promise.all([
      admin
        .from('class_invites')
        .select('id, invitee_email, status')
        .eq('tutor_id', user.id)
        .in('invitee_email', addresses)
        .in('status', ['pending', 'accepted', 'joined']),
      admin.from('profiles').select('id, email').in('email', addresses),
    ]);

    const openByEmail = new Map<string, { id: string; status: string }>();
    for (const r of (openRows ?? []) as Array<{ id: string; invitee_email: string; status: string }>) {
      openByEmail.set(r.invitee_email.toLowerCase(), { id: r.id, status: r.status });
    }
    const accountByEmail = new Map<string, string>();
    for (const p of (existingProfiles ?? []) as Array<{ id: string; email: string | null }>) {
      if (p.email) accountByEmail.set(p.email.toLowerCase(), p.id);
    }

    let membersOfMine = new Set<string>();
    if (accountByEmail.size > 0) {
      const { data: groupRows } = await admin.from('groups').select('id').eq('tutor_id', user.id);
      const ids = ((groupRows ?? []) as Array<{ id: string }>).map((g) => g.id);
      if (ids.length) {
        const { data: members } = await admin
          .from('group_members')
          .select('user_id')
          .in('group_id', ids)
          .in('user_id', Array.from(accountByEmail.values()));
        membersOfMine = new Set(
          ((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id)
        );
      }
    }

    const batchId = crypto.randomUUID();
    const source = body.source === 'csv' ? 'csv' : 'single';
    const results: Array<{ email: string; outcome: RowOutcome; inviteId?: string; message?: string }> = [];
    const seen = new Set<string>();
    const toSend: ClassInviteRow[] = [];

    for (const recipient of recipients) {
      const email = recipient.email;

      if (seen.has(email)) {
        results.push({ email, outcome: 'duplicate', message: 'Listed more than once' });
        continue;
      }
      seen.add(email);

      if (email === tutorEmail) {
        results.push({ email, outcome: 'self', message: 'That is your own address' });
        continue;
      }

      const open = openByEmail.get(email);
      if (open) {
        results.push({
          email,
          outcome: open.status === 'joined' ? 'already_member' : 'duplicate',
          inviteId: open.id,
          message:
            open.status === 'joined'
              ? 'Already joined through an earlier invitation'
              : 'Already invited — use Resend instead',
        });
        continue;
      }

      const accountId = accountByEmail.get(email);
      if (accountId && membersOfMine.has(accountId)) {
        results.push({ email, outcome: 'already_member', message: 'Already in one of your classes' });
        continue;
      }

      const valid = validate(email);
      const row = {
        tutor_id: user.id,
        group_id: groupId,
        invitee_email: email,
        invitee_name: recipient.name,
        invitee_kind: kind,
        role: kind === 'parent' ? 'parent' : 'student',
        token: mintInviteToken(),
        source,
        batch_id: batchId,
        // An invalid address is still written down, so the teacher can find and
        // fix it later rather than only seeing it in this response.
        ...(valid === 'invalid_email'
          ? {
              status: 'failed' as const,
              delivery_state: 'send_failed' as const,
              delivery_error: 'That address does not look right',
            }
          : {}),
      };

      const { data: inserted, error } = await admin
        .from('class_invites')
        .insert(row)
        .select(INVITE_COLUMNS)
        .maybeSingle();

      if (error || !inserted) {
        results.push({ email, outcome: 'send_failed', message: error?.message ?? 'Could not save' });
        continue;
      }

      const invite = inserted as unknown as ClassInviteRow;
      if (valid === 'invalid_email') {
        results.push({ email, outcome: 'invalid_email', inviteId: invite.id, message: 'Check the spelling' });
        continue;
      }
      toSend.push(invite);
      results.push({ email, outcome: 'created', inviteId: invite.id });
    }

    // Sent one at a time with a small gap. A provider rate limit then marks
    // specific rows send_failed instead of timing out the whole request and
    // leaving the teacher with no idea which invitations went.
    for (const invite of toSend) {
      const outcome = await deliverClassInvite(admin, invite, {
        tutorName,
        className,
        note: typeof body.note === 'string' ? body.note.slice(0, 140) : null,
      });
      if (outcome.state !== 'sent') {
        const entry = results.find((r) => r.inviteId === invite.id);
        if (entry) {
          entry.outcome = outcome.state === 'suppressed' ? 'suppressed' : 'send_failed';
          entry.message = outcome.error ?? undefined;
        }
      }
      if (toSend.length > 1) await new Promise((r) => setTimeout(r, BATCH_SEND_DELAY_MS));
    }

    if (toSend.length > 0) {
      await track(
        PRODUCT_EVENTS.TEACHER_INVITE_SENT,
        {
          invite_id: toSend[0].id,
          group_id: groupId,
          kind,
          source,
          batch_size: toSend.length,
        },
        { userId: user.id }
      );
    }

    const created = results.filter((r) => r.outcome === 'created').length;
    return ok({
      batchId,
      created,
      results,
      summary: {
        created,
        duplicate: results.filter((r) => r.outcome === 'duplicate').length,
        alreadyMember: results.filter((r) => r.outcome === 'already_member').length,
        invalid: results.filter((r) => r.outcome === 'invalid_email').length,
        failed: results.filter((r) => r.outcome === 'send_failed').length,
        suppressed: results.filter((r) => r.outcome === 'suppressed').length,
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Internal server error', 500);
  }
}

