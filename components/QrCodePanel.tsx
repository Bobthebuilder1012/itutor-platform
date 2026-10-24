'use client';

import { useEffect, useMemo, useState } from 'react';

import { CANONICAL_BASE, publicBase, renderBrandedQr } from '@/lib/qr/brandedQr';

type ClassLite = { id: string; name: string | null };

interface QrItem {
  key: string;
  label: string;
  url: string;
}

export default function QrCodePanel({
  tutorId,
  classes,
  showProfile = true,
}: {
  tutorId: string;
  classes: ClassLite[];
  showProfile?: boolean;
}) {
  const classSig = classes.map((c) => c.id).join(',');

  // item.url is rendered, so the first paint has to match what the server
  // sent. Start on the canonical domain and adopt the real origin after
  // mount: identical in production, and on staging the QR then points at
  // staging instead of a page that only exists in production.
  const [base, setBase] = useState(CANONICAL_BASE);
  useEffect(() => {
    setBase(publicBase());
  }, []);

  const items = useMemo<QrItem[]>(
    () => [
      ...(showProfile
        ? [{ key: 'profile', label: 'Profile', url: `${base}/tutors/${tutorId}` }]
        : []),
      // Point at the class page a prospective student should actually land on
      // — the one with the banner, schedule and Join button. /classes/[id] is
      // the older dark-themed view; it now redirects here, so QR codes already
      // printed against that URL keep working.
      ...classes.map((c) => ({
        key: `class-${c.id}`,
        label: c.name || 'Untitled class',
        url: `${base}/student/explore/${c.id}`,
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, tutorId, classSig, showProfile]
  );

  const [pngs, setPngs] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Drawing lives in lib/qr/brandedQr.ts, shared with the referral share card
      // and the campaign-code print sheets.
      const out: Record<string, string> = {};
      for (const it of items) {
        const png = await renderBrandedQr(it.url);
        if (png) out[it.key] = png; // skip a code that fails to render
      }
      if (!cancelled) setPngs(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  function download(item: QrItem) {
    const dataUrl = pngs[item.key];
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${item.label.replace(/\s+/g, '-').toLowerCase()}-qr.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function copy(item: QrItem) {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopied(item.key);
      setTimeout(() => setCopied((k) => (k === item.key ? null : k)), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item) => (
        <div key={item.key} className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col items-center text-center">
          <p className="text-sm font-semibold text-gray-900 truncate w-full" title={item.label}>
            {item.key === 'profile' ? 'Profile QR' : item.label}
          </p>
          <div className="my-3 w-32 h-32 flex items-center justify-center">
            {pngs[item.key] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pngs[item.key]} alt={`${item.label} QR code`} className="w-32 h-32" />
            ) : (
              <div className="w-32 h-32 rounded-lg bg-gray-100 animate-pulse" />
            )}
          </div>
          <p className="text-[11px] text-gray-400 break-all mb-3">{item.url}</p>
          <div className="flex gap-2 w-full">
            <button
              onClick={() => download(item)}
              disabled={!pngs[item.key]}
              className="flex-1 px-2 py-1.5 rounded-lg bg-itutor-green text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-50"
            >
              Download
            </button>
            <button
              onClick={() => copy(item)}
              className="flex-1 px-2 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50"
            >
              {copied === item.key ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
