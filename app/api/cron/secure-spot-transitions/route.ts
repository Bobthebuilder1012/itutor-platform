// GET /api/cron/secure-spot-transitions
// Headers: Authorization: Bearer <CRON_SECRET>
//
// Daily. Drives the month-one boundary for secured spots — the point where a
// student's paid first month runs out.
//
// Two jobs, in order:
//
//   1. REMIND — a week before release_date, tell the student their first month
//      is ending and ask whether they want to continue. Sent BEFORE the date,
//      not after: this is the revenue email, and asking someone to renew a
//      thing that already lapsed converts far worse.
//
//   2. LAPSE — once release_date plus the grace window has passed with no
//      subscription, the enrolment completes and the seat goes back. Without
//      this a secured student keeps access forever off one month's payment,
//      and the seat is never resold.
//
// Deliberately NOT here: releasing the money. That is
// flip_owed_to_release_ready, driven by its own cron, and it keys off
// release_date independently. A student choosing not to continue has no
// bearing on whether the tutor gets paid for the month they taught.
//
// Free reservations (release_date IS NULL) are skipped by both jobs: there is
// no money and nothing to renew.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/services/emailService';
import { renderEmail } from '@/lib/email/design';
import { trinidadToday } from '@/lib/payments/secureSpot';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** How long before release_date the student is asked to continue. */
const REMIND_DAYS_BEFORE = 7;

