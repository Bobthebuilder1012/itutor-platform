/**
 * Run subject communities migrations 091, 092, 093.
 * Requires DATABASE_URL in .env.local.
 * Run: npx ts-node scripts/run-migrations-089-091.ts
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

const MIGRATIONS = [
  '091_subject_community_pinned_sessions.sql',
  '092_communities_booking_session_columns.sql',
  '093_booking_request_community_id.sql',
];

async function main() {
  const env = loadEnv();
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set in .env.local');
    console.error('Add DATABASE_URL (pooler URI) to .env.local, or run the SQL files manually in Supabase SQL Editor.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  const migrationsDir = path.resolve(process.cwd(), 'src/supabase/migrations');

  try {
    await client.connect();
    for (const file of MIGRATIONS) {
      const sqlPath = path.join(migrationsDir, file);
      if (!fs.existsSync(sqlPath)) {
        console.error('❌ Migration file not found:', sqlPath);
        process.exit(1);
      }
      const sql = fs.readFileSync(sqlPath, 'utf-8');
      await client.query(sql);
      console.log('✅', file);
    }
    console.log('✅ All migrations 091–093 applied successfully.');
  } catch (e) {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
