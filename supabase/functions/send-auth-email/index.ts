// =====================================================
// SEND AUTH EMAIL (Supabase "Send Email" Auth Hook -> Customer.io)
// =====================================================
// Supabase Auth calls this function instead of its SMTP sender whenever it
// needs to send an auth email (signup code, password reset, magic link,
// email change, invite, reauthentication). We render the same iTutor HTML
// templates used in the dashboard and send them through the Customer.io
// Transactional API.
//
// Required secrets (Edge Functions -> Secrets):
//   SEND_EMAIL_HOOK_SECRET   "v1,whsec_..." generated on the Auth Hooks page
//   CUSTOMERIO_APP_API_KEY   Customer.io App API key (Settings -> API credentials)
// Optional:
//   CUSTOMERIO_REGION        "us" (default) or "eu"
//   AUTH_EMAIL_FROM          default "iTutor <noreply@myitutor.com>" (must be a
//                            verified sender domain in Customer.io)
//
// Deploy with verify_jwt = false: requests are authenticated by the
// Standard Webhooks signature below, not a Supabase JWT.

import { Webhook } from 'npm:standardwebhooks@1.0.0';
import { TEMPLATES } from './templates.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const HOOK_SECRET = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? '').replace('v1,whsec_', '');
const CIO_KEY = Deno.env.get('CUSTOMERIO_APP_API_KEY') ?? '';
const CIO_HOST =
  (Deno.env.get('CUSTOMERIO_REGION') ?? 'us').toLowerCase() === 'eu'
    ? 'https://api-eu.customer.io'
    : 'https://api.customer.io';
const FROM = Deno.env.get('AUTH_EMAIL_FROM') ?? 'iTutor <noreply@myitutor.com>';

interface HookPayload {
  user: { id: string; email: string; new_email?: string };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new: string;
    token_hash_new: string;
  };
}

interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  messageId: string; // Customer.io transactional message (auto-created)
}

function confirmationUrl(tokenHash: string, type: string, redirectTo: string): string {
  const params = new URLSearchParams({ token: tokenHash, type });
  if (redirectTo) params.set('redirect_to', redirectTo);
  return `${SUPABASE_URL}/auth/v1/verify?${params.toString()}`;
}

function render(template: string, vars: { url?: string; token?: string }): string {
  return template
    .replaceAll('{{ .ConfirmationURL }}', vars.url ?? '')
    .replaceAll('{{ .Token }}', vars.token ?? '');
}

