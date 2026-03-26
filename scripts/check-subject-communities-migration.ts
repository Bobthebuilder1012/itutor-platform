/**
 * Check if subject communities migration (088) has been applied.
 * Run: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/check-subject-communities-migration.ts
 * Or: node --loader ts-node/esm scripts/check-subject-communities-migration.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

function loadEnv() {
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
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('❌ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey);

  try {
    const { data, error } = await supabase.from('subject_communities').select('id').limit(1);
    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        console.log('⚠️  Subject communities tables not found. Run migration 088.');
        console.log('   See docs/COMMUNITIES_SUBJECT_NEXT_STEPS.md');
        console.log('   File: src/supabase/migrations/088_subject_communities_spec.sql');
        process.exit(1);
      }
      throw error;
    }
    console.log('✅ Migration 088 applied – subject_communities table exists.');
  } catch (e) {
    console.error('Error checking migration:', e);
    process.exit(1);
  }
}

main();
