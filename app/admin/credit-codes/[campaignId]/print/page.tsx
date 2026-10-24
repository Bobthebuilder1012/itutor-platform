'use client';

/**
 * /admin/credit-codes/[campaignId]/print — every active code of a campaign as
 * a grid of QR cards (code text, value, how to redeem), for printing or saving
 * as a PDF from the browser's print dialog. ?link=<tracked link code> routes
 * each QR through /r/<link> so scans are counted on Link Tracking.
 */

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { publicBase, renderBrandedQr } from '@/lib/qr/brandedQr';

function qrTarget(code: string, linkCode: string): string {
  const redeem = `/redeem/${encodeURIComponent(code)}`;
  return linkCode ? `${publicBase()}/r/${encodeURIComponent(linkCode)}?to=${encodeURIComponent(redeem)}` : `${publicBase()}${redeem}`;
}

export default function PrintCodesPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const link = (useSearchParams().get('link') ?? '').trim().toLowerCase();
  const [campaign, setCampaign] = useState<{ name: string; value_ttd: number; ends_at: string | null } | null>(null);
  const [cards, setCards] = useState<Array<{ code: string; png: string | null }>>([]);
  const [status, setStatus] = useState('Loading codes…');

  useEffect(() => {
    (async () => {
      const [detailRes, allRes] = await Promise.all([
        fetch(`/api/admin/credit-codes/${campaignId}`, { cache: 'no-store' }),
        fetch(`/api/admin/credit-codes/${campaignId}?all=1`, { cache: 'no-store' }),
      ]);
      if (!detailRes.ok || !allRes.ok) {
        setStatus('Could not load this campaign (admin sign-in required).');
        return;
      }
      const detail = await detailRes.json();
      const all = await allRes.json();
      setCampaign(detail.campaign);
      const codes: string[] = (all.codes ?? []).filter((c: { status: string }) => c.status === 'active').map((c: { code: string }) => c.code);
      const out: Array<{ code: string; png: string | null }> = [];
      for (let i = 0; i < codes.length; i++) {
        out.push({ code: codes[i], png: await renderBrandedQr(qrTarget(codes[i], link), 384) });
        if (i % 20 === 0) setStatus(`Drawing ${i + 1} of ${codes.length}…`);
      }
      setCards(out);
      setStatus(codes.length ? '' : 'No active codes to print.');
    })();
  }, [campaignId, link]);

  const value = campaign ? `TT$${Number(campaign.value_ttd).toFixed(2)}` : '';

  return (
    <div className="min-h-screen bg-white p-6 text-gray-900">
      <style>{`@media print { .no-print { display: none !important; } @page { margin: 10mm; } .card { break-inside: avoid; } }`}</style>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{campaign?.name ?? 'Credit codes'}</h1>
          <p className="text-sm text-gray-600">
            {cards.length} codes{link ? ` · scans counted on /r/${link}` : ''}. Use your browser’s print dialog to print or save as PDF.
          </p>
        </div>
        <button onClick={() => window.print()} disabled={!cards.length} className="rounded-lg bg-[#199356] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Print / Save as PDF
        </button>
      </div>
      {status ? <p className="no-print text-sm text-gray-600">{status}</p> : null}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3">
        {cards.map((c) => (
          <div key={c.code} className="card flex flex-col items-center rounded-xl border border-gray-300 p-3 text-center">
            {c.png ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.png} alt={`QR for ${c.code}`} className="size-36" />
            ) : null}
            <div className="mt-2 font-mono text-base font-bold tracking-widest">{c.code}</div>
            <div className="text-sm font-semibold text-[#199356]">{value} in iTutor credits</div>
            <div className="mt-1 text-[10px] leading-tight text-gray-600">
              Scan, or go to myitutor.com/redeem
              {campaign?.ends_at ? ` · valid until ${new Date(campaign.ends_at).toLocaleDateString('en-TT', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
