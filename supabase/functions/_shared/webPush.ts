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

  // Send notification
  await webpush.default.sendNotification(subscription, payload);
}
