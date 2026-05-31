/**
 * Smoke test: create a LuniPay sandbox checkout session.
 *
 * Verifies that LUNIPAY_SECRET_KEY (test mode) is valid and the SDK
 * can hit the LuniPay sandbox. Prints the hosted checkout URL on success.
 *
 * Run with:  npx ts-node scripts/test-lunipay-sandbox.ts
 */

import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

import LuniPay, { LuniPayError } from 'lunipay';

async function main() {
  const apiKey = process.env.LUNIPAY_SECRET_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!apiKey) throw new Error('LUNIPAY_SECRET_KEY is not set in .env.local');
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL is not set in .env.local');
  if (!apiKey.startsWith('sk_test_')) {
    throw new Error(`Refusing to run smoke test with a non-test key: ${apiKey.slice(0, 8)}…`);
  }

  console.log('LUNIPAY_SECRET_KEY :', apiKey.slice(0, 12) + '…');
  console.log('NEXT_PUBLIC_APP_URL:', appUrl);

  const lunipay = new LuniPay({ apiKey });

  console.log('\n--- attempt 1: minimal payload, USD ---');
  try {
    const s = await lunipay.checkout.sessions.create({
      amount: 5000,
      currency: 'usd',
      success_url: `${appUrl}/payments/success?smoke=usd&session_id={CHECKOUT_SESSION_ID}`,
    });
    console.log('  OK ->', s.id, s.url);
  } catch (e) {
    if (e instanceof LuniPayError) {
      console.log('  FAIL ->', e.code, '|', e.param ?? '(no param)', '|', e.message);
    } else throw e;
  }

  console.log('\n--- attempt 2: minimal payload, TTD ---');
  try {
    const s = await lunipay.checkout.sessions.create({
      amount: 5000,
      currency: 'ttd',
      success_url: `${appUrl}/payments/success?smoke=ttd&session_id={CHECKOUT_SESSION_ID}`,
    });
    console.log('  OK ->', s.id, s.url);
  } catch (e) {
    if (e instanceof LuniPayError) {
      console.log('  FAIL ->', e.code, '|', e.param ?? '(no param)', '|', e.message);
    } else throw e;
  }

  console.log('\n--- attempt 3: full payload, line_items with `amount` (not amount_cents) ---');
  const session = await lunipay.checkout.sessions.create(
    {
      amount: 5000,
      currency: 'ttd',
      success_url: `${appUrl}/payments/success?smoke=full&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/payments/checkout?smoke=full&cancelled=1`,
      customer_email: 'smoketest@example.com',
      line_items: [
        {
          name: 'Sandbox smoke test (50 TTD)',
          quantity: 1,
          amount: 5000,
        } as any,
      ],
      metadata: {
        booking_id: 'smoke-test',
        payment_id: 'smoke-test',
      },
    },
    { idempotencyKey: `smoke-${Date.now()}` }
  );

  console.log('\n=== Sandbox session created ===');
  console.log('id          :', session.id);
  console.log('payment_intent_id:', (session as any).payment_intent_id);
  console.log('status      :', session.status);
  console.log('payment_status:', session.payment_status);
  console.log('expires_at  :', new Date(session.expires_at * 1000).toISOString());
  console.log('url         :', session.url);
  console.log('\nOpen the URL above in a browser to hit the LuniPay sandbox checkout.');
}

main().catch((err) => {
  if (err instanceof LuniPayError) {
    console.error('LuniPay API error:', {
      code: err.code,
      status: err.status,
      param: (err as any).param,
      message: err.message,
    });
  } else {
    console.error(err);
  }
  process.exit(1);
});
