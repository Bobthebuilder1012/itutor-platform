// The ICS feed's data and formatting — one place, because RFC 5545 is fussy and
// a calendar that fails to parse fails silently in the subscriber's client.
//
// WHAT IS DELIBERATELY NOT IN THE FEED
// Attendance. The family calendar in the app shows attended / late / absent, and
// this feed does not, even though the parent is entitled to both.
//
// A subscribed calendar is not a private page. It syncs into whatever client the
// parent uses, and those calendars get shared with a spouse, mirrored into a work
// account, or shown on a shared screen. "Aaliyah — ABSENT" appearing in a
// workplace calendar is a disclosure about a child that nobody chose to make, and
// the same URL is a bearer token that cannot be un-pasted once it leaks. The
// schedule is the useful part; the judgement stays in the app behind a login.

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

/** 32 bytes base64url — long enough that guessing is not a strategy. */
export function mintFeedToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function getOrCreateFeedToken(
  admin: SupabaseClient,
  userId: string
): Promise<string> {
  const { data } = await admin
    .from('calendar_feed_tokens')
    .select('token')
    .eq('user_id', userId)
    .maybeSingle();

  const existing = (data as { token: string } | null)?.token;
  if (existing) return existing;

  const token = mintFeedToken();
  await admin.from('calendar_feed_tokens').insert({ user_id: userId, token });
  return token;
}

/** Rotation is the only recovery once a link has leaked — you cannot un-paste a URL. */
export async function rotateFeedToken(
  admin: SupabaseClient,
  userId: string
): Promise<string> {
  const token = mintFeedToken();
  await admin
    .from('calendar_feed_tokens')
    .upsert(
      { user_id: userId, token, created_at: new Date().toISOString(), last_used_at: null },
      { onConflict: 'user_id' }
    );
  return token;
}

export async function resolveFeedToken(
  admin: SupabaseClient,
  token: string
): Promise<string | null> {
  if (!token || token.length < 32) return null;

  const { data } = await admin
    .from('calendar_feed_tokens')
    .select('user_id')
    .eq('token', token)
    .maybeSingle();

  const userId = (data as { user_id: string } | null)?.user_id ?? null;
  if (!userId) return null;

  // Best effort: lets a parent see whether anything is actually subscribed, and
  // gives support something to look at when a feed "stops working".
  void admin
    .from('calendar_feed_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('token', token);

  return userId;
}

// ---------------------------------------------------------------------------
// RFC 5545
// ---------------------------------------------------------------------------

/** Escapes the four characters that change meaning inside a property value. */
function esc(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Folds to 75 octets per line, as the spec requires.
 *
 * Not cosmetic: Outlook in particular rejects over-long lines, and a rejected
 * calendar simply never appears — the parent sees nothing and has no error to
 * report. Folding counts BYTES, not characters, so a tutor name with an accent
 * cannot push a line over the limit.
 */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let start = 0;
  let limit = 75;

  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Do not split a multi-byte character: back off to a lead byte.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74; // continuation lines carry a leading space
  }

  return parts.join('\r\n ');
}

/** UTC basic format: 20260814T160000Z */
function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export type FeedEvent = {
  uid: string;
  start: string;
  end: string | null;
  summary: string;
  description?: string | null;
  cancelled?: boolean;
};

export function buildIcs(params: { name: string; events: FeedEvent[] }): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//iTutor//Family Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(params.name)}`,
    'X-WR-TIMEZONE:America/Port_of_Spain',
    // Ask clients to re-fetch hourly. Without it some poll once a day, and a
    // class added this morning would not appear until tomorrow.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  const stamp = icsDate(new Date().toISOString());

  for (const e of params.events) {
    const end = e.end ?? new Date(new Date(e.start).getTime() + 3_600_000).toISOString();
    lines.push(
      'BEGIN:VEVENT',
      fold(`UID:${e.uid}@myitutor.com`),
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(end)}`,
      fold(`SUMMARY:${esc(e.summary)}`),
      ...(e.description ? [fold(`DESCRIPTION:${esc(e.description)}`)] : []),
      // Cancelled classes stay in the feed as CANCELLED rather than vanishing:
      // a class that disappears from a parent's calendar looks like a sync bug,
      // and they turn up to a session that is not running.
      `STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  // CRLF throughout, per the spec.
  return lines.join('\r\n') + '\r\n';
}

/**
 * Every scheduled class for a parent's children, schedule only.
 *
 * A wide window either side: a subscribed calendar is expected to hold history,
 * and a parent scrolling back to last term should not find it empty.
 */
