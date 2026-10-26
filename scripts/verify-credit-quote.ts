/**
 * Behavioural checks for the credit quote (lib/credits/quote.ts): how many
 * credits a payment takes and what is left for the card.
 *
 * Run: npm run credits:verify
 *   (= npx ts-node --project scripts/tsconfig.verify.json scripts/verify-credit-quote.ts)
 *
 * The database half — reservations, lots, replays, clawbacks — lives in
 * supabase/_verify_credits.sql (always rolls back).
 *
 * Fee schedule under test: Stripe 3.9% + US$0.30 (TT$2.04 at 6.8), so
 * gross(b) = round2((b + 2.04) / 0.961).
 */

import './_alias';
import { minimumCashBase, quoteCredits } from '../lib/credits/quote';
import type { CreditScenario } from '../lib/credits/types';

const failures: string[] = [];
let passed = 0;

function eq<T>(label: string, actual: T, expected: T) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${label}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

function ok(label: string, condition: boolean, detail = '') {
  if (condition) passed += 1;
  else failures.push(`${label}${detail ? `\n    ${detail}` : ''}`);
}

const pick = (q: ReturnType<typeof quoteCredits>) => ({
  credits: q.creditsApplied,
  cash: q.cashBase,
  fee: q.processingFee,
  gross: q.cashGross,
  full: q.fullCoverage,
  lowered: q.loweredForMinimum,
  refused: q.refusedReason,
});

const MIN = 5;

// ── The minimum card charge ─────────────────────────────────────────────────
// gross(2.76) = 4.99 < 5; gross(2.77) = 5.01. The naive inverse lands a cent
// short, which is why the quote walks to the boundary.
eq('smallest cash base for a TT$5 charge', minimumCashBase(5), 2.77);
eq('a zero minimum still needs a cent of cash', minimumCashBase(0), 0.01);

// ── Full coverage: allowed for A and B, never for C ─────────────────────────
eq('B: credits cover the month', pick(quoteCredits({ scenario: 'B', baseTtd: 250, balanceTtd: 300, minCashChargeTtd: MIN })), {
  credits: 250, cash: 0, fee: 0, gross: 0, full: true, lowered: false, refused: null,
});
eq('A: credits cover the renewal', pick(quoteCredits({ scenario: 'A', baseTtd: 250, balanceTtd: 250, minCashChargeTtd: MIN })), {
  credits: 250, cash: 0, fee: 0, gross: 0, full: true, lowered: false, refused: null,
});
eq('C: a new subscription keeps the minimum cash on its first invoice', pick(quoteCredits({ scenario: 'C', baseTtd: 250, balanceTtd: 300, minCashChargeTtd: MIN })), {
  credits: 247.23, cash: 2.77, fee: 2.24, gross: 5.01, full: false, lowered: true, refused: null,
});

// ── Partial credits: the fee is recalculated on the cash that remains ────────
eq('C: TT$100 of credits on a TT$250 class', pick(quoteCredits({ scenario: 'C', baseTtd: 250, balanceTtd: 100, minCashChargeTtd: MIN })), {
  credits: 100, cash: 150, fee: 8.21, gross: 158.21, full: false, lowered: false, refused: null,
});
eq('B: asking for less than the balance uses only that', pick(quoteCredits({ scenario: 'B', baseTtd: 250, balanceTtd: 300, requestedTtd: 50, minCashChargeTtd: MIN })), {
  credits: 50, cash: 200, fee: 10.24, gross: 210.24, full: false, lowered: false, refused: null,
});

// ── A tiny remainder is lowered to the minimum, not charged under it ────────
eq('B: a TT$2 remainder is raised to the minimum card charge', pick(quoteCredits({ scenario: 'B', baseTtd: 250, balanceTtd: 248, minCashChargeTtd: MIN })), {
  credits: 247.23, cash: 2.77, fee: 2.24, gross: 5.01, full: false, lowered: true, refused: null,
});

// ── Nothing to apply ────────────────────────────────────────────────────────
eq('no balance', pick(quoteCredits({ scenario: 'C', baseTtd: 250, balanceTtd: 0, requestedTtd: 100, minCashChargeTtd: MIN })), {
  credits: 0, cash: 250, fee: 12.27, gross: 262.27, full: false, lowered: false, refused: 'no_balance',
});
eq('C: a class cheaper than the minimum cannot take credits', pick(quoteCredits({ scenario: 'C', baseTtd: 2.5, balanceTtd: 10, minCashChargeTtd: MIN })), {
  credits: 0, cash: 2.5, fee: 2.22, gross: 4.72, full: false, lowered: true, refused: 'below_minimum',
});
eq('B: the same cheap class can be paid entirely with credits', pick(quoteCredits({ scenario: 'B', baseTtd: 2.5, balanceTtd: 10, minCashChargeTtd: MIN })), {
  credits: 2.5, cash: 0, fee: 0, gross: 0, full: true, lowered: false, refused: null,
});
eq('a balance is never rounded up', quoteCredits({ scenario: 'B', baseTtd: 250, balanceTtd: 99.999, minCashChargeTtd: MIN }).creditsApplied, 99.99);

// ── Properties over many inputs ─────────────────────────────────────────────
// Deterministic pseudo-random, so a failure reproduces.
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const scenarios: CreditScenario[] = ['A', 'B', 'C'];
let checked = 0;
for (let i = 0; i < 3000; i++) {
  const scenario = scenarios[i % 3];
  const base = Math.round(rand() * 60000) / 100; // TT$0 – 600
  const balance = Math.round(rand() * 80000) / 100;
  const requested = rand() < 0.3 ? Math.round(rand() * 50000) / 100 : undefined;
  const min = [0, 3.4, 5, 10][i % 4];
  const q = quoteCredits({ scenario, baseTtd: base, balanceTtd: balance, requestedTtd: requested, minCashChargeTtd: min });
  const tag = `${scenario} base=${base} balance=${balance} requested=${requested} min=${min}`;
  const cents = (n: number) => Math.round(n * 100);

  if (cents(q.creditsApplied) + cents(q.cashBase) !== cents(base)) failures.push(`credits + cash ≠ base (${tag})`);
  if (q.creditsApplied > balance + 1e-9) failures.push(`spent more than the balance (${tag})`);
  if (requested !== undefined && q.creditsApplied > requested + 1e-9) failures.push(`spent more than asked (${tag})`);
  if ((q.cashBase === 0) !== (q.cashGross === 0)) failures.push(`a card charge without cash, or cash without a charge (${tag})`);
  if (scenario === 'C' && q.creditsApplied > 0 && q.cashBase === 0) failures.push(`C started a subscription on credits alone (${tag})`);
  if (q.creditsApplied > 0 && q.cashGross > 0 && q.cashGross < min) failures.push(`credits left a charge under the minimum (${tag})`);
  if (q.cashGrossCents !== cents(q.cashGross)) failures.push(`cents disagree with TT$ (${tag})`);
  checked += 1;
}
ok(`properties hold over ${checked} random quotes`, failures.length === 0);

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed, ${passed} passed\n`);
  for (const f of failures.slice(0, 30)) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ credit quote: ${passed} checks passed`);