function simpleHtml(heading: string, text: string, code?: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
<h2 style="margin:0 0 16px;color:#199356;">${heading}</h2>
<p style="color:#333;font-size:16px;line-height:1.5;">${text}</p>
${code ? `<p style="font-size:32px;font-weight:bold;letter-spacing:6px;font-family:'Courier New',monospace;color:#111;">${code}</p>` : ''}
<p style="color:#888;font-size:13px;margin-top:32px;">If you didn't request this, you can ignore this email or contact support@myitutor.com.</p>
</div></body></html>`;
}

const NOTIFICATIONS: Record<string, [string, string]> = {
  password_changed_notification: ['Your iTutor password was changed', 'The password for your iTutor account was just changed.'],
  email_changed_notification: ['Your iTutor email was changed', 'The email address on your iTutor account was just changed.'],
  phone_changed_notification: ['Your iTutor phone number was changed', 'The phone number on your iTutor account was just changed.'],
  identity_linked_notification: ['A sign-in method was linked', 'A new sign-in method was linked to your iTutor account.'],
  identity_unlinked_notification: ['A sign-in method was removed', 'A sign-in method was removed from your iTutor account.'],
  mfa_factor_enrolled_notification: ['Two-factor method added', 'A new two-factor authentication method was added to your iTutor account.'],
  mfa_factor_unenrolled_notification: ['Two-factor method removed', 'A two-factor authentication method was removed from your iTutor account.'],
};

function buildEmails({ user, email_data: d }: HookPayload): OutgoingEmail[] {
  const type = d.email_action_type;
  const mk = (to: string, subject: string, html: string): OutgoingEmail => ({
    to,
    subject,
    html,
    messageId: `supabase_auth_${type}`,
  });

  switch (type) {
    case 'signup':
      return [mk(user.email, 'Confirm Your Email - iTutor', render(TEMPLATES.confirm, {
        token: d.token,
        url: confirmationUrl(d.token_hash, 'signup', d.redirect_to),
      }))];
    case 'recovery':
      return [mk(user.email, 'Reset Your Password - iTutor', render(TEMPLATES.recovery, {
        token: d.token,
        url: confirmationUrl(d.token_hash, 'recovery', d.redirect_to),
      }))];
    case 'magiclink':
    case 'email':
      return [mk(user.email, 'Sign In to iTutor', render(TEMPLATES.magiclink, {
        token: d.token,
        url: confirmationUrl(d.token_hash, 'magiclink', d.redirect_to),
      }))];
    case 'invite':
      return [mk(user.email, "You've Been Invited to iTutor", render(TEMPLATES.invite, {
        token: d.token,
        url: confirmationUrl(d.token_hash, 'invite', d.redirect_to),
      }))];
    case 'email_change': {
      // Field names are reversed for backward compatibility (see Supabase docs):
      //   current email -> token + token_hash_new
      //   new email     -> token_new + token_hash
      const out: OutgoingEmail[] = [];
      const newEmail = user.new_email ?? '';
      if (d.token_hash_new) {
        out.push(mk(user.email, 'Confirm Email Change - iTutor', render(TEMPLATES.email_change, {
          token: d.token,
          url: confirmationUrl(d.token_hash_new, 'email_change', d.redirect_to),
        })));
        if (newEmail && d.token_hash) {
          out.push(mk(newEmail, 'Confirm Email Change - iTutor', render(TEMPLATES.email_change, {
            token: d.token_new,
            url: confirmationUrl(d.token_hash, 'email_change', d.redirect_to),
          })));
        }
      } else if (newEmail && d.token_hash) {
        out.push(mk(newEmail, 'Confirm Email Change - iTutor', render(TEMPLATES.email_change, {
          token: d.token || d.token_new,
          url: confirmationUrl(d.token_hash, 'email_change', d.redirect_to),
        })));
      }
      return out;
    }
    case 'reauthentication':
      return [mk(user.email, 'Confirm it\'s you - iTutor',
        simpleHtml('Confirm it\'s you', 'Enter this code in iTutor to continue:', d.token))];
    default: {
      const n = NOTIFICATIONS[type];
      if (n) return [mk(user.email, `${n[0]}`, simpleHtml(n[0], n[1]))];
      throw new Error(`Unsupported email_action_type: ${type}`);
    }
  }
}

async function sendViaCustomerIo(email: OutgoingEmail, userId: string): Promise<void> {
  const res = await fetch(`${CIO_HOST}/v1/send/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CIO_KEY}`,
    },
    body: JSON.stringify({
      transactional_message_id: email.messageId,
      auto_create: true,
      to: email.to,
      from: FROM,
      subject: email.subject,
      // Wrapped in raw so Customer.io's Liquid engine leaves the HTML untouched.
      body: `{% raw %}${email.html}{% endraw %}`,
      identifiers: { id: userId },
      disable_message_retention: false,
      send_to_unsubscribed: true, // auth emails must always be delivered
      tracked: false, // don't rewrite verification links
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Customer.io ${res.status}: ${text.slice(0, 500)}`);
  }
}

function hookError(status: number, message: string): Response {
  console.error('[send-auth-email]', message);
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return hookError(405, 'Method not allowed');
  if (!HOOK_SECRET) return hookError(500, 'SEND_EMAIL_HOOK_SECRET is not set');
  if (!CIO_KEY) return hookError(500, 'CUSTOMERIO_APP_API_KEY is not set');

  const raw = await req.text();
  let payload: HookPayload;
  try {
    payload = new Webhook(HOOK_SECRET).verify(raw, Object.fromEntries(req.headers)) as HookPayload;
  } catch (_e) {
    return hookError(401, 'Invalid webhook signature');
  }

  try {
    const emails = buildEmails(payload);
    for (const email of emails) {
      await sendViaCustomerIo(email, payload.user.id);
    }
    console.log('[send-auth-email] sent', payload.email_data.email_action_type, 'x', emails.length);
  } catch (e) {
    return hookError(500, e instanceof Error ? e.message : String(e));
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