export async function collectFeedEvents(
  admin: SupabaseClient,
  parentId: string
): Promise<{ events: FeedEvent[]; childCount: number }> {
  const { data: links } = await admin
    .from('parent_child_links')
    .select('child_id')
    .eq('parent_id', parentId);

  const childIds = ((links ?? []) as unknown as Array<{ child_id: string }>).map((l) => l.child_id);
  if (childIds.length === 0) return { events: [], childCount: 0 };

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, display_name')
    .in('id', childIds);

  const firstName = new Map(
    ((profiles ?? []) as unknown as Array<{
      id: string;
      full_name: string | null;
      display_name: string | null;
    }>).map((p) => [p.id, (p.display_name || p.full_name || 'Child').split(' ')[0]])
  );

  const from = new Date(Date.now() - 180 * 86_400_000).toISOString();
  const to = new Date(Date.now() + 180 * 86_400_000).toISOString();

  const events: FeedEvent[] = [];

  // ---- 1:1 sessions -------------------------------------------------------
  const { data: sessions } = await admin
    .from('sessions')
    .select('id, student_id, tutor_id, scheduled_start_at, scheduled_end_at, cancelled_at')
    .in('student_id', childIds)
    .gte('scheduled_start_at', from)
    .lte('scheduled_start_at', to)
    .limit(800);

  const sessionRows = (sessions ?? []) as unknown as Array<{
    id: string;
    student_id: string;
    tutor_id: string;
    scheduled_start_at: string;
    scheduled_end_at: string | null;
    cancelled_at: string | null;
  }>;

  const tutorIds = new Set(sessionRows.map((s) => s.tutor_id).filter(Boolean));

  // ---- group occurrences --------------------------------------------------
  const [{ data: enrolments }, { data: members }] = await Promise.all([
    admin
      .from('group_enrollments')
      .select('student_id, group_id')
      .in('student_id', childIds)
      .in('status', ['ACTIVE', 'GRACE', 'SECURED']),
    admin
      .from('group_members')
      .select('user_id, group_id')
      .in('user_id', childIds)
      .in('status', ['approved', 'active']),
  ]);

  const childGroups = new Map<string, Set<string>>();
  for (const e of (enrolments ?? []) as unknown as Array<{ student_id: string; group_id: string }>) {
    if (!childGroups.has(e.student_id)) childGroups.set(e.student_id, new Set());
    childGroups.get(e.student_id)!.add(e.group_id);
  }
  for (const m of (members ?? []) as unknown as Array<{ user_id: string; group_id: string }>) {
    if (!childGroups.has(m.user_id)) childGroups.set(m.user_id, new Set());
    childGroups.get(m.user_id)!.add(m.group_id);
  }

  const groupIds = Array.from(new Set([...childGroups.values()].flatMap((s) => [...s])));
  const groupName = new Map<string, string>();
  const groupTutor = new Map<string, string>();

  if (groupIds.length > 0) {
    const { data: groups } = await admin
      .from('groups')
      .select('id, name, subject, tutor_id')
      .in('id', groupIds);

    for (const g of (groups ?? []) as unknown as Array<{
      id: string;
      name: string | null;
      subject: string | null;
      tutor_id: string;
    }>) {
      groupName.set(g.id, g.name || g.subject || 'Group class');
      groupTutor.set(g.id, g.tutor_id);
      if (g.tutor_id) tutorIds.add(g.tutor_id);
    }
  }

  const { data: tutors } = tutorIds.size
    ? await admin.from('profiles').select('id, full_name, display_name').in('id', [...tutorIds])
    : { data: [] };

  const tutorName = new Map(
    ((tutors ?? []) as unknown as Array<{
      id: string;
      full_name: string | null;
      display_name: string | null;
    }>).map((t) => [t.id, t.display_name || t.full_name || 'Tutor'])
  );

  for (const s of sessionRows) {
    const child = firstName.get(s.student_id) ?? 'Child';
    const tutor = tutorName.get(s.tutor_id) ?? 'tutor';
    events.push({
      uid: `session-${s.id}`,
      start: s.scheduled_start_at,
      end: s.scheduled_end_at,
      summary: `${child} — 1:1 with ${tutor}`,
      description: 'iTutor 1:1 session',
      cancelled: Boolean(s.cancelled_at),
    });
  }

  if (groupIds.length > 0) {
    const { data: gs } = await admin
      .from('group_sessions')
      .select('id, group_id')
      .in('group_id', groupIds);

    const gsToGroup = new Map(
      ((gs ?? []) as unknown as Array<{ id: string; group_id: string }>).map((r) => [
        r.id,
        r.group_id,
      ])
    );

    const gsIds = [...gsToGroup.keys()];
    if (gsIds.length > 0) {
      const { data: occ } = await admin
        .from('group_session_occurrences')
        .select('id, group_session_id, scheduled_start_at, scheduled_end_at, cancelled_at')
        .in('group_session_id', gsIds)
        .gte('scheduled_start_at', from)
        .lte('scheduled_start_at', to)
        .limit(1200);

      for (const o of (occ ?? []) as unknown as Array<{
        id: string;
        group_session_id: string;
        scheduled_start_at: string;
        scheduled_end_at: string | null;
        cancelled_at: string | null;
      }>) {
        const groupId = gsToGroup.get(o.group_session_id);
        if (!groupId) continue;

        for (const [childId, set] of childGroups) {
          if (!set.has(groupId)) continue;
          const child = firstName.get(childId) ?? 'Child';
          const tutorId = groupTutor.get(groupId);
          events.push({
            // Unique per child: two siblings in one class are two events, or a
            // client would show one and silently drop the other.
            uid: `occurrence-${o.id}-${childId}`,
            start: o.scheduled_start_at,
            end: o.scheduled_end_at,
            summary: `${child} — ${groupName.get(groupId) ?? 'Group class'}`,
            description: tutorId ? `With ${tutorName.get(tutorId) ?? 'your tutor'}` : null,
            cancelled: Boolean(o.cancelled_at),
          });
        }
      }
    }
  }

  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return { events, childCount: childIds.length };
}
