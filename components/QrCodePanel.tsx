'use client';

import { useEffect, useMemo, useState } from 'react';

// QR codes are meant to be scanned in the real world, so they always encode the
// public production domain regardless of which environment renders this panel.
const PUBLIC_BASE = 'https://myitutor.com';
// iTutor brand green (tailwind token `itutor-green`). Kept fully-opaque white
// behind it — contrast is what keeps the code scannable.
const BRAND_GREEN = '#199356';
// Compact square brand mark for the centre overlay (small + square, unlike the
// wordmark logos which are too wide to sit inside a QR).
const LOGO_SRC = '/assets/logo/itutor-mark.png';

type ClassLite = { id: string; name: string | null };

interface QrItem {
  key: string;
  label: string;
  url: string;
}

// Load the centre logo once. Resolves to null (rather than rejecting) if it
// can't load, so we fall back to a plain — still brand-green — QR.
function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = LOGO_SRC;
  });
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

  const items = useMemo<QrItem[]>(
    () => [
      ...(showProfile
        ? [{ key: 'profile', label: 'Profile', url: `${PUBLIC_BASE}/tutors/${tutorId}` }]
        : []),
      // Point at the class page a prospective student should actually land on
      // — the one with the banner, schedule and Join button. /classes/[id] is
      // the older dark-themed view; it now redirects here, so QR codes already
      // printed against that URL keep working.
      ...classes.map((c) => ({
        key: `class-${c.id}`,
        label: c.name || 'Untitled class',
        url: `${PUBLIC_BASE}/student/explore/${c.id}`,
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tutorId, classSig, showProfile]
  );

  const [pngs, setPngs] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const QRCode = (await import('qrcode')).default;
      const logo = await loadLogo();
      const out: Record<string, string> = {};
      for (const it of items) {
        const canvas = document.createElement('canvas');
        try {
          // Level 'H' error correction gives ~30% redundancy, enough to safely
          // obscure the centre with the logo below.
          await QRCode.toCanvas(canvas, it.url, {
            width: 512,
            margin: 2,
            errorCorrectionLevel: 'H',
            color: { dark: BRAND_GREEN, light: '#FFFFFFFF' },
          });
        } catch {
          continue; // skip a code that fails to render
        }
        // Composite the brand mark at ~20% width (well under the 'H' budget),
        // on a white padding square so it never touches QR modules directly.
        if (logo) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const logoSize = Math.round(canvas.width * 0.2);
            const pad = Math.round(logoSize * 0.16);
            const box = logoSize + pad * 2;
            const x = (canvas.width - box) / 2;
            const y = (canvas.height - box) / 2;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(x, y, box, box);
            ctx.drawImage(logo, x + pad, y + pad, logoSize, logoSize);
          }
        }
        out[it.key] = canvas.toDataURL('image/png');
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
