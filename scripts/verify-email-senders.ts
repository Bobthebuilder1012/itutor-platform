/**
 * Proves which address every email flow sends as. No database, no network, no
 * mail delivered.
 *
 *   npm run email:senders
 *
 * Two halves:
 *
 * 1. resolveFrom() under the env combinations that matter, including the one
 *    that caused this work — a production environment with EMAIL_FROM set to
 *    the hello@ address, where a transactional send must ignore it.
 *
 * 2. A static sweep of every sendEmail() call site in app/ and lib/, printing
 *    the sender each one resolves to. This is the half that answers "did you
 *    check every flow?" without needing twenty-nine inboxes: a flow's sender
 *    is decided at the call site, so reading the call sites IS the check. A
 *    send test in an inbox then confirms the wiring end to end for a couple of
 *    flows rather than having to carry all of them.
 *
 * It fails if a call site passes something other than the two known categories,
 * which is what stops a typo'd category silently falling back to the default.
 */
import './_alias';
import * as fs from 'fs';
import * as path from 'path';
import { resolveFrom, type EmailCategory } from '../lib/services/emailService';

const ROOT = path.resolve(__dirname, '..');
const TRANSACTIONAL = 'iTutor <noreply@myitutor.com>';
const PROMOTIONAL = 'iTutor <hello@myitutor.com>';

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

// ---------------------------------------------------------------------------
// 1. resolveFrom
// ---------------------------------------------------------------------------

const EMAIL_ENV = [
  'EMAIL_FROM',
  'EMAIL_FROM_TRANSACTIONAL',
  'EMAIL_FROM_PROMOTIONAL',
  // Not read any more, and listed here precisely so the check below can prove
  // that: it is still set on production, and a fallback chain that quietly
  // honoured a removed provider's variable would be invisible otherwise.
  'RESEND_FROM_EMAIL',
] as const;

/** Run `fn` with exactly the given email env vars set and the rest cleared. */
function withEnv(vars: Partial<Record<(typeof EMAIL_ENV)[number], string>>, fn: () => void) {
  const saved = EMAIL_ENV.map((k) => [k, process.env[k]] as const);
  for (const k of EMAIL_ENV) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
  try {
    fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

console.log('resolveFrom — nothing configured');
withEnv({}, () => {
  check('transactional → noreply@', resolveFrom('transactional') === TRANSACTIONAL, resolveFrom('transactional'));
  check('promotional → hello@', resolveFrom('promotional') === PROMOTIONAL, resolveFrom('promotional'));
});

console.log('resolveFrom — production today (EMAIL_FROM = hello@)');
withEnv({ EMAIL_FROM: PROMOTIONAL }, () => {
  // The whole point of the change. If this ever goes green the other way,
  // password resets are going out from the marketing address again.
  check(
    'transactional IGNORES EMAIL_FROM',
    resolveFrom('transactional') === TRANSACTIONAL,
    resolveFrom('transactional')
  );
  check('promotional honours EMAIL_FROM', resolveFrom('promotional') === PROMOTIONAL);
});

console.log('resolveFrom — RESEND_FROM_EMAIL is set (production today) and must be ignored');
withEnv({ RESEND_FROM_EMAIL: 'iTutor <old@myitutor.com>' }, () => {
  // Resend is gone. This variable is still set on production, preview and
  // development, so "ignored" has to be asserted rather than assumed.
  check('transactional ignores it', resolveFrom('transactional') === TRANSACTIONAL);
  check('promotional ignores it too', resolveFrom('promotional') === PROMOTIONAL);
});

console.log('resolveFrom — explicit overrides');
withEnv(
  {
    EMAIL_FROM: PROMOTIONAL,
    EMAIL_FROM_TRANSACTIONAL: 'iTutor <tx@myitutor.com>',
    EMAIL_FROM_PROMOTIONAL: 'iTutor <mkt@myitutor.com>',
  },
  () => {
    check('EMAIL_FROM_TRANSACTIONAL wins', resolveFrom('transactional') === 'iTutor <tx@myitutor.com>');
    check('EMAIL_FROM_PROMOTIONAL beats EMAIL_FROM', resolveFrom('promotional') === 'iTutor <mkt@myitutor.com>');
  }
);

console.log('resolveFrom — blank values are not values');
withEnv({ EMAIL_FROM_TRANSACTIONAL: '   ' }, () => {
  check('whitespace-only falls through', resolveFrom('transactional') === TRANSACTIONAL);
});

// ---------------------------------------------------------------------------
// 2. Every sendEmail() call site
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

interface CallSite {
  file: string;
  line: number;
  category: string;
  explicitFrom: boolean;
}

/**
 * Blank out comments and string bodies, keeping every character position and
 * every newline, so offsets and line numbers still line up with the original.
 *
 * Needed because several files MENTION sendEmail() in a doc comment. Counting
 * those as call sites reports 29 flows where there are 27, and a verification
 * run that overcounts is worse than none — it reads as thorough. Strings are
 * blanked for the mirror-image reason: a URL's `//` must not open a comment.
 */
function blankCommentsAndStrings(src: string): string {
  const out = src.split('');
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== '\n') out[k] = ' ';
    }
  };

  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      blank(i, stop);
      i = stop;
    } else if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (src[i] === "'" || src[i] === '"' || src[i] === '`') {
      const quote = src[i];
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') j += 2;
        else if (src[j] === quote) break;
        else j++;
      }
      blank(i + 1, j);
      i = j + 1;
    } else {
      i++;
    }
  }
  return out.join('');
}

