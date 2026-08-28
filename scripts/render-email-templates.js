/**
 * Write the Supabase Auth email templates out to email-templates/*.html.
 *
 *   node scripts/render-email-templates.js
 *   node scripts/render-email-templates.js --check   (fail if any file is stale)
 *
 * WHY THESE ARE FILES AT ALL. Supabase sends its own auth mail, from HTML pasted
 * into the dashboard under Authentication → Emails. Nothing in this repo can
 * push it there. So the file is the artefact an operator copies, and generating
 * it from lib/email/design means the first email a new user ever sees is not the
 * one email still on the old design.
 *
 * WHY PLAIN JAVASCRIPT AND THE TYPESCRIPT TRANSPILER. The definitions are
 * TypeScript, and neither ts-node nor tsx is a dependency of this project — the
 * migration scripts reach for `npx ts-node`, which means a network fetch. This
 * transpiles the four modules it needs with the compiler that IS installed and
 * requires the result, so the script runs offline with no install step. It type
 * checks nowhere; `tsc --noEmit` already covers that.
 *
 * --check is for CI: it renders and compares without writing, so a change to
 * lib/email/design that never regenerated the files fails the build instead of
 * shipping a dashboard that silently disagrees with the code.
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'email-templates');

// The dependency order of the design modules. Flattened into one temp directory
// so relative imports between them keep resolving.
const MODULES = [
  ['plainTextEmailHtml.js', 'lib/email/plainTextEmailHtml.ts'],
  ['theme.js', 'lib/email/design/theme.ts'],
  ['blocks.js', 'lib/email/design/blocks.ts'],
  ['render.js', 'lib/email/design/render.ts'],
  ['supabaseTemplates.js', 'lib/email/design/supabaseTemplates.ts'],
];

function loadDesignSystem() {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'itutor-email-'));

  for (const [outName, src] of MODULES) {
    const code = fs
      .readFileSync(path.join(ROOT, src), 'utf8')
      // Everything lands beside everything else, so '../plainTextEmailHtml'
      // and './theme' both become './<name>'.
      .replace(/from '\.\.\/plainTextEmailHtml'/g, "from './plainTextEmailHtml'");
    const js = ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: src,
    }).outputText;
    fs.writeFileSync(path.join(tmp, outName), js);
  }

  return {
    renderEmail: require(path.join(tmp, 'render.js')).renderEmail,
    supabaseTemplates: require(path.join(tmp, 'supabaseTemplates.js')).supabaseTemplates,
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

/**
 * The header comment each file carries.
 *
 * SUBJECT and FROM were already the convention in these files and are what the
 * operator needs in front of them while filling in the dashboard, so they stay —
 * with the dashboard template's own name added, because "Change Email Address"
 * and change-email.html are not obviously the same thing at 11pm.
 */
function fileHeader(t) {
  return [
    '<!--',
    `  SUBJECT: ${t.subject}`,
    '  FROM: iTutor',
    `  SUPABASE TEMPLATE: ${t.dashboardName}`,
    '',
    '  GENERATED FILE — do not edit by hand.',
    '  Source: lib/email/design/supabaseTemplates.ts',
    '  Regenerate: node scripts/render-email-templates.js',
    '',
    '  Paste the HTML below into Supabase → Authentication → Emails, for every',
    '  environment. Nothing deploys it automatically.',
    '-->',
    '',
  ].join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  const { renderEmail, supabaseTemplates, cleanup } = loadDesignSystem();

  let written = 0;
  let stale = 0;

  for (const t of supabaseTemplates) {
    const { html } = renderEmail(t.email);
    const contents = fileHeader(t) + html + '\n';
    const target = path.join(OUT_DIR, `${t.slug}.html`);

    const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    // Compare on content with line endings normalised: git checks these out
    // with CRLF on Windows, and a whole-file diff on that alone would report
    // every template stale on every machine.
    const same = existing !== null && normalise(existing) === normalise(contents);

    if (same) {
      console.log(`  unchanged  ${t.slug}.html`);
      continue;
    }
    if (check) {
      console.error(`  STALE      ${t.slug}.html`);
      stale++;
      continue;
    }
    fs.writeFileSync(target, contents);
    console.log(`  written    ${t.slug}.html  (${t.subject})`);
    written++;
  }

  cleanup();

  if (check && stale > 0) {
    console.error(
      `\n${stale} template(s) do not match lib/email/design.` +
        '\nRun: node scripts/render-email-templates.js'
    );
    process.exit(1);
  }
  console.log(check ? '\nAll templates match the design system.' : `\n${written} file(s) written.`);
}

function normalise(s) {
  return s.replace(/\r\n/g, '\n').trim();
}

main();
