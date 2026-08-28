// =====================================================
// Group-class session reminders
// =====================================================
// Two reminders, both riding on the existing session_reminders queue rather
// than a second reminder system:
//
//   'today'  the day a class's SCHEDULE begins — the first occurrence of a
//            recurrence row, not every Tuesday of a weekly series.
//   '10m'    every occurrence, the final nudge — with the join link for an
//            online seat, and with the address for a seat in the room.
//
// ── THE 10-MINUTE REMINDER IS PER SEAT, NOT PER CLASS ──────────────────────
// "The room is open — join a couple of minutes early" is the wrong sentence
// for someone who has to travel, and a Join button is the wrong control. On a
// hybrid class both kinds of student get the same occurrence at the same
// minute, so the variant is chosen per recipient from their own
// group_enrollments.seat_type — never from the class format, which would send
// half the roster the wrong instruction.
//
// The venue is read per OCCURRENCE first: a session relocated for one week has
// to send that week's address, which is the entire point of relocating one.
//
// Unlike 1:1 reminders these are NOT queued ahead. A class roster changes
// between an occurrence being generated and it happening, so recipients are
// resolved when the reminder is due and the queue row is written as the claim:
// the unique index on (group_occurrence_id, recipient_email, reminder_type)
// makes that atomic, so a re-run or two overlapping polls cannot double-send.

import { type SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/services/emailService';
import { renderEmail } from '@/lib/email/design';

/** All class times are Trinidad times. */
const TRINIDAD_TZ = 'America/Port_of_Spain';

export type GroupReminderType = 'today' | '10m';

export interface GroupReminderResult {
  claimed: number;
  sent: number;
  failed: number;
}

interface Recipient {
  userId: string;
  email: string;
  name: string | null;
  type: 'student' | 'tutor';
  /** What this person bought. 'physical' gets directions, not a link. */
  seatType: 'online' | 'physical';
}

/** The place this occurrence meets, already resolved through any override. */
interface ReminderVenue {
  name: string;
  regionName: string | null;
  addressLine: string | null;
  accessInstructions: string | null;
  arrivalNotes: string | null;
}

/**
 * Everyone who should hear about a class session: approved members plus the
 * tutor. Resolved now, not when the occurrence was created.
 */
async function resolveRecipients(
  admin: SupabaseClient,
  groupId: string,
  tutorId: string | null
): Promise<Recipient[]> {
  const out: Recipient[] = [];

  const { data: members } = await admin
    .from('group_members')
    .select('user_id, profile:profiles!group_members_user_id_fkey(id, full_name, email)')
    .eq('group_id', groupId)
    .in('status', ['approved', 'active']);

  // Which seat each student holds. Tiered, because `seat_type` arrives in
  // migration 242 and a missing column fails the WHOLE select — which here
  // would stop every reminder for every class rather than degrade one line of
  // one email. Anything we cannot read is treated as online, which is what
  // every class was before 242.
  const seatByStudent = new Map<string, 'online' | 'physical'>();
  for (const cols of ['student_id, seat_type, status', 'student_id, status']) {
    const { data: enrolments, error } = await admin
      .from('group_enrollments')
      .select(cols)
      .eq('group_id', groupId)
      .in('status', ['SECURED', 'ACTIVE', 'GRACE', 'SUSPENDED']);
    if (error) continue;
    for (const e of (enrolments ?? []) as any[]) {
      seatByStudent.set(e.student_id, e.seat_type === 'physical' ? 'physical' : 'online');
    }
    break;
  }

  const seen = new Set<string>();

  for (const m of members ?? []) {
    const p = (m as any).profile;
    if (p?.email && !seen.has(p.id)) {
      seen.add(p.id);
      out.push({
        userId: p.id,
        email: p.email,
        name: p.full_name,
        type: 'student',
        seatType: seatByStudent.get(p.id) ?? 'online',
      });
    }
  }

  // Subscribers who have no group_members row. The two tables diverge — the
  // attendance register reads both for exactly this reason — and a student who
  // is only in group_enrollments was getting no reminder at all. For an online
  // class that is a missed nudge; for a class in a room it is the difference
  // between turning up and not.
  const missing = [...seatByStudent.keys()].filter((id) => !seen.has(id));
  if (missing.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', missing);
    for (const prof of (profiles ?? []) as any[]) {
      if (!prof.email || seen.has(prof.id)) continue;
      seen.add(prof.id);
      out.push({
        userId: prof.id,
        email: prof.email,
        name: prof.full_name,
        type: 'student',
        seatType: seatByStudent.get(prof.id) ?? 'online',
      });
    }
  }

  if (tutorId) {
    const { data: tutor } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', tutorId)
      .maybeSingle();
    if ((tutor as any)?.email) {
      out.push({
        userId: (tutor as any).id,
        email: (tutor as any).email,
        name: (tutor as any).full_name,
        type: 'tutor',
        // The tutor holds no seat. They get the location variant whenever the
        // session has a venue, because they are the one who has to open it.
        seatType: 'online',
      });
    }
  }

  return out;
}

/**
 * Claims one reminder for one recipient.
 *
 * Returns false when the row already exists — someone else (a concurrent run,
 * or this cron an hour ago) has it. The insert IS the lock; checking first and
 * inserting after would leave a window between the two.
 */
async function claim(
  admin: SupabaseClient,
  occurrenceId: string,
  recipient: Recipient,
  reminderType: GroupReminderType,
  sendAt: string
): Promise<boolean> {
  const { error } = await admin.from('session_reminders').insert({
    group_occurrence_id: occurrenceId,
    session_id: null,
    recipient_email: recipient.email,
    recipient_type: recipient.type,
    reminder_type: reminderType,
    send_at: sendAt,
    status: 'sent',
  });

  // 23505 = unique violation: already claimed. Any other error is real.
  if (error) {
    if (error.code === '23505') return false;
    console.error('[groupReminders] claim failed:', error.message);
    return false;
  }
  return true;
}

/** 12-hour, matching how times read everywhere else in the product. */
function fmtTime(d: Date): string {
  return (
    d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: TRINIDAD_TZ,
    }) + ' AST'
  );
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: TRINIDAD_TZ,
  });
}