/** The argument text of a `sendEmail(` call, by balancing parentheses. */
function callArgs(src: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') {
      depth--;
      if (depth === 0) return src.slice(openParen + 1, i);
    }
  }
  return src.slice(openParen + 1);
}

const sites: CallSite[] = [];
const files = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'lib'))];

for (const file of files) {
  // The service itself declares sendEmail; it is not a call site.
  if (file.endsWith(path.join('lib', 'services', 'emailService.ts'))) continue;

  const src = fs.readFileSync(file, 'utf8');
  // Locate calls in the blanked copy, so doc-comment mentions and strings
  // cannot match, then read the arguments out of the original at the same
  // offsets — the category check below needs the real quoted values.
  const scannable = blankCommentsAndStrings(src);
  const re = /(?<![\w.])sendEmail\s*\(/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(scannable)) !== null) {
    // A local helper that happens to share the name (app/admin/emails/page.tsx
    // declares one) is not this service's sendEmail.
    const before = scannable.slice(Math.max(0, m.index - 24), m.index);
    if (/\b(const|let|var|function)\s+$/.test(before)) continue;

    const openParen = scannable.indexOf('(', m.index);
    const args = callArgs(src, openParen);
    // A call whose argument is a bare identifier/spread tells us nothing
    // statically; none exist today, and one appearing is worth a failure.
    const categoryMatch = /\bcategory\s*:\s*'([^']*)'/.exec(args);
    sites.push({
      file: path.relative(ROOT, file).replace(/\\/g, '/'),
      line: src.slice(0, m.index).split('\n').length,
      category: categoryMatch ? categoryMatch[1] : 'transactional (default)',
      explicitFrom: /\bfrom\s*:/.test(args),
    });
  }
}

console.log(`\nsendEmail() call sites — ${sites.length} found\n`);

const width = Math.max(...sites.map((s) => `${s.file}:${s.line}`.length));
let promotional = 0;
let transactional = 0;

for (const site of sites.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
  const base = site.category.startsWith('promotional') ? 'promotional' : 'transactional';
  if (base === 'promotional') promotional += 1;
  else transactional += 1;

  const sender = site.explicitFrom
    ? '(explicit from: at call site)'
    : resolveFrom(base as EmailCategory);
  console.log(`  ${`${site.file}:${site.line}`.padEnd(width)}  ${base.padEnd(13)}  ${sender}`);

  check(
    `${site.file}:${site.line} category is recognised`,
    site.category === 'transactional (default)' ||
      site.category === 'transactional' ||
      site.category === 'promotional',
    site.category
  );
}

console.log('');
check('at least one promotional call site is marked', promotional > 0, promotional);
check('the large majority are transactional', transactional > promotional, { transactional, promotional });

// ---------------------------------------------------------------------------
// 3. The two senders that live outside the service
// ---------------------------------------------------------------------------
//
// Deno edge functions cannot import lib/services/emailService, so they carry
// their own default. A grep is the only check available, and it is worth
// having: these are the paths most likely to be forgotten when the sender moves.

console.log('\nsenders set outside emailService');
for (const [fn, label] of [
  ['send-auth-email', 'auth hook (password reset, signup, magic link)'],
  ['send-payment-receipt', 'payment receipt'],
] as const) {
  const src = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', fn, 'index.ts'), 'utf8');
  check(`${label} defaults to noreply@`, src.includes("'iTutor <noreply@myitutor.com>'"), fn);
}

// ---------------------------------------------------------------------------
// 4. Resend stays gone
// ---------------------------------------------------------------------------
//
// Resend was the original provider and was removed entirely. There is now no
// second provider to fail over to, so the failure this guards against is not
// "two providers drift" but "someone reaches for the old one": a direct
// fetch to api.resend.com, or a RESEND_API_KEY read, would send mail that
// skips the sender split, the EMAIL_ALLOWLIST guard and the logging above,
// and it would work well enough in testing to survive review.

console.log('\nResend removal');

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bfrom\s+'resend'/, "import from 'resend'"],
  [/\brequire\(\s*'resend'\s*\)/, "require('resend')"],
  [/api\.resend\.com/, 'direct call to api.resend.com'],
  [/\bRESEND_API_KEY\b/, 'RESEND_API_KEY'],
];

const scanned = [
  ...walk(path.join(ROOT, 'app')),
  ...walk(path.join(ROOT, 'lib')),
  ...walk(path.join(ROOT, 'components')),
  ...walk(path.join(ROOT, 'supabase')),
];

const offenders: string[] = [];
for (const file of scanned) {
  const src = blankCommentsAndStrings(fs.readFileSync(file, 'utf8'));
  for (const [re, label] of FORBIDDEN) {
    if (re.test(src)) {
      offenders.push(`${path.relative(ROOT, file).split(path.sep).join('/')} — ${label}`);
    }
  }
}
check('no code reaches for Resend', offenders.length === 0, offenders);

const deps = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
check(
  'resend is not a dependency',
  !deps.dependencies?.resend && !deps.devDependencies?.resend,
  deps.dependencies?.resend
);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
