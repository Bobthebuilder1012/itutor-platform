// The branded iTutor QR code: brand green on white, with the square brand mark
// in the centre. Browser-only (canvas + Image). Shared by the tutor QR panel,
// the referral share card and the campaign-code print sheets, so every QR the
// company prints looks the same.
//
// Level 'H' error correction gives ~30% redundancy, enough to safely obscure
// the centre with the logo, which is kept to ~20% of the width on a white
// padding square so it never touches QR modules directly.

/** The real-world domain. Anything printed or handed out must carry this. */
export const CANONICAL_BASE = 'https://myitutor.com';

/**
 * Where a QR code should send the phone that scans it.
 *
 * In production this is the canonical domain, so nothing about a printed code
 * changes. Anywhere else — staging, a preview, localhost — it is the origin
 * being browsed, because a code that only exists in the staging database is
 * dead if its QR sends the phone to myitutor.com. That was a real 404: the
 * credits feature, `/redeem/<code>` included, ships on staging and does not
 * exist in production, so every campaign QR made on staging was unscannable.
 *
 * Call this at the point of use, never at module scope. These are client
 * components, but Next still renders them on the server first, and freezing
 * the server's answer into the markup would mismatch on hydration.
 *
 * Corollary worth knowing: generate anything destined for print from
 * myitutor.com, or the codes will carry whatever deployment URL you were on.
 */
export function publicBase(): string {
  if (typeof window === 'undefined') return CANONICAL_BASE;
  const origin = window.location.origin;
  // Sandboxed iframes report the string "null" rather than an origin.
  return origin && origin !== 'null' ? origin : CANONICAL_BASE;
}

// iTutor brand green (tailwind token `itutor-green`). Kept fully-opaque white
// behind it — contrast is what keeps the code scannable.
export const BRAND_GREEN = '#199356';

// Compact square brand mark for the centre overlay (small + square, unlike the
// wordmark logos which are too wide to sit inside a QR).
const LOGO_SRC = '/assets/logo/itutor-mark.png';

let logoPromise: Promise<HTMLImageElement | null> | null = null;

// Load the centre logo once. Resolves to null (rather than rejecting) if it
// can't load, so we fall back to a plain — still brand-green — QR.
function loadLogo(): Promise<HTMLImageElement | null> {
  logoPromise ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = LOGO_SRC;
  });
  return logoPromise;
}

/** A PNG data URL of the branded QR for `url`, or null if it cannot be drawn. */
export async function renderBrandedQr(url: string, size = 512): Promise<string | null> {
  const QRCode = (await import('qrcode')).default;
  const logo = await loadLogo();
  const canvas = document.createElement('canvas');
  try {
    await QRCode.toCanvas(canvas, url, {
      width: size,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: BRAND_GREEN, light: '#FFFFFFFF' },
    });
  } catch {
    return null;
  }
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
  return canvas.toDataURL('image/png');
}

/**
 * The same code as an SVG string, for print sheets and vector downloads. The
 * centre mark is a white square with the logo embedded by URL, so the file
 * stays small and opens anywhere.
 */
export async function renderBrandedQrSvg(url: string): Promise<string | null> {
  const QRCode = (await import('qrcode')).default;
  let svg: string;
  try {
    svg = await QRCode.toString(url, {
      type: 'svg',
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: BRAND_GREEN, light: '#FFFFFFFF' },
    });
  } catch {
    return null;
  }
  const viewBox = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg);
  if (!viewBox) return svg;
  const w = Number(viewBox[1]);
  const logoSize = w * 0.2;
  const pad = logoSize * 0.16;
  const box = logoSize + pad * 2;
  const xy = (w - box) / 2;
  const overlay =
    `<rect x="${xy}" y="${xy}" width="${box}" height="${box}" fill="#FFFFFF"/>` +
    `<image href="${publicBase()}${LOGO_SRC}" x="${xy + pad}" y="${xy + pad}" width="${logoSize}" height="${logoSize}"/>`;
  return svg.replace('</svg>', `${overlay}</svg>`);
}

/** Save a data URL or text as a file. */
export function downloadFile(name: string, content: string | Blob, type = 'application/octet-stream') {
  const href =
    typeof content === 'string' && content.startsWith('data:')
      ? content
      : URL.createObjectURL(typeof content === 'string' ? new Blob([content], { type }) : content);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (!href.startsWith('data:')) setTimeout(() => URL.revokeObjectURL(href), 1000);
}
