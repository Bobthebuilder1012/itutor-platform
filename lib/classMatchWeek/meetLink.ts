/**
 * Per-session Google Meet rooms for Class Match Week.
 *
 * This deliberately does NOT reuse `lib/services/groupMeetingLink.ts`. That
 * path mints ONE link per class series, lazily on first join, cached 30 days —
 * a weekly series shares that room across as many as 104 occurrences. A
 * campaign taster is a one-off with strangers in it; borrowing the series link
 * would hand every taster attendee a door into the paying class's room, and a
 * cancelled taster could not revoke it (the link is series-scoped and cached).
 * So each campaign session gets its own room, minted at publish time.
 *
 * Rooms are created against the TEACHER'S OWN Google account via their OAuth
 * token — there is no platform Google account. Modelled on the 1:1 path in
 * lib/services/videoProviders.ts (GoogleMeetAdapter.createMeetingWithRetry):
 * same connection row, same encryption, same refresh-once-then-retry shape.
 *
 * Never throws. Every production token has `token_expires_at` in the past, so
 * the refresh path is the COMMON path, not the exception — and a terminal
 * failure here has to surface to the teacher as "reconnect Google", not as a
 * bare 500 from an unhandled rejection.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { decrypt, encrypt } from '@/lib/utils/encryption';

const RECONNECT_URL = '/api/auth/google/connect';

export type MintMeetLinkArgs = {
  tutorId: string;
  title: string;
  /** ISO timestamp of the session start. */
  scheduledAt: string;
  durationMinutes: number;
};

export type MintMeetLinkResult =
  | { ok: true; url: string }
  /**
   * `reconnectUrl` is OPTIONAL, and absent means reconnecting cannot help. Every
   * failure used to carry it, so the one failure it can do nothing about — a
   * deployment with no TOKEN_ENCRYPTION_KEY — still offered the button, and the
   * teacher who pressed it landed on a Google error instead of a fix. A remedy
   * offered for a problem it does not solve is worse than no remedy.
   */
  | { ok: false; reason: string; reconnectUrl?: string };

function fail(reason: string): MintMeetLinkResult {
  return { ok: false, reason, reconnectUrl: RECONNECT_URL };
}

/** A failure the teacher cannot act on. Deliberately carries no reconnect link. */
function failOurFault(reason: string): MintMeetLinkResult {
  return { ok: false, reason };
}

/**
 * Decrypt a stored token, distinguishing the two ways it fails.
 *
 * These look identical from a bare `catch` and they are not the same problem:
 *
 *   - **`TOKEN_ENCRYPTION_KEY` is not set on this deployment.** A server
 *     misconfiguration affecting every teacher. Reconnecting cannot fix it —
 *     `encrypt()` throws on the same missing key, so the reconnect would fail on
 *     the way back and the teacher would loop. Telling them to reconnect here is
 *     actively wrong advice, which is why this returns different copy.
 *   - **The value will not decrypt with the key we have.** Usually a row
 *     encrypted under a different key — the shape you get when a preview or
 *     staging deployment reads a database whose tokens were written elsewhere.
 *     Reconnecting DOES fix this, because it re-encrypts under the current key.
 *
 * Both are logged, because the previous silent catch left no trace in the
 * runtime logs at all: the only evidence was the sentence the teacher saw.
 */
function readToken(
  encrypted: string,
  label: 'access' | 'refresh'
): { ok: true; token: string } | { ok: false; result: MintMeetLinkResult } {
  if (!process.env.TOKEN_ENCRYPTION_KEY) {
    console.error(
      `[class-match-week] TOKEN_ENCRYPTION_KEY is not set — cannot read the ${label} token. ` +
        'This is a deployment configuration problem, not a teacher problem.'
    );
    return {
      ok: false,
      result: failOurFault(
        'Video setup is misconfigured on our side, so we could not create the meeting link. Please contact support — reconnecting will not help.'
      ),
    };
  }

  try {
    return { ok: true, token: decrypt(encrypted) };
  } catch (err) {
    console.error(
      `[class-match-week] Failed to decrypt the ${label} token for a tutor. The stored value ` +
        'does not match this deployment\'s TOKEN_ENCRYPTION_KEY:',
      err instanceof Error ? err.message : err
    );
    return {
      ok: false,
      result: fail('Stored Google credentials could not be read. Reconnect Google Meet.'),
    };
  }
}

