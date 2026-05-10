// =====================================================
// WEB PUSH NOTIFICATIONS (for desktop browsers)
// =====================================================
// Sends push notifications to web browsers using Web Push Protocol

interface WebPushParams {
  subscription: PushSubscription;
  title: string;
  body: string;
  data?: Record<string, any>;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
}

/**
 * Send a web push notification to a browser
 */
export async function sendWebPush(params: WebPushParams): Promise<void> {
  const { subscription, title, body, data, vapidPublicKey, vapidPrivateKey, vapidSubject } = params;

  // Use web-push library (already available in Deno)
  const webpush = await import('npm:web-push@3.6.7');

  // Set VAPID details
  webpush.default.setVapidDetails(
    vapidSubject,
    vapidPublicKey,
    vapidPrivateKey
  );

  // Prepare payload
  const payload = JSON.stringify({
    title,
    body,
    data: data || {},
    tag: data?.session_id || 'notification',
  });

  try {
    await webpush.default.sendNotification(subscription, payload);
  } catch (err: any) {
    const statusCode = err?.statusCode;
    const body = err?.body;
    const headers = err?.headers ? JSON.stringify(err.headers) : undefined;
    const endpoint = subscription?.endpoint;
    const enriched = new Error(
      `WebPush failed status=${statusCode ?? 'unknown'} body=${body ?? 'n/a'} endpoint=${endpoint ?? 'n/a'} headers=${headers ?? 'n/a'} original=${err?.message ?? String(err)}`
    );
    (enriched as any).statusCode = statusCode;
    throw enriched;
  }
}
