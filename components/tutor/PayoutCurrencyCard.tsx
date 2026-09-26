'use client';
// Payout currency election (migration 260). TTD is the default; USD converts
// each earning at the CBTT rate on the day the student paid.
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type Currency = 'TTD' | 'USD';

interface CurrencyState {
  enabled: boolean;
  has_account: boolean;
  currency: Currency;
  changed_at: string | null;
  rate: { rate_date: string; ttd_per_usd: number } | null;
}

export default function PayoutCurrencyCard() {
  const [state, setState] = useState<CurrencyState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    try {
      const res = await fetch('/api/tutor/payout-currency');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load payout currency');
      setState(json);
    } catch (err: any) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function choose(currency: Currency) {
    if (!state || currency === state.currency) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const res = await fetch('/api/tutor/payout-currency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update payout currency');
      setMessage(
        currency === 'USD'
          ? 'You will be paid in USD for new earnings. Money already owed is still paid in TTD.'
          : 'You will be paid in TTD for new earnings. USD earnings already owed are still paid in USD.',
      );
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!state) return error ? <div className="text-sm text-coral">{error}</div> : null;
  // Hidden while the feature is off, unless this tutor already elected USD
  // (they must still be able to see and switch back).
  if (!state.enabled && state.currency !== 'USD') return null;

  const rate = state.rate;

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-5 space-y-4">
      <div>
        <div className="font-semibold text-ink">Payout currency</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Students always pay in TT$. If you choose USD, each earning is converted at the Central Bank of
          Trinidad &amp; Tobago selling rate on the day the student paid, and that amount is locked in.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(['TTD', 'USD'] as const).map((c) => (
          <button
            key={c}
            type="button"
            disabled={saving || !state.has_account || (c === 'USD' && !state.enabled)}
            onClick={() => choose(c)}
            className={cn(
              'rounded-xl border px-3 py-3 text-sm font-semibold transition disabled:opacity-50',
              state.currency === c
                ? 'border-brand bg-brand-soft text-brand-deep'
                : 'border-border bg-background text-ink hover:border-brand/50',
            )}
          >
            {c === 'TTD' ? 'TT$ — Trinidad & Tobago dollars' : 'US$ — US dollars'}
          </button>
        ))}
      </div>

      <div className="text-xs text-muted-foreground">
        {rate
          ? `Today's CBTT rate: TT$${rate.ttd_per_usd.toFixed(4)} = US$1 (as of ${rate.rate_date}).`
          : 'Exchange rate not available yet.'}
      </div>

      {!state.has_account && (
        <div className="text-xs text-muted-foreground">Save your bank details above before choosing a currency.</div>
      )}
      {state.currency === 'USD' && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
          Make sure the bank account above can receive US dollar transfers. You can change currency once every 7 days,
          and a change only applies to new earnings.
        </div>
      )}

      {error && <div className="rounded-xl bg-coral/10 border border-coral/30 p-3 text-sm text-coral">{error}</div>}
      {message && <div className="rounded-xl bg-mint border border-brand/30 p-3 text-sm text-ink">{message}</div>}
    </div>
  );
}
