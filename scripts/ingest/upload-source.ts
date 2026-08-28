/**
 * Uploads a curriculum source document and marks it STORED.
 *
 * Run: npx ts-node scripts/ingest/upload-source.ts <file> [--source-id=<uuid>]
 *      npx ts-node scripts/ingest/upload-source.ts --list
 *
 * 249 registers the documents we need as `curriculum_sources` rows with no
 * file: a shopping list, so the gap shows up in a query rather than living in
 * somebody's memory. This script is the other half — it takes a file somebody
 * downloaded from CXC and attaches it to the row that was waiting for it.
 *
 * ── Rule 4 ──────────────────────────────────────────────────────────────────
 * The document must come from CXC: the free syllabus on cxc.org, or a CXC Store
 * purchase. Never from an unlicensed past-paper site. This script cannot verify
 * where a local file came from, which is exactly why the licence is recorded on
 * the row by a human and why `--license` must be stated explicitly for anything
 * that is not already registered.
 *
 * Dedupe is on the SHA-256 unique index from 248. Re-running with the same file
 * is a no-op rather than a second copy.
 */
import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { basename, extname, resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'curriculum-source';

// Tiny .env.local parser, matching scripts/apply-finder-migrations.ts — no
// dotenv dependency for a script that runs a handful of times.
function loadDotEnv(path: string): void {
  try {
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, '');
    }
  } catch {
    // No .env.local is fine when the vars come from the shell.
  }
}

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (put them in .env.local).'
    );
  }
  // Service role: the bucket is private and reviewer-only, and this runs on a
  // developer's machine, not in the app.
  return createClient(url, key, { auth: { persistSession: false } });
}

function contentTypeFor(file: string): string {
  const ext = extname(file).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

/** Prints the shopping list: what 249 registered and what is still missing. */
async function listSources(): Promise<void> {
  const { data, error } = await getClient()
    .from('curriculum_sources')
    .select('id, title, source_type, license, ingest_status, storage_path')
    .order('source_type');

  if (error) throw new Error(`Could not read curriculum_sources: ${error.message}`);
  if (!data?.length) {
    console.log('No curriculum_sources rows. Apply migrations 248 and 249 first.');
    return;
  }

  console.log(`\n${data.length} registered source(s):\n`);
  for (const row of data) {
    const state = row.storage_path ? row.ingest_status : 'AWAITING FILE';
    console.log(`  [${state.padEnd(13)}] ${row.source_type.padEnd(15)} ${row.title}`);
    console.log(`    id: ${row.id}   licence: ${row.license}`);
  }
  console.log('');
}

async function uploadSource(filePath: string, sourceId?: string): Promise<void> {
  const absolute = resolve(filePath);
  if (!existsSync(absolute)) {
    throw new Error(`File not found: ${absolute}`);
  }

  const supabase = getClient();
  const bytes = readFileSync(absolute);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  // Dedupe before uploading, not after. The unique index would catch it either
  // way, but not before the bytes had crossed the wire.
  const { data: existing } = await supabase
    .from('curriculum_sources')
    .select('id, title, storage_path')
    .eq('file_sha256', sha256)
    .maybeSingle();

  if (existing) {
    console.log(`Already stored as "${existing.title}" (${existing.id}). Nothing to do.`);
    return;
  }

  // Which row is this file for?
  let targetId = sourceId;
  if (!targetId) {
    const { data: candidates, error } = await supabase
      .from('curriculum_sources')
      .select('id, title, source_type')
      .is('storage_path', null)
      .order('source_type');

    if (error) throw new Error(`Could not read curriculum_sources: ${error.message}`);

    if (!candidates?.length) {
      throw new Error(
        'No curriculum_sources row is awaiting a file. Register one first, or pass --source-id.'
      );
    }

    // Deliberately refuses to guess. Attaching a mark scheme to the row for a
    // subject report would poison every extraction downstream, and the error is
    // silent — the file is there, it is just the wrong file.
    console.log('\nRows awaiting a file:\n');
    for (const row of candidates) {
      console.log(`  --source-id=${row.id}   ${row.source_type.padEnd(15)} ${row.title}`);
    }
    throw new Error('\nPass --source-id=<uuid> to say which of these the file is.');
  }

  const storagePath = `${targetId}/${basename(absolute)}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: contentTypeFor(absolute), upsert: true });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const { error: updateError } = await supabase
    .from('curriculum_sources')
    .update({
      storage_path: storagePath,
      file_sha256: sha256,
      ingest_status: 'STORED',
      ingest_error: null,
    })
    .eq('id', targetId);

  if (updateError) {
    // The file is in the bucket but the row does not know about it. Say so
    // plainly — a silent partial success here means the next run uploads a
    // duplicate and the extraction step never finds the document.
    throw new Error(
      `Uploaded to ${storagePath} but could not update the row: ${updateError.message}`
    );
  }

  const kb = Math.round(bytes.length / 1024);
  console.log(`Stored ${basename(absolute)} (${kb} KB) at ${storagePath}`);
  console.log(`  sha256: ${sha256}`);
  console.log(`  source: ${targetId} -> STORED`);
}

async function main(): Promise<void> {
  loadDotEnv(resolve(process.cwd(), '.env.local'));

  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    await listSources();
    return;
  }

  const filePath = args.find((a) => !a.startsWith('--'));
  if (!filePath) {
    console.log(
      'Usage:\n' +
        '  npx ts-node scripts/ingest/upload-source.ts <file> [--source-id=<uuid>]\n' +
        '  npx ts-node scripts/ingest/upload-source.ts --list\n'
    );
    process.exitCode = 1;
    return;
  }

  const sourceId = args.find((a) => a.startsWith('--source-id='))?.split('=')[1];
  await uploadSource(filePath, sourceId);
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