/** How long after release_date the seat is held while they decide. */
const GRACE_DAYS_AFTER = 7;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getServiceClient();
  const today = trinidadToday();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  const result = { reminded: 0, lapsed: 0, errors: [] as string[] };

  // ---------------------------------------------------------------
  // 1. REMIND — release_date within the next REMIND_DAYS_BEFORE days
  // ---------------------------------------------------------------
  try {
    const { data: due, error } = await admin
      .from('group_enrollments')
      .select(`
        id, student_id, group_id, release_date, plan_price_ttd, reminder_count,
        student:profiles!student_id ( id, full_name, email ),
        group:groups!group_id ( id, name, end_date, price_monthly )
      `)
      .eq('status', 'SECURED')
      .not('release_date', 'is', null)
      .gte('release_date', today)
      .lte('release_date', addDays(today, REMIND_DAYS_BEFORE))
      // reminder_count is the existing per-enrolment counter used by the
      // subscription dunning. Reusing it keeps "have we already asked?" in one
      // place, and stops a daily cron emailing the same student seven times.
      .or('reminder_count.is.null,reminder_count.eq.0');

    if (error) throw error;

    for (const row of due ?? []) {
      const student = (row as any).student;
      const group = (row as any).group;
      const releaseDate: string = (row as any).release_date;

      // A class that ends inside the first month has nothing to renew — the
      // student bought the whole thing. Skip rather than invite them to
      // subscribe to a class that is over.
      const endDate: string | null = group?.end_date ?? null;
      if (endDate && endDate <= releaseDate) continue;

      const price = Number(group?.price_monthly ?? (row as any).plan_price_ttd ?? 0);
      const link = `${appUrl}/student/explore/${row.group_id}`;

      if (student?.email) {
        const className = group?.name ?? 'your class';
        // Family 10. A place lapsing is a change to something already agreed,
        // and the sentence that has to survive is "nothing will be charged
        // automatically" — it gets its own panel rather than bold text inside a
        // paragraph, because a family that misreads it stops trusting preorders.
        const email = renderEmail({
          family: 'schedule-change',
          subject: `Your first month of ${group?.name ?? 'class'} ends ${fmtDate(releaseDate)}`,
          heading: 'Your first month is ending',
          intro: `Hi ${student.full_name ?? 'there'},`,
          eyebrow: 'Decide whether to continue',
          blocks: [
            {
              kind: 'details',
              rows: [
                { label: 'Class', value: className, strong: true },
                { label: 'First month ends', value: fmtDate(releaseDate) },
                {
                  label: 'To continue',
                  value: price > 0 ? `TT$${price} a month` : 'See the class page',
                },
              ],
            },
            {
              kind: 'notice',
              tone: 'success',
              title: 'Nothing will be charged automatically',
              body:
                'You paid for that first month up front when you secured your spot, and nothing has been charged since.',
            },
            {
              kind: 'paragraph',
              text: `If you'd rather stop, you don't need to do anything — your place simply ends after ${fmtDate(
                addDays(releaseDate, GRACE_DAYS_AFTER)
              )}.`,
            },
          ],
          cta: { label: `Continue in ${className}`, href: link },
        });
        await sendEmail({
          to: student.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
      }

      await admin.from('notifications').insert({
        user_id: row.student_id,
        type: 'secure_spot_month_ending',
        title: 'Your first month is ending',
        message: `Your first month of ${group?.name ?? 'your class'} ends ${fmtDate(releaseDate)}. Continue if you'd like to keep your place.`,
        group_id: row.group_id,
        metadata: { groupId: row.group_id, enrollmentId: row.id, releaseDate },
      });

      await admin
        .from('group_enrollments')
        .update({
          reminder_count: ((row as any).reminder_count ?? 0) + 1,
          last_reminder_sent_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      result.reminded += 1;
    }
  } catch (err) {
    console.error('[secure-spot-transitions] remind failed:', err);
    result.errors.push(`remind: ${(err as Error)?.message}`);
  }

  // ---------------------------------------------------------------
  // 2. LAPSE — grace window has passed and they didn't continue
  // ---------------------------------------------------------------
  try {
    const cutoff = addDays(today, -GRACE_DAYS_AFTER);

    const { data: expired, error } = await admin
      .from('group_enrollments')
      .select(`
        id, student_id, group_id, release_date,
        student:profiles!student_id ( id, full_name, email ),
        group:groups!group_id ( id, name, price_monthly )
      `)
      .eq('status', 'SECURED')
      .not('release_date', 'is', null)
      .lt('release_date', cutoff);

    if (error) throw error;

    for (const row of expired ?? []) {
      const student = (row as any).student;
      const group = (row as any).group;
      const releaseDate: string = (row as any).release_date;

      // COMPLETED, not CANCELLED: the student received exactly what they paid
      // for. Cancelled would misreport it in every revenue view and imply a
      // refund that isn't owed.
      //
      // .select() so we know whether this actually transitioned. The status
      // guard alone is not enough: if the student subscribed between the query
      // above and this update, the update no-ops — and removing their
      // membership anyway would cut off a student who had just paid.
      const { data: transitioned } = await admin
        .from('group_enrollments')
        .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('status', 'SECURED')
        .select('id');

      if (!transitioned?.length) continue;

      // Access ends with the paid period. The seat is freed for resale by the
      // same change, since capacity counts SECURED but not COMPLETED.
      await admin
        .from('group_members')
        .update({ status: 'removed' })
        .eq('group_id', row.group_id)
        .eq('user_id', row.student_id);

      // Tell them. Losing a class silently, a month after paying for it, is a
      // support ticket at best and a chargeback at worst — the student has no
      // way to know whether this was intended or a fault.
      const rejoinLink = `${appUrl}/student/explore/${row.group_id}`;
      const price = Number(group?.price_monthly ?? 0);

      if (student?.email) {
        const className = group?.name ?? 'your class';
        const email = renderEmail({
          family: 'schedule-change',
          subject: `Your place in ${group?.name ?? 'your class'} has ended`,
          heading: 'Your place has ended',
          intro: `Hi ${student.full_name ?? 'there'},`,
          eyebrow: 'Place released',
          tone: 'neutral',
          blocks: [
            {
              kind: 'details',
              rows: [
                { label: 'Class', value: className },
                { label: 'First month ran until', value: fmtDate(releaseDate) },
                { label: 'Place held a further', value: `${GRACE_DAYS_AFTER} days` },
              ],
            },
            {
              kind: 'paragraph',
              text:
                "We held your place in case you wanted to continue, and as we haven't heard from you it has been released.",
            },
            {
              kind: 'notice',
              tone: 'success',
              title: 'You have not been charged anything further',
              body: 'There is nothing you need to do.',
            },
            {
              kind: 'paragraph',
              text: `If you'd like to come back, the class is still open to join${
                price > 0 ? ` from TT$${price} a month` : ''
              }.`,
            },
          ],
          cta: { label: `Rejoin ${className}`, href: rejoinLink },
        });
        await sendEmail({
          to: student.email,
          subject: email.subject,
          html: email.html,
          text: email.text,
        });
      }

      await admin.from('notifications').insert({
        user_id: row.student_id,
        type: 'secure_spot_lapsed',
        title: 'Your place has ended',
        message: `Your first month of ${group?.name ?? 'your class'} ended ${fmtDate(releaseDate)} and your place has been released. You can rejoin any time.`,
        group_id: row.group_id,
        metadata: { groupId: row.group_id, enrollmentId: row.id, releaseDate },
      });

      result.lapsed += 1;
    }
  } catch (err) {
    console.error('[secure-spot-transitions] lapse failed:', err);
    result.errors.push(`lapse: ${(err as Error)?.message}`);
  }

  console.log('[secure-spot-transitions]', result);
  return NextResponse.json({ ok: result.errors.length === 0, ...result });
}
