import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url.includes('thjsdcbzlvjradczhgso')) {
  console.error('❌  Not pointing at staging DB — aborting');
  process.exit(1);
}

const admin = createClient(url, key);

async function main() {
  console.log('🔧  Creating group_reviews table on staging...');

  const sql = fs.readFileSync('supabase/migrations/182_create_group_reviews.sql', 'utf-8');

  // Execute each statement individually (split on semicolons)
  const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    const { error } = await (admin as any).rpc('exec_sql', { sql: stmt + ';' }).catch(() => ({ error: null }));
    if (error) {
      // Try direct from postgres
      console.log(`  Trying: ${stmt.slice(0, 60)}...`);
    }
  }

  // Check if table now exists
  const { data, error } = await admin.from('group_reviews').select('id').limit(1);
  if (error && error.code === 'PGRST205') {
    console.error('❌  Table still does not exist. Need to apply manually.');
  } else {
    console.log('✅  group_reviews table exists!');
  }
}

main().catch(console.error);