/**
 * Where this occurrence meets: the per-session override if the tutor moved it
 * this week, otherwise the class venue.
 *
 * Every step is non-fatal and returns null. A reminder that goes out without
 * an address is worse than one with it; a reminder that does not go out at all
 * because a venue read failed is worse than both.
 */
async function resolveVenue(
  admin: SupabaseClient,
  occurrenceId: string,
  groupId: string
): Promise<ReminderVenue | null> {
  try {
    let venueId: string | null = null;

    const { data: occ } = await admin
      .from('group_session_occurrences')
      .select('venue_id')
      .eq('id', occurrenceId)
      .maybeSingle();
    venueId = (occ as any)?.venue_id ?? null;

    if (!venueId) {
      const { data: group } = await admin
        .from('groups')
        .select('venue_id')
        .eq('id', groupId)
        .maybeSingle();
      venueId = (group as any)?.venue_id ?? null;
    }

    if (!venueId) return null;

    const { data: venue } = await admin
      .from('venues')
      .select('name, address_line, access_instructions, arrival_notes, region:regions(name)')
      .eq('id', venueId)
      .maybeSingle();
    if (!venue) return null;

    const regionRaw = (venue as any).region;
    const region = Array.isArray(regionRaw) ? (regionRaw[0] ?? null) : regionRaw;

    return {
      name: (venue as any).name,
      regionName: region?.name ?? null,
      addressLine: (venue as any).address_line ?? null,
      accessInstructions: (venue as any).access_instructions ?? null,
      arrivalNotes: (venue as any).arrival_notes ?? null,
    };
  } catch (err) {
    // 242 unapplied, or the column is absent. An online-only deployment.
    console.warn('[groupReminders] venue unavailable:', err);
    return null;
  }
}

/**
 * Sends one reminder to everyone who should get it.
 *
 * Per-recipient isolation: each claim and send is independent, so a bounce or
 * a duplicate on one address cannot suppress anybody else's.
 */
