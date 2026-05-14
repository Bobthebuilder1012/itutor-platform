import { getServiceClient } from '@/lib/supabase/server';
import webpush from 'web-push';
import { createSign } from 'crypto';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? '';
const FCM_SERVICE_ACCOUNT_JSON = process.env.FCM_SERVICE_ACCOUNT_JSON ?? '';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

function isWebPushToken(token: string): boolean {
  try {
    const parsed = JSON.parse(token);
    return (
      parsed != null &&
      typeof parsed.endpoint === 'string' &&
      parsed.endpoint.length > 0 &&
      typeof parsed.keys?.p256dh === 'string' &&
      typeof parsed.keys?.auth === 'string'
    );
  } catch {
    return false;
  }
}

async function getFcmAccessToken(): Promise<{ accessToken: string; projectId: string } | null> {
  if (!FCM_SERVICE_ACCOUNT_JSON) return null;
  try {
    const sa = JSON.parse(FCM_SERVICE_ACCOUNT_JSON) as {
      project_id: string;
      client_email: string;
      private_key: string;
      token_uri?: string;
    };
    const tokenUri = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
    const now = Math.floor(Date.now() / 1000);

    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: sa.client_email,
        scope: FCM_SCOPE,
        aud: tokenUri,
        iat: now,
        exp: now + 3600,
      })
    ).toString('base64url');

    const signingInput = `${header}.${payload}`;
    const sign = createSign('RSA-SHA256');
    sign.update(signingInput);
    const signature = sign.sign(sa.private_key, 'base64url');

    const res = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${signingInput}.${signature}`,
      }).toString(),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token
      ? { accessToken: data.access_token, projectId: sa.project_id }
      : null;
  } catch {
    return null;
  }
}

/**
 * Send a push notification to all registered devices for the given user IDs.
 * Supports both Web Push (VAPID) and FCM tokens. Fails silently per token.
 *
 * Requires server-only env vars: VAPID_PRIVATE_KEY, VAPID_SUBJECT, FCM_SERVICE_ACCOUNT_JSON
 * (same values as the Supabase function secrets — add to .env.local)
 */
export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  if (userIds.length === 0) return;

  const supabase = getServiceClient();
  const { data: rows, error } = await supabase
    .from('push_tokens')
    .select('id, user_id, token, platform')
    .in('user_id', userIds);

  if (error || !rows || rows.length === 0) return;

  const tokens = rows as Array<{ id: string; user_id: string; token: string; platform: string }>;

  const hasWebPush = tokens.some(t => isWebPushToken(t.token));
  const hasFcm = tokens.some(t => !isWebPushToken(t.token));

  let webPushReady = false;
  if (hasWebPush && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    webPushReady = true;
  }

  let fcmAuth: { accessToken: string; projectId: string } | null = null;
  if (hasFcm) {
    fcmAuth = await getFcmAccessToken();
  }

  const attemptedIds: string[] = [];

  await Promise.allSettled(
    tokens.map(async (tokenRow) => {
      attemptedIds.push(tokenRow.id);
      try {
        if (isWebPushToken(tokenRow.token)) {
          if (!webPushReady) return;
          const subscription = JSON.parse(tokenRow.token) as webpush.PushSubscription;
          await webpush.sendNotification(
            subscription,
            JSON.stringify({
              title,
              body,
              data: data ?? {},
              tag: data?.booking_id ?? data?.session_id ?? crypto.randomUUID(),
            })
          );
        } else {
          if (!fcmAuth) return;
          await fetch(
            `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(fcmAuth.projectId)}/messages:send`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${fcmAuth.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message: {
                  token: tokenRow.token,
                  notification: { title, body },
                  data: data ?? {},
                },
              }),
            }
          );
        }
      } catch {
        // Fail silently per token
      }
    })
  );

  if (attemptedIds.length > 0) {
    await supabase
      .from('push_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .in('id', attemptedIds);
  }
}
