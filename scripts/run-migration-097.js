/**
 * Apply email template seeds (migration 097) via Supabase service role.
 * Uses NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local
 * (no DATABASE_URL required).
 *
 * Run: node scripts/run-migration-097.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const seeds = require('./email-seeds-097.js');

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env.local not found');
    process.exit(1);
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^=#]+)=(.*)$/);
    if (m) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      env[m[1].trim()] = v;
    }
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in .env.local');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let inserted = 0;
  let skipped = 0;

  for (const row of seeds) {
    const { data: existingRows, error: selErr } = await supabase
      .from('email_templates')
      .select('id')
      .eq('user_type', row.user_type)
      .eq('stage', row.stage)
      .limit(1);

    if (selErr) {
      console.error('❌ Lookup failed:', selErr.message, row.user_type, row.stage);
      process.exit(1);
    }

    if (existingRows && existingRows.length > 0) {
      console.log('⏭ skip (exists)', row.user_type, 'stage', row.stage);
      skipped += 1;
      continue;
    }

    const { error: insErr } = await supabase.from('email_templates').insert({
      name: row.name,
      subject: row.subject,
      html_content: row.html_content,
      user_type: row.user_type,
      stage: row.stage,
    });

    if (insErr) {
      console.error('❌ Insert failed:', insErr.message, row.user_type, row.stage);
      process.exit(1);
    }

    console.log('✓ inserted', row.user_type, 'stage', row.stage);
    inserted += 1;
  }

  console.log(`\n✅ Done. Inserted ${inserted}, skipped ${skipped}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