export async function sendGroupOccurrenceReminder(args: {
  admin: SupabaseClient;
  occurrenceId: string;
  groupId: string;
  groupName: string;
  tutorId: string | null;
  startAt: Date;
  reminderType: GroupReminderType;
  joinUrl: string | null;
  appUrl: string;
}): Promise<GroupReminderResult> {
  const { admin, occurrenceId, groupId, groupName, tutorId, startAt, reminderType, joinUrl, appUrl } = args;
  const result: GroupReminderResult = { claimed: 0, sent: 0, failed: 0 };

  const recipients = await resolveRecipients(admin, groupId, tutorId);
  if (recipients.length === 0) return result;

  const classLink = `${appUrl}/student/classes/${groupId}`;
  const link = joinUrl || classLink;

  // Resolved once per occurrence, not once per recipient: a class of twenty
  // would otherwise make sixty reads for one address that is the same for all
  // of them.
  const venue = await resolveVenue(admin, occurrenceId, groupId);

  for (const r of recipients) {
    const got = await claim(admin, occurrenceId, r, reminderType, new Date().toISOString());
    if (!got) continue;
    result.claimed += 1;

    try {
      // Families 06 — the same session-reminder shape as one-to-one reminders,
      // so a parent who gets both does not see two different kinds of email
      // about two classes on the same evening.
      const startingToday = reminderType === 'today';

      // SHOWING the address and MAKING IT THE BUTTON are two decisions, and a
      // hybrid tutor is why. They are in the room and running a call at the
      // same time: they need the address on the page, but the button still has
      // to be the meeting link, or the one person who can let the online half
      // in is sent to Google Maps instead.
      const showVenue = Boolean(venue) && (r.seatType === 'physical' || r.type === 'tutor');
      const inRoom =
        Boolean(venue) &&
        (r.type === 'tutor' ? !joinUrl : r.seatType === 'physical');

      const venueLines: string[] = [];
      if (showVenue && venue) {
        venueLines.push(venue.regionName ? `${venue.name}, ${venue.regionName}` : venue.name);
        if (venue.addressLine) venueLines.push(venue.addressLine);
        if (venue.accessInstructions) venueLines.push(venue.accessInstructions);
        if (venue.arrivalNotes) venueLines.push(venue.arrivalNotes);
      }

      // Maps, not the app. Ten minutes before class, the thing the student
      // needs is directions on their phone, and sending them to a class page
      // to find an address is a step too many at exactly the wrong moment.
      const mapsHref = venue?.addressLine
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.name}, ${venue.addressLine}`)}`
        : null;

      const { subject, html, text } = renderEmail({
        family: 'session-reminder',
        subject: startingToday
          ? `${groupName} starts today`
          : `${groupName} starts in 10 minutes`,
        heading: startingToday ? 'Your class is today' : 'Your class starts in 10 minutes',
        intro: r.name ? `Hi ${r.name}, here are the details.` : 'Here are the details.',
        badge: startingToday ? 'Today' : '10m',
        blocks: [
          {
            kind: 'card',
            title: groupName,
            lines: [`${fmtTime(startAt)} · ${fmtDate(startAt)}`],
          },
          ...(venueLines.length > 0
            ? [{ kind: 'card' as const, title: 'Where', lines: venueLines }]
            : []),
          {
            kind: 'paragraph' as const,
            text: startingToday
              ? r.type === 'tutor'
                ? 'This is the first session of the schedule you set. Your students have been told too.'
                : inRoom
                  ? 'This is the first session of the class. Give yourself time to get there.'
                  : 'This is the first session of the class. See you there.'
              : inRoom
                // Not "join a couple of minutes early" — there is nothing to
                // join, and ten minutes is not enough time to travel. What is
                // useful now is the door, not the clock.
                ? 'Class is about to start. Head in when you arrive.'
                : 'The room is open — join a couple of minutes early if you can.',
          },
        ],
        cta: {
          label: inRoom
            ? (mapsHref ? 'Get directions' : 'Open the class')
            : startingToday ? 'Open the class' : 'Join now',
          href: inRoom ? (mapsHref ?? classLink) : link,
        },
      });

      await sendEmail({ to: r.email, subject, html, text });
      result.sent += 1;

      await admin.from('notifications').insert({
        user_id: r.userId,
        type: 'SESSION_REMINDER',
        title: reminderType === 'today' ? `${groupName} starts today` : `${groupName} starts in 10 minutes`,
        message:
          reminderType === 'today'
            ? `Your first session is today at ${fmtTime(startAt)}.`
            : inRoom
              ? `Starting at ${fmtTime(startAt)}${venue ? ` at ${venue.name}` : ''}.`
              : `Starting at ${fmtTime(startAt)}. Tap to join.`,
        group_id: groupId,
        metadata: { groupId, occurrenceId, reminderType },
      });
    } catch (err) {
      // The claim stands even though the send failed — retrying would risk a
      // duplicate for everyone whose send DID work, and this is a reminder,
      // not a payment.
      result.failed += 1;
      console.error('[groupReminders] send failed', { occurrenceId, to: r.email, err });
    }
  }

  return result;
}
