/**
 * One-shot diagnostic for the push fan-out pipeline.
 * Walks every link: trigger present, edge function reachable, recipient has
 * push tokens, latest notification was actually fanned out.
 *
 * Usage: npx ts-node scripts/diagnose-push-fanout.ts
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
  console.log(`\n=== Push fan-out diagnostic on ${SUPABASE_URL} ===\n`);

  // 1) Latest notification + recipient
  const { data: notif } = await sb
    .from('notifications')
    .select('id, user_id, type, title, message, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!notif) {
    console.log('No notifications in DB — nothing to diagnose.');
    return;
  }

  console.log('Latest notification:');
  console.log(`  id:        ${notif.id}`);
  console.log(`  user_id:   ${notif.user_id}`);
  console.log(`  type:      ${notif.type}`);
  console.log(`  title:     ${notif.title}`);
  console.log(`  created:   ${notif.created_at}\n`);

  // 2) Recipient profile + their push tokens
  const { data: profile } = await sb
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('id', notif.user_id)
    .maybeSingle();
  console.log(`Recipient: ${profile?.full_name} <${profile?.email}> (${profile?.role})`);

  const { data: tokens } = await sb
    .from('push_tokens')
    .select('id, platform, last_used_at, created_at')
    .eq('user_id', notif.user_id);
  console.log(`Push tokens for recipient: ${tokens?.length ?? 0}`);
  for (const t of tokens ?? []) {
    console.log(`  • [${t.platform}] id=${t.id.slice(0, 8)}  created=${t.created_at}  last_used=${t.last_used_at ?? 'never'}`);
  }

  // 3) Trigger present? (best-effort, requires an exec_sql RPC)
  try {
    const r: any = await sb.rpc('exec_sql' as any, {
      sql: `SELECT tgname FROM pg_trigger WHERE tgname = 'trigger_dispatch_push_for_notification' AND NOT tgisinternal`,
    });
    if (r?.error) throw r.error;
    console.log(`\nTrigger present: ${JSON.stringify(r?.data ?? [])}`);
  } catch (e: any) {
    console.log(`\n(could not read pg_trigger via RPC — ${e?.message ?? 'no exec_sql RPC available'})`);
  }

  // 4) Last few pg_net responses (success = call left the DB at all)
  const { data: netRows, error: netErr } = await sb
    .from('http_response_collection' as any)
    .select('id, status_code, created, content_type')
    .order('created', { ascending: false })
    .limit(5);
  if (netErr) {
    console.log(`\npg_net responses: <inaccessible — ${netErr.message}>`);
  } else {
    console.log(`\nLast 5 pg_net responses (need extensions.http_response_collection access):`);
    console.table(netRows ?? []);
  }

  // 5) Try invoking the edge function ourselves with the latest notification
  console.log('\nInvoking edge function send-push-on-notification manually…');
  const fnUrl = `${SUPABASE_URL}/functions/v1/send-push-on-notification`;
  const r = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${readEnv(envFile, 'NEXT_PUBLIC_SUPABASE_ANON_KEY')}`,
    },
    body: JSON.stringify({ notification_id: notif.id }),
  });
  const txt = await r.text();
  console.log(`  HTTP ${r.status}: ${txt}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
