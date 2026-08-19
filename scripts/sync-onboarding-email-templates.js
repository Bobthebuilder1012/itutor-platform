/**
 * Push the code versions of the onboarding emails into `email_templates`.
 *
 *   node scripts/sync-onboarding-email-templates.js --dry-run   (show the diff)
 *   node scripts/sync-onboarding-email-templates.js             (write)
 *
 * WHY THIS EXISTS. The onboarding cron and the welcome-email route read
 * `email_templates` from the database, and admins edit those rows in
 * /admin/emails. So restyling lib/email-templates changes what is PREVIEWED
 * immediately and what is SENT only where no row exists. This is how the
 * designed versions get over the stored ones.
 *
 * IT OVERWRITES ADMIN EDITS. That is the point, and it is why it is a separate
 * command that nothing runs automatically and why --dry-run exists. Run the dry
 * run first and read what it is about to replace.
 *
 * Ten rows: student and tutor, stages 0 to 4. Parents read the student
 * sequence — getEmailForStage maps them to it — so there are no parent rows to
 * write.
 *
 * Names are stored with `{{firstName}}` intact: every caller runs
 * personalizeEmail over the row, exactly as it does over an admin's.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, read from
 * .env.local. CHECK WHICH ENVIRONMENT THAT POINTS AT before writing — staging is
 * a branch of production and the two are one keystroke apart.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');

const ROOT = path.resolve(__dirname, '..');

// ── env ──────────────────────────────────────────────────────────────────────
// Hand-parsed rather than pulling in dotenv, which is not a dependency here.
function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}

// ── the templates, transpiled from TypeScript ────────────────────────────────
// Same approach as scripts/render-email-templates.js: neither ts-node nor tsx is
// a dependency, so this uses the compiler that is installed and needs no
// network. Modules are flattened into one temp directory, and the `@/` aliases
// the template files use are rewritten to match.
const MODULES = [
  ['escape.js', 'lib/email/design/escape.ts'],
  ['theme.js', 'lib/email/design/theme.ts'],
  ['blocks.js', 'lib/email/design/blocks.ts'],
  ['render.js', 'lib/email/design/render.ts'],
  ['types.js', 'lib/email-templates/types.ts'],
  ['student.js', 'lib/email-templates/student.ts'],
  ['tutor.js', 'lib/email-templates/tutor.ts'],
  ['index.js', 'lib/email-templates/index.ts'],
];

function loadTemplates() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'itutor-onboarding-'));

  for (const [outName, src] of MODULES) {
    const code = fs
      .readFileSync(path.join(ROOT, src), 'utf8')
      .replace(/from '@\/lib\/email\/design'/g, "from './render'")
      .replace(/from '@\/lib\/email\/design\/theme'/g, "from './theme'")
      .replace(/from '@\/lib\/email-templates'/g, "from './index'");
    const js = ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: src,
    }).outputText;
    fs.writeFileSync(path.join(tmp, outName), js);
  }

  const mod = require(path.join(tmp, 'index.js'));
  return {
    getEmailForStage: mod.getEmailForStage,
    getCtaUrl: mod.getCtaUrl,
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  console.log(`Target: ${url}`);
  console.log(dryRun ? 'Mode:   DRY RUN — nothing will be written\n' : 'Mode:   WRITE\n');

  const supabase = createClient(url, key);
  const { getEmailForStage, getCtaUrl, cleanup } = loadTemplates();

  let changed = 0;
  let same = 0;

  for (const userType of ['student', 'tutor']) {
    for (const stage of [0, 1, 2, 3, 4]) {
      const ctaUrl = getCtaUrl(userType, stage);
      const built = getEmailForStage(userType, stage, { firstName: '{{firstName}}', ctaUrl });

      const { data: existing } = await supabase
        .from('email_templates')
        .select('id, subject, html_content')
        .eq('user_type', userType)
        .eq('stage', stage)
        .maybeSingle();

      const label = `${userType} stage ${stage}`;

      if (existing && existing.html_content === built.html && existing.subject === built.subject) {
        console.log(`  unchanged  ${label}`);
        same++;
        continue;
      }

      changed++;
      if (!existing) {
        console.log(`  NEW        ${label}  "${built.subject}"`);
      } else {
        console.log(`  REPLACE    ${label}  "${existing.subject}" -> "${built.subject}"`);
        console.log(
          `             stored html ${existing.html_content?.length ?? 0} bytes -> ${built.html.length} bytes`
        );
      }
      if (dryRun) continue;

      const row = {
        name: `${userType} onboarding stage ${stage}`,
        user_type: userType,
        stage,
        subject: built.subject,
        html_content: built.html,
      };

      const { error } = existing
        ? await supabase.from('email_templates').update(row).eq('id', existing.id)
        : await supabase.from('email_templates').insert(row);

      if (error) {
        console.error(`             FAILED: ${error.message}`);
        process.exitCode = 1;
      }
    }
  }

  cleanup();
  console.log(
    `\n${same} already current, ${changed} ${dryRun ? 'would change' : 'written'}.` +
      (dryRun && changed > 0 ? '\nRe-run without --dry-run to apply.' : '')
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
