/**
 * Run Group Streams migration (092).
 * Requires DATABASE_URL in .env.local (Supabase Dashboard → Settings → Database → Connection string → URI).
 * Run: npm run stream:migrate
 */

import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

function loadEnv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env.local not found');
    process.exit(1);
  }
  const env: Record<string, string> = {};
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  });
  return env;
}

async function main() {
  const env = loadEnv();
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set in .env.local');
    console.error('');
    console.error('To run the migration from the CLI:');
    console.error('1. Open Supabase Dashboard → your project → Settings → Database');
    console.error('2. Under "Connection string" use the URI (e.g. Session pooler, port 5432 or 6543).');
    console.error('3. Add to .env.local: DATABASE_URL="postgresql://postgres.[ref]:[password]@...[pooler].supabase.com:5432/postgres"');
    console.error('4. Run: npm run stream:migrate');
    console.error('');
    console.error('Alternatively, run the SQL file manually in Supabase SQL Editor:');
    console.error('  src/supabase/migrations/092_group_stream.sql');
    process.exit(1);
  }

  const sqlPath = path.resolve(process.cwd(), 'src/supabase/migrations/092_group_stream.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('❌ Migration file not found:', sqlPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, 'utf-8');
  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    await client.query(sql);
    console.log('✅ Group Streams migration (092) applied successfully.');
    console.log('   Tables: stream_posts, stream_replies, stream_attachments');
  } catch (e) {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
