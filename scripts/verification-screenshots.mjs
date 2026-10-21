// Screenshots + checks of /dev/verification-states and a few backend-free routes, at
// 375px and 1280px, against a RUNNING dev server (VERIFICATION_DEV_TOOLS=true).
//   npm install --no-save playwright && npx playwright install chromium
//   OUT=docs/verification-screenshots node scripts/verification-screenshots.mjs
// It never logs in: logged-in flows need a real database (see docs/VERIFICATION_V2_LOCAL_TESTING.md).
// Drives the running dev server (http://localhost:3000): screenshots of the dev
// states gallery at phone and desktop widths, overflow checks, and a few
// interactions. Backend-free: it never logs in (there is no database here).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.env.OUT;
mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, extra = '') => results.push({ name, pass: !!cond, extra: cond ? '' : String(extra) });

const browser = await chromium.launch();
const sections = ['teacher-status', 'steps', 'identity', 'fallback', 'admin', 'badges', 'messages'];

for (const [label, width, height] of [['phone-375', 375, 812], ['desktop-1280', 1280, 900]]) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  const res = await page.goto(`${BASE}/dev/verification-states`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  ok(`${label}: gallery loads (200)`, res?.status() === 200, res?.status());
  await page.waitForSelector('[data-testid="provider-select"]', { timeout: 180000 });

  const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  ok(`${label}: no horizontal page scroll`, overflow.sw <= overflow.iw + 1, JSON.stringify(overflow));

  await page.screenshot({ path: `${OUT}/gallery-${label}-full.png`, fullPage: true });
  for (const id of sections) {
    const el = page.locator(`#${id}`);
    if (await el.count()) await el.screenshot({ path: `${OUT}/gallery-${label}-${id}.png` }).catch((e) => ok(`${label}: screenshot ${id}`, false, e.message));
  }

  // counts of what is on the page
  const cells = await page.locator('[data-state]').count();
  ok(`${label}: shows many states (${cells})`, cells >= 50, cells);

  // the three badge labels exist, separately, and the extras label is exact
  const bodyText = await page.locator('body').innerText();
  ok(`${label}: the three badge labels appear`, /ID checked/.test(bodyText) && /Credentials reviewed/.test(bodyText) && /Teacher-provided extras \(not verified by iTutor\)/.test(bodyText));
  ok(`${label}: no provider name leaks into teacher screens`, !/(requires_input|under_supported_age|stripe says|didit says|veriff says)/i.test(await page.locator('#identity').innerText()));
  ok(`${label}: no manual identity route is offered anywhere`, !/manual verification|manual review of your id/i.test(bodyText));

  // fallback explorer
  await page.selectOption('[data-testid="outcome-select"]', 'not_supported');
  await page.fill('[data-testid="attempts-input"]', '1');
  let result = await page.locator('[data-testid="fallback-result"]').innerText();
  ok(`${label}: not_supported on stripe falls back to didit`, /Fall back automatically to didit/.test(result), result);
  await page.selectOption('[data-testid="provider-select"]', 'didit');
  result = await page.locator('[data-testid="fallback-result"]').innerText();
  ok(`${label}: not_supported on didit falls back to veriff`, /veriff/.test(result), result);
  await page.fill('[data-testid="attempts-input"]', '3');
  result = await page.locator('[data-testid="fallback-result"]').innerText();
  ok(`${label}: all attempts used shows contact support`, /contact support/i.test(result), result);
  await page.selectOption('[data-testid="outcome-select"]', 'consent_declined');
  result = await page.locator('[data-testid="fallback-result"]').innerText();
  ok(`${label}: consent declined tries nothing else`, /declined/i.test(result) && /contact support/i.test(result), result);
  await page.screenshot({ path: `${OUT}/fallback-${label}.png`, clip: undefined, fullPage: false });

  // provider selector reaches the admin identity section
  await page.selectOption('[data-testid="provider-select"]', 'veriff');
  const adminText = await page.locator('#admin').innerText();
  ok(`${label}: provider selector changes the admin "checked by"`, /checked by veriff/.test(adminText));

  // identity step interaction: choose a country, press start, see the (stubbed) action
  const cell = page.locator('[data-state="not started (no country)"]');
  await cell.scrollIntoViewIfNeeded();
  const btn = cell.getByRole('button', { name: 'Start identity check' });
  ok(`${label}: start is disabled until a country is chosen`, await btn.isDisabled());
  await cell.locator('select').selectOption('TT');
  ok(`${label}: start enables after choosing a country`, await btn.isEnabled());
  await btn.click();
  await page.waitForFunction(() => /country "TT"/.test(document.querySelector('[data-testid="last-action"]')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => {});
  ok(`${label}: pressing start reports the chosen country`, /country "TT"/.test(await page.locator('[data-testid="last-action"]').innerText()));

  const real = errors.filter((e) => !/favicon|Download the React DevTools|Failed to load resource/.test(e));
  ok(`${label}: no console errors`, real.length === 0, real.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---- backend-free route checks ----
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const api = ctx.request;
const flag = await api.get(`${BASE}/api/verification-v2/flag`);
ok('flag endpoint answers with a boolean', flag.ok() && typeof (await flag.json()).enabled === 'boolean');
const cron = await api.get(`${BASE}/api/cron/verification-cleanup`);
ok('cron endpoint refuses without the secret (401)', cron.status() === 401, cron.status());
for (const [path, method] of [['/api/webhooks/stripe-identity', 'POST'], ['/api/webhooks/identity/didit', 'POST'], ['/api/webhooks/identity/veriff', 'POST']]) {
  const r = await api.fetch(`${BASE}${path}`, { method, data: '{}', headers: { 'content-type': 'application/json' } });
  ok(`${path} never accepts an unsigned request (${r.status()})`, [400, 500].includes(r.status()), r.status());
}
const unknown = await api.post(`${BASE}/api/webhooks/identity/nonsense`, { data: '{}' });
ok('unknown provider webhook is 404', unknown.status() === 404, unknown.status());
const process_ = await api.post(`${BASE}/api/verification/request/abc/process`);
ok('OCR endpoint without a session is 401', process_.status() === 401, process_.status());
const adminApi = await api.get(`${BASE}/api/admin/verification-v2/queue`);
ok('admin queue API without a session is not served (401/403/404)', [401, 403, 404, 500].includes(adminApi.status()), adminApi.status());
await ctx.close();

await browser.close();
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.extra ? '  ' + r.extra : ''}`);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