async function createCalendarEvent(
  accessToken: string,
  args: MintMeetLinkArgs,
  requestId: string
): Promise<Response> {
  const start = new Date(args.scheduledAt);
  const end = new Date(start.getTime() + args.durationMinutes * 60000);

  return fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: args.title,
        description: 'Class Match Week session via iTutor',
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    }
  );
}

/**
 * Refresh the teacher's Google access token and persist it back to the same
 * columns videoProviders.ts writes, so the two paths never disagree about
 * which token is current.
 */
async function refreshAccessToken(
  admin: SupabaseClient,
  tutorId: string,
  refreshToken: string
): Promise<{ ok: true; accessToken: string } | { ok: false; reason: string }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    return { ok: false, reason: 'Google session expired and could not be refreshed. Reconnect Google Meet.' };
  }

  const data = await response.json();
  const accessToken: string | undefined = data.access_token;
  if (!accessToken) {
    return { ok: false, reason: 'Google returned no access token on refresh. Reconnect Google Meet.' };
  }

  const expiresIn = data.expires_in || 3600;
  const { error } = await admin
    .from('tutor_video_provider_connections')
    .update({
      access_token_encrypted: encrypt(accessToken),
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('tutor_id', tutorId)
    .eq('provider', 'google_meet');

  if (error) {
    // The refreshed token works for this request even if we failed to store
    // it — proceed rather than blocking the publish on a bookkeeping write.
    console.error('[class-match-week] Failed to persist refreshed Google token:', error);
  }

  return { ok: true, accessToken };
}

/** Mint a one-off Meet room on the teacher's own Google account. Never throws. */
export async function mintCampaignMeetLink(
  admin: SupabaseClient,
  args: MintMeetLinkArgs
): Promise<MintMeetLinkResult> {
  try {
    const { data: connection } = await admin
      .from('tutor_video_provider_connections')
      .select('access_token_encrypted, refresh_token_encrypted')
      .eq('tutor_id', args.tutorId)
      .eq('provider', 'google_meet')
      .maybeSingle();

    if (!connection?.access_token_encrypted) {
      return fail('No Google Meet connection found. Connect Google Meet in Settings.');
    }

    const access = readToken(connection.access_token_encrypted, 'access');
    if (!access.ok) return access.result;
    const accessToken = access.token;

    const start = new Date(args.scheduledAt);
    if (Number.isNaN(start.getTime())) {
      return fail('Session time is not a valid date.');
    }

    // Minted once and reused on the retry: Google treats requestId as an
    // idempotency key, so a retry after token refresh lands on the same room
    // instead of leaking an orphaned calendar event.
    const requestId = `cmw-${randomBytes(8).toString('hex')}`;

    let response = await createCalendarEvent(accessToken, args, requestId);

    // 401/403 means the stored access token is stale — the expected state, since
    // every production row has token_expires_at in the past. Refresh once, retry once.
    if (!response.ok && (response.status === 401 || response.status === 403)) {
      if (!connection.refresh_token_encrypted) {
        return fail('Google session expired and no refresh token is stored. Reconnect Google Meet.');
      }

      const refresh = readToken(connection.refresh_token_encrypted, 'refresh');
      if (!refresh.ok) return refresh.result;

      const refreshed = await refreshAccessToken(admin, args.tutorId, refresh.token);
      if (!refreshed.ok) return fail(refreshed.reason);

      response = await createCalendarEvent(refreshed.accessToken, args, requestId);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[class-match-week] Google Calendar API error:', response.status, errorText);
      return fail(`Google Calendar API error (${response.status}). Try again, or reconnect Google Meet.`);
    }

    const event = await response.json();
    const url: string =
      event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri || '';

    if (!url) {
      // Event created but no conference attached — usually a Workspace policy
      // on the teacher's account. Reconnecting picks a different account.
      console.error('[class-match-week] Calendar event has no Meet link:', event.id);
      return fail('Google created the event but returned no Meet link. Reconnect Google Meet.');
    }

    return { ok: true, url };
  } catch (err) {
    console.error('[class-match-week] mintCampaignMeetLink failed:', err);
    return fail(err instanceof Error ? err.message : 'Unexpected error creating the Meet link.');
  }
}
