// =====================================================
// SEND PUSH ON NOTIFICATION
// =====================================================
// Triggered by Postgres pg_net.http_post AFTER a row is inserted into
// public.notifications. Fans the notification out to all of the recipient's
// registered push tokens via FCM and Web Push, with each channel decoupled
// so a failure in one does not block the other.

import { createClient } from 'npm:@supabase/supabase-js@2.89.0';
import { getFcmAccessToken, sendFcmMessage } from '../_shared/fcm.ts';
import { sendWebPush } from '../_shared/webPush.ts';

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
};

type PushTokenRow = {
  id: string;
  user_id: string;
  token: string;
  platform: string;
};

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function isWebPushSubscriptionToken(token: string): boolean {
  try {
    const parsed = JSON.parse(token);
    return Boolean(
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.endpoint === 'string' &&
      parsed.endpoint.length > 0 &&
      parsed.keys &&
      typeof parsed.keys.p256dh === 'string' &&
      typeof parsed.keys.auth === 'string'
    );
  } catch {
    return false;
  }
}

function isExpiredSubscriptionError(err: unknown): boolean {
  const code = (err as any)?.statusCode;
  if (code === 404 || code === 410) return true;
  const msg = err instanceof Error ? err.message : '';
  return /status=(404|410)\b/.test(msg);
}

Deno.serve(async (req) => {
  const startedAt = Date.now();

  try {
    const SUPABASE_URL = env('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
    const VAPID_PUBLIC_KEY = env('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = env('VAPID_PRIVATE_KEY');
    const VAPID_SUBJECT = env('VAPID_SUBJECT');
    const FCM_SERVICE_ACCOUNT_JSON = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON') ?? '';

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const notificationId: string | undefined = body?.notification_id;
    if (!notificationId) {
      return Response.json({ ok: false, error: 'missing notification_id' }, { status: 400 });
    }

    const { data: notif, error: notifErr } = await supabase
      .from('notifications')
      .select('id, user_id, type, title, message, link')
      .eq('id', notificationId)
      .maybeSingle<NotificationRow>();

    if (notifErr) throw notifErr;
    if (!notif) {
      return Response.json({ ok: true, skipped: 'notification_not_found', durationMs: Date.now() - startedAt });
    }

    const { data: tokens, error: tokensErr } = await supabase
      .from('push_tokens')
      .select('id, user_id, token, platform')
      .eq('user_id', notif.user_id);

    if (tokensErr) throw tokensErr;

    const tokenRows = (tokens ?? []) as PushTokenRow[];
    if (tokenRows.length === 0) {
      return Response.json({
        ok: true,
        notification_id: notif.id,
        recipients: 0,
        durationMs: Date.now() - startedAt,
      });
    }

    let fcmAuth: { accessToken: string; projectId: string } | null = null;
    if (FCM_SERVICE_ACCOUNT_JSON) {
      try {
        fcmAuth = await getFcmAccessToken(FCM_SERVICE_ACCOUNT_JSON);
      } catch (err) {
        console.error('[send-push-on-notification] FCM auth failed:', (err as Error).message);
      }
    }

    const title = notif.title || 'iTutor';
    const messageBody = notif.message || '';
    const data: Record<string, string> = {
      notification_id: notif.id,
      type: notif.type,
      tag: notif.id,
      ...(notif.link ? { url: notif.link, deep_link: notif.link } : {}),
    };

    const expiredTokenIds: string[] = [];
    const attemptedTokenIds: string[] = [];

    await Promise.allSettled(
      tokenRows.map(async (tokenRow) => {
        attemptedTokenIds.push(tokenRow.id);
        try {
          if (isWebPushSubscriptionToken(tokenRow.token)) {
            const subscription = JSON.parse(tokenRow.token);
            await sendWebPush({
              subscription,
              title,
              body: messageBody,
              data,
              vapidPublicKey: VAPID_PUBLIC_KEY,
              vapidPrivateKey: VAPID_PRIVATE_KEY,
              vapidSubject: VAPID_SUBJECT,
            });
          } else {
            if (!fcmAuth) return;
            await sendFcmMessage({
              accessToken: fcmAuth.accessToken,
              projectId: fcmAuth.projectId,
              token: tokenRow.token,
              title,
              body: messageBody,
              data,
            });
          }
        } catch (err) {
          if (isExpiredSubscriptionError(err)) {
            expiredTokenIds.push(tokenRow.id);
          } else {
            console.error('[send-push-on-notification] send failed for token', tokenRow.id, (err as Error).message);
          }
        }
      })
    );

    if (expiredTokenIds.length > 0) {
      await supabase.from('push_tokens').delete().in('id', expiredTokenIds);
    }

    if (attemptedTokenIds.length > 0) {
      const nowIso = new Date().toISOString();
      await supabase.from('push_tokens').update({ last_used_at: nowIso }).in('id', attemptedTokenIds);
    }

    return Response.json({
      ok: true,
      notification_id: notif.id,
      recipients: tokenRows.length,
      removed_expired: expiredTokenIds.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
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
