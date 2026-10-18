/**
 * Behavioural checks for the credit quote (lib/credits/quote.ts): credits pay
 * for a payment in full or not at all.
 *
 * Run: npm run credits:verify
 *   (= npx ts-node --project scripts/tsconfig.verify.json scripts/verify-credit-quote.ts)
 *
 * The database half — reservations, lots, replays, clawbacks — lives in
 * supabase/_verify_credits.sql (always rolls back).
 */

import './_alias';
import { quoteCredits } from '../lib/credits/quote';
import type { CreditScenario } from '../lib/credits/types';

const failures: string[] = [];
let passed = 0;

function eq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${label}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

function ok(label: string, condition: boolean) {
  if (condition) passed += 1;
  else failures.push(label);
}

const pick = (q: ReturnType<typeof quoteCredits>) => ({
  credits: q.creditsApplied,
  cash: q.cashBase,
  full: q.fullCoverage,
  short: q.shortfallTtd,
  refused: q.refusedReason,
});

// ── Full coverage: the only way credits are used ────────────────────────────
eq('B: credits cover the month', pick(quoteCredits({ scenario: 'B', baseTtd: 250, balanceTtd: 300 })), {
  credits: 250, cash: 0, full: true, short: 0, refused: null,
});
eq('A: credits exactly cover the renewal', pick(quoteCredits({ scenario: 'A', baseTtd: 250, balanceTtd: 250 })), {
  credits: 250, cash: 0, full: true, short: 0, refused: null,
});

// ── Never part-paid ─────────────────────────────────────────────────────────
eq('B: TT$100 cannot part-pay a TT$250 month', pick(quoteCredits({ scenario: 'B', baseTtd: 250, balanceTtd: 100 })), {
  credits: 0, cash: 250, full: false, short: 150, refused: 'not_enough',
});
eq('A: a cent short is short', pick(quoteCredits({ scenario: 'A', baseTtd: 250, balanceTtd: 249.99 })), {
  credits: 0, cash: 250, full: false, short: 0.01, refused: 'not_enough',
});
eq('offering less than the price is refused even with enough balance', pick(quoteCredits({ scenario: 'B', baseTtd: 250, balanceTtd: 300, requestedTtd: 50 })), {
  credits: 0, cash: 250, full: false, short: 0, refused: 'not_enough',
});
eq('no balance', pick(quoteCredits({ scenario: 'B', baseTtd: 250, balanceTtd: 0 })), {
  credits: 0, cash: 250, full: false, short: 250, refused: 'no_balance',
});

// ── Never a new subscription ────────────────────────────────────────────────
eq('C: credits never start a subscription', pick(quoteCredits({ scenario: 'C', baseTtd: 250, balanceTtd: 1000 })), {
  credits: 0, cash: 250, full: false, short: 0, refused: 'new_subscription',
});
eq('a balance is never rounded up', quoteCredits({ scenario: 'B', baseTtd: 100, balanceTtd: 99.999 }).refusedReason, 'not_enough');

// ── Properties over many inputs ─────────────────────────────────────────────
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const scenarios: CreditScenario[] = ['A', 'B', 'C'];
const before = failures.length;
for (let i = 0; i < 3000; i++) {
  const scenario = scenarios[i % 3];
  const base = Math.round(rand() * 60000) / 100;
  const balance = Math.round(rand() * 80000) / 100;
  const q = quoteCredits({ scenario, baseTtd: base, balanceTtd: balance });
  const tag = `${scenario} base=${base} balance=${balance}`;
  if (q.creditsApplied > 0 && q.creditsApplied !== q.baseTtd) failures.push(`part-paid with credits (${tag})`);
  if (q.creditsApplied > 0 && q.cashGross !== 0) failures.push(`credits plus a card charge (${tag})`);
  if (q.creditsApplied > balance + 1e-9) failures.push(`spent more than the balance (${tag})`);
  if (scenario === 'C' && q.creditsApplied > 0) failures.push(`C used credits (${tag})`);
  if (scenario !== 'C' && base > 0 && balance >= base && !q.fullCoverage) failures.push(`enough credit was refused (${tag})`);
}
ok('properties hold over 3000 random quotes', failures.length === before);

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed, ${passed} passed\n`);
  for (const f of failures.slice(0, 30)) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ credit quote: ${passed} checks passed`);
