/**
 * Drill into the sessions for recently-paid bookings to figure
 * out why no ledger rows / balances exist.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

function readEnv(file: string, key: string): string | null {
  try {
    const raw = readFileSync(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (t.startsWith(`${key}=`)) return t.slice(key.length + 1).trim();
    }
  } catch {}
  return null;
}

const envFile = resolve(process.cwd(), '.env.local');
const SUPABASE_URL = readEnv(envFile, 'NEXT_PUBLIC_SUPABASE_URL')!;
const KEY = readEnv(envFile, 'SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  // Pull every paid booking
  const { data: paidBookings } = await sb
    .from('bookings')
    .select('id, created_at, tutor_id, payer_id, price_ttd, tutor_payout_ttd, payment_status')
    .eq('payment_status', 'paid')
    .order('created_at', { ascending: false });

  console.log(`Found ${paidBookings?.length ?? 0} paid bookings.\n`);

  for (const b of paidBookings ?? []) {
    console.log(`Booking ${b.id} — paid TTD${b.price_ttd} (tutor share ${b.tutor_payout_ttd}) on ${b.created_at}`);

    const { data: sess, error: sessErr } = await sb
      .from('sessions')
      .select('*')
      .eq('booking_id', b.id);
    if (sessErr) {
      console.log(`  ERR: ${sessErr.message}`);
      continue;
    }
    if (!sess || sess.length === 0) {
      console.log(`  ❌ NO session row exists for this booking!`);
      continue;
    }
    for (const s of sess) {
      console.log(
        `  ✓ session ${s.id?.slice(0, 8)}… status=${s.status} payment_status=${s.payment_status} ` +
          `charged_at=${s.charged_at ?? 'NULL'} ` +
          `payout=${s.payout_amount_ttd} charge=${s.charge_amount_ttd} ` +
          `start=${s.scheduled_start_at}`
      );
    }
  }

  // Get the column list of sessions to confirm field names
  const { data: oneSession } = await sb.from('sessions').select('*').limit(1);
  if (oneSession?.[0]) {
    console.log('\nsessions columns:', Object.keys(oneSession[0]).join(', '));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
