'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

// QR codes are scanned in the real world, so they always encode the public
// production domain regardless of environment.
const PUBLIC_BASE = 'https://myitutor.com';
const LOGO_SRC = '/assets/logo/itutor-mark.png';

// Compact, plain black-and-white QR (matches the prototype design) with a
// centered iTutor mark — generated fully on-device with the local `qrcode`
// package, so the tutor's profile URL is never sent to a third-party service.
export default function ProfileQrCard({ tutorId, size = 116 }: { tutorId: string; size?: number }) {
  const [png, setPng] = useState<string | null>(null);

  useEffect(() => {
    if (!tutorId) return;
    let cancelled = false;
    (async () => {
      const QRCode = (await import('qrcode')).default;
      const canvas = document.createElement('canvas');
      try {
        await QRCode.toCanvas(canvas, `${PUBLIC_BASE}/tutors/${tutorId}`, {
          width: 512,
          margin: 1,
          errorCorrectionLevel: 'H',
          color: { dark: '#000000', light: '#FFFFFFFF' },
        });
      } catch {
        return;
      }
      // Centered logo on a white pad square (level 'H' redundancy covers it).
      const logo = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = LOGO_SRC;
      });
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
      if (!cancelled) setPng(canvas.toDataURL('image/png'));
    })();
    return () => { cancelled = true; };
  }, [tutorId]);

  function download() {
    if (!png) return;
    const a = document.createElement('a');
    a.href = png;
    a.download = 'profile-qr.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="flex items-center gap-3">
      <div className="shrink-0 rounded-lg border border-border bg-white p-1" style={{ width: size, height: size }}>
        {png ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={png} alt="Profile QR code" className="w-full h-full" />
        ) : (
          <div className="w-full h-full rounded bg-muted animate-pulse" />
        )}
      </div>
      <button
        onClick={download}
        disabled={!png}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-itutor-green text-white text-xs font-semibold hover:bg-emerald-600 disabled:opacity-50"
      >
        <Download className="size-3.5" /> Download
      </button>
    </div>
  );
}
