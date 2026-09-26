// Payout batch total with its currency (migration 260). A USD batch pays
// total_amount_usd; its TTD equivalent is shown beside it for reconciliation.
import { fmtTTD, fmtUSD } from '@/lib/utils/formatCurrency';

export interface BatchMoney {
  total_amount_ttd: number | null;
  total_amount_usd?: number | null;
  currency?: 'TTD' | 'USD' | string | null;
}

export function CurrencyBadge({ currency }: { currency?: string | null }) {
  const usd = currency === 'USD';
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${
        usd ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-600'
      }`}
    >
      {usd ? 'USD' : 'TTD'}
    </span>
  );
}

export default function BatchAmount({ batch }: { batch: BatchMoney }) {
  if (batch.currency === 'USD') {
    return (
      <span className="inline-flex flex-col items-end leading-tight">
        <span className="inline-flex items-center gap-1.5">
          <CurrencyBadge currency="USD" />
          {fmtUSD(batch.total_amount_usd ?? 0)}
        </span>
        <span className="text-[11px] font-normal text-gray-500">{fmtTTD(batch.total_amount_ttd ?? 0)} equiv.</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <CurrencyBadge currency="TTD" />
      {fmtTTD(batch.total_amount_ttd ?? 0)}
    </span>
  );
}
