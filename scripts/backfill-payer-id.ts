/**
 * One-off backfill for bookings missing payer_id.
 * Runs against whatever Supabase env .env.local points at (currently staging).
 *
 *   npx ts-node scripts/backfill-payer-id.ts          # dry-run
 *   npx ts-node scripts/backfill-payer-id.ts --apply  # actually update
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

function loadEnv(): void {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error('Missing Supabase env vars');

  const apply = process.argv.includes('--apply');
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows, error } = await admin
    .from('bookings')
    .select('id, student_id, payment_status')
    .is('payer_id', null)
    .not('student_id', 'is', null);

  if (error) throw error;

  console.log(`Found ${rows?.length ?? 0} bookings with NULL payer_id.`);
  if (!rows || rows.length === 0) return;

  const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
    const k = r.payment_status ?? 'null';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.log('  by payment_status:', byStatus);

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to update.');
    return;
  }

  let updated = 0;
  for (const row of rows) {
    const { error: upErr } = await admin
      .from('bookings')
      .update({ payer_id: row.student_id })
      .eq('id', row.id);
    if (upErr) {
      console.error(`Failed ${row.id}:`, upErr.message);
      continue;
    }
    updated++;
  }
  console.log(`Updated ${updated} bookings.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
