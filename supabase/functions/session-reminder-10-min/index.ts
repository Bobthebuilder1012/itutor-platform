import { createClient } from 'npm:@supabase/supabase-js@2.89.0';
import { SESSION_REMINDER_10_MIN } from '../_shared/notificationTemplates.ts';
import { getFcmAccessToken, sendFcmMessage } from '../_shared/fcm.ts';
import { sendWebPush } from '../_shared/webPush.ts';

type SessionRow = {
  id: string;
  scheduled_start_at: string;
  student_id: string;
  tutor_id: string;
};

type PushTokenRow = {
  id: string;
  user_id: string;
  token: string;
  platform: string;
};

const MAX_SEND_CONCURRENCY = 20;

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function iso(d: Date): string {
  return d.toISOString();
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

Deno.serve(async () => {
  const startedAt = Date.now();

  try {
    const SUPABASE_URL = env('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
    const FCM_SERVICE_ACCOUNT_JSON = env('FCM_SERVICE_ACCOUNT_JSON');
    const VAPID_PUBLIC_KEY = env('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = env('VAPID_PRIVATE_KEY');
    const VAPID_SUBJECT = env('VAPID_SUBJECT');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Window 1: now + 9min .. now + 11min (normal 10-minute reminder)
    const now = new Date();
    const windowStart = new Date(now.getTime() + 9 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 11 * 60 * 1000);

    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('id, scheduled_start_at, student_id, tutor_id')
      .eq('status', 'SCHEDULED')
      .gte('scheduled_start_at', iso(windowStart))
      .lte('scheduled_start_at', iso(windowEnd));

    if (sessionsError) throw sessionsError;

    const regularSessions = (sessions ?? []) as SessionRow[];
    let eligibleSessions: SessionRow[] = [];

    // Window 2: Catch sessions starting in <10 minutes that missed their notification
    // This handles cases where sessions were booked very close to start time
    const urgentWindowStart = now;
    const urgentWindowEnd = new Date(now.getTime() + 10 * 60 * 1000);

    const { data: urgentSessions, error: urgentError } = await supabase
      .from('sessions')
      .select('id, scheduled_start_at, student_id, tutor_id')
      .eq('status', 'SCHEDULED')
      .gt('scheduled_start_at', iso(urgentWindowStart))
      .lt('scheduled_start_at', iso(urgentWindowEnd));

    if (urgentError) throw urgentError;

    let urgentSessionRows = (urgentSessions ?? []) as SessionRow[];

    // Check which urgent sessions haven't been notified yet
    if (urgentSessionRows.length > 0) {
      const urgentSessionIds = urgentSessionRows.map(s => s.id);
      
      // Find sessions that already have notifications logged
      const { data: existingLogs, error: logCheckError } = await supabase
        .from('notifications_log')
        .select('session_id')
        .in('session_id', urgentSessionIds)
        .eq('type', SESSION_REMINDER_10_MIN.type);

      if (logCheckError) throw logCheckError;

      const notifiedSessionIds = new Set((existingLogs ?? []).map(l => l.session_id));

      // Add urgent sessions that haven't been notified to eligible sessions
      const unnotifiedUrgentSessions = urgentSessionRows.filter(
        s => !notifiedSessionIds.has(s.id)
      );

      // Merge with regular window sessions (remove duplicates by id)
      const sessionMap = new Map(regularSessions.map(s => [s.id, s]));
      for (const s of unnotifiedUrgentSessions) {
        sessionMap.set(s.id, s);
      }
      urgentSessionRows = unnotifiedUrgentSessions;
      eligibleSessions = Array.from(sessionMap.values());
    } else {
      eligibleSessions = regularSessions;
    }

    // Early exit if no sessions to process
    if (eligibleSessions.length === 0) {
      return Response.json({
        ok: true,
        processedSessions: 0,
        urgentSessions: 0,
        logged: 0,
        durationMs: Date.now() - startedAt,
      });
    }
    if (eligibleSessions.length === 0) {
      return Response.json({
        ok: true,
        processedSessions: 0,
        logged: 0,
        durationMs: Date.now() - startedAt,
      });
    }

    // Build candidate notification log entries (student + tutor)
    const logEntries = eligibleSessions.flatMap((s) => [
      { user_id: s.student_id, session_id: s.id, type: SESSION_REMINDER_10_MIN.type },
      { user_id: s.tutor_id, session_id: s.id, type: SESSION_REMINDER_10_MIN.type },
    ]);

    // Atomic idempotency claim: insert log entries, ignore duplicates.
    const { data: insertedLogs, error: logError } = await supabase
      .from('notifications_log')
      .insert(logEntries, { onConflict: 'user_id,session_id,type', ignoreDuplicates: true })
      .select('user_id, session_id');

    if (logError) throw logError;

    const newLogs = (insertedLogs ?? []) as Array<{ user_id: string; session_id: string }>;
    if (newLogs.length === 0) {
      return Response.json({
        ok: true,
        processedSessions: eligibleSessions.length,
        logged: 0,
        durationMs: Date.now() - startedAt,
      });
    }

    const userIds = Array.from(new Set(newLogs.map((l) => l.user_id)));

    const { data: pushTokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('id, user_id, token, platform')
      .in('user_id', userIds);

    if (tokensError) throw tokensError;

    const tokens = (pushTokens ?? []) as PushTokenRow[];
    if (tokens.length === 0) {
      return Response.json({
        ok: true,
        processedSessions: eligibleSessions.length,
        logged: newLogs.length,
        tokens: 0,
        durationMs: Date.now() - startedAt,
      });
    }

    const tokensByUser = new Map<string, PushTokenRow[]>();
    for (const t of tokens) {
      const arr = tokensByUser.get(t.user_id) ?? [];
      arr.push(t);
      tokensByUser.set(t.user_id, arr);
    }

    const sessionById = new Map(eligibleSessions.map((s) => [s.id, s] as const));

    // Get FCM access token for mobile notifications
    const { accessToken, projectId } = await getFcmAccessToken(FCM_SERVICE_ACCOUNT_JSON);

    // Separate tokens by platform
    const fcmTokens: PushTokenRow[] = [];
    const webTokens: PushTokenRow[] = [];

    for (const token of tokens) {
      if (token.platform === 'web') {
        webTokens.push(token);
      } else {
        fcmTokens.push(token);
      }
    }

    // Fanout: for each (user, session) that was newly logged, notify all tokens for that user.
    const sends: Array<{
      tokenRow: PushTokenRow;
      userId: string;
      sessionId: string;
    }> = [];

    for (const l of newLogs) {
      const rows = tokensByUser.get(l.user_id);
      if (!rows || rows.length === 0) continue;
      for (const tokenRow of rows) {
        sends.push({ tokenRow, userId: l.user_id, sessionId: l.session_id });
      }
    }

    const attemptedTokenIds: string[] = [];
    const sendBatches = chunk(sends, MAX_SEND_CONCURRENCY);

    for (const batch of sendBatches) {
      await Promise.allSettled(
        batch.map(async ({ tokenRow, userId, sessionId }) => {
          attemptedTokenIds.push(tokenRow.id);
          try {
            const session = sessionById.get(sessionId);
            const deepLink =
              session && userId === session.student_id
                ? '/student/sessions'
                : session && userId === session.tutor_id
                ? '/tutor/sessions'
                : undefined;

            // Send via FCM for mobile or Web Push for desktop
            if (tokenRow.platform === 'web') {
              // Parse web push subscription
              const subscription = JSON.parse(tokenRow.token);
              await sendWebPush({
                subscription,
                title: SESSION_REMINDER_10_MIN.title,
                body: SESSION_REMINDER_10_MIN.body,
                data: {
                  session_id: sessionId,
                  ...(deepLink ? { deep_link: deepLink } : {}),
                },
                vapidPublicKey: VAPID_PUBLIC_KEY,
                vapidPrivateKey: VAPID_PRIVATE_KEY,
                vapidSubject: VAPID_SUBJECT
              });
            } else {
              // Send via FCM for mobile (android/ios)
              await sendFcmMessage({
                accessToken,
                projectId,
                token: tokenRow.token,
                title: SESSION_REMINDER_10_MIN.title,
                body: SESSION_REMINDER_10_MIN.body,
                data: {
                  session_id: sessionId,
                  ...(deepLink ? { deep_link: deepLink } : {}),
                },
              });
            }
          } catch {
            // Fail silently per requirements.
          }
        })
      );
    }

    // Best-effort: touch last_used_at for attempted tokens
    if (attemptedTokenIds.length > 0) {
      const nowIso = iso(new Date());
      await supabase.from('push_tokens').update({ last_used_at: nowIso }).in('id', attemptedTokenIds);
    }

    return Response.json({
      ok: true,
      processedSessions: eligibleSessions.length,
      urgentSessions: urgentSessionRows?.length ?? 0,
      logged: newLogs.length,
      tokens: tokens.length,
      sendsAttempted: sends.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    // Fail fast; cron will rerun. Idempotency prevents duplicates.
    return Response.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'unknown_error',
        durationMs: Date.now() - startedAt,
      },
      { status: 200 }
    );
  }
});

