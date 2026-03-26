/**
 * Run subject communities migration (088).
 * Requires DATABASE_URL in .env.local (Supabase Dashboard → Settings → Database → Connection string → URI).
 * Run: npm run communities:migrate
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
    console.error('2. Under "Connection string" use the POOLER URI (Transaction or Session), not Direct.');
    console.error('   (Pooler host looks like: aws-0-<region>.pooler.supabase.com, port 6543 or 5432)');
    console.error('3. Add to .env.local: DATABASE_URL="postgresql://..."');
    console.error('4. Run: npm run communities:migrate');
    console.error('');
    console.error('Alternatively, run the SQL file manually in Supabase SQL Editor:');
    console.error('  src/supabase/migrations/088_subject_communities_spec.sql');
    process.exit(1);
  }

  const sqlPath = path.resolve(process.cwd(), 'src/supabase/migrations/088_subject_communities_spec.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error('❌ Migration file not found:', sqlPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, 'utf-8');
  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    await client.query(sql);
    console.log('✅ Migration 088 applied successfully.');
  } catch (e) {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
