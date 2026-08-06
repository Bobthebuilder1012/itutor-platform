// Client-side banner rasterizer for the Class Banner Builder.
//
// One master canvas (1600x400, 4:1) is composed here and used BOTH for the live
// preview and the exported JPEG (WYSIWYG). The app renders live "Layer 2" chrome
// (class name, price, rating, Join button) over the banner at display time, so
// this layer bakes only: a colour wash (solid/gradient), an optional right-side
// photo, and at most one short "atmosphere" line. It deliberately does NOT bake
// the class name (that would go stale on rename and duplicate Layer 2) — see the
// handover contradiction note in the builder.

export const BANNER_W = 1600;
export const BANNER_H = 400;
export const BANNER_MIN_W = 1600;
export const BANNER_MIN_H = 400;
export const BANNER_MAX_BYTES = 10 * 1024 * 1024; // 10MB
export const BANNER_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];

export type WashKey = 'mint' | 'peach' | 'lavender' | 'sky' | 'coral' | 'neutral';

export const WASHES: { key: WashKey; label: string; base: string; accent: string }[] = [
  { key: 'mint', label: 'Mint', base: '#eafaf1', accent: '#199356' },
  { key: 'peach', label: 'Peach', base: '#ffeede', accent: '#e08a45' },
  { key: 'lavender', label: 'Lavender', base: '#efe9fb', accent: '#7c5cbf' },
  { key: 'sky', label: 'Sky', base: '#e6f1fb', accent: '#3b82c4' },
  { key: 'coral', label: 'Coral', base: '#ffe9e6', accent: '#e5644e' },
  { key: 'neutral', label: 'Neutral', base: '#f4f4f3', accent: '#6b7280' },
];

export function washByKey(key: WashKey) {
  return WASHES.find((w) => w.key === key) ?? WASHES[0];
}

// Stable pick so classes don't all default to the same wash.
export function washForId(id: string): WashKey {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return WASHES[h % WASHES.length].key;
}

export type BannerTemplate = 'solid' | 'gradient' | 'upload';
type Drawable = ImageBitmap | HTMLImageElement;

export interface BannerRenderOpts {
  template: BannerTemplate;
  wash: WashKey;
  photo?: Drawable | null;
  photoScale?: number;   // 1 = cover fit
  photoOffsetX?: number; // -1..1 fraction of slot
  photoOffsetY?: number;
  atmosphere?: string;
  upload?: Drawable | null;
  uploadScale?: number;
  uploadOffsetX?: number;
  uploadOffsetY?: number;
  showGuides?: boolean;  // safe-zone overlay — PREVIEW ONLY, never export
}

export async function ensureBannerFonts(): Promise<void> {
  try {
    const f = (document as any)?.fonts;
    if (!f?.load) return;
    await Promise.all([
      f.load('800 92px "Space Grotesk"'),
      f.load('600 40px "Inter"'),
    ]);
    await f.ready;
  } catch {
    /* fall back to system fonts */
  }
}

// Fetch → Blob → ImageBitmap avoids canvas taint on cross-origin public URLs.
export async function loadBitmap(src: string | Blob): Promise<ImageBitmap> {
  let blob: Blob;
  if (typeof src === 'string') {
    const res = await fetch(src, { mode: 'cors', cache: 'no-store' });
    if (!res.ok) throw new Error('Image fetch failed');
    blob = await res.blob();
  } else {
    blob = src;
  }
  return createImageBitmap(blob);
}

export function renderBanner(canvas: HTMLCanvasElement, opts: BannerRenderOpts): void {
  canvas.width = BANNER_W;
  canvas.height = BANNER_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, BANNER_W, BANNER_H);

  if (opts.template === 'upload') {
    if (opts.upload) {
      drawCover(ctx, opts.upload, 0, 0, BANNER_W, BANNER_H, opts.uploadScale ?? 1, opts.uploadOffsetX ?? 0, opts.uploadOffsetY ?? 0);
    } else {
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(0, 0, BANNER_W, BANNER_H);
    }
    if (opts.showGuides) drawGuides(ctx);
    return;
  }

  const wash = washByKey(opts.wash);

  // Background wash
  if (opts.template === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, BANNER_W, 0);
    g.addColorStop(0, mix(wash.accent, '#ffffff', 0.78));
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = wash.base;
  }
  ctx.fillRect(0, 0, BANNER_W, BANNER_H);

  // Subtle accent glow
  const rg = ctx.createRadialGradient(BANNER_W * 0.5, BANNER_H * 0.05, 40, BANNER_W * 0.5, BANNER_H * 0.05, BANNER_W * 0.55);
  rg.addColorStop(0, hexA(wash.accent, 0.1));
  rg.addColorStop(1, hexA(wash.accent, 0));
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, BANNER_W, BANNER_H);

  // Right-side photo slot with a left-edge fade into the wash
  if (opts.photo) {
    const slotW = Math.round(BANNER_W * 0.4);
    const slotX = BANNER_W - slotW;
    drawCover(ctx, opts.photo, slotX, 0, slotW, BANNER_H, opts.photoScale ?? 1, opts.photoOffsetX ?? 0, opts.photoOffsetY ?? 0);
    const fadeW = Math.round(slotW * 0.5);
    const bg = opts.template === 'gradient' ? '#ffffff' : wash.base;
    const fg = ctx.createLinearGradient(slotX, 0, slotX + fadeW, 0);
    fg.addColorStop(0, hexA(bg, 1));
    fg.addColorStop(1, hexA(bg, 0));
    ctx.fillStyle = fg;
    ctx.fillRect(slotX, 0, fadeW, BANNER_H);
  }

  // Optional atmosphere line — centred in the band between the top-left icon
  // tile and the right-side photo. The student marketplace card no longer
  // overlays a class-icon there, but the parent and enrolled-class views still
  // do, so the gutter stays. Vertically centred, clear of the bottom-left title
  // chrome zone.
  const atmo = (opts.atmosphere ?? '').trim();
  if (atmo) {
    ctx.save();
    ctx.font = '600 40px "Inter", system-ui, sans-serif';
    ctx.fillStyle = mix(wash.accent, '#0b1b12', 0.2);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const leftGutter = 240;                                        // clears the icon tile
    const rightBound = opts.photo ? BANNER_W * 0.58 : BANNER_W * 0.64;
    const maxW = rightBound - leftGutter;
    const cx = (leftGutter + rightBound) / 2;
    ctx.fillText(ellipsize(ctx, atmo, maxW), cx, BANNER_H * 0.5, maxW);
    ctx.restore();
  }

  if (opts.showGuides) drawGuides(ctx);
}

function drawGuides(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(220,38,38,0.75)';
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 3;
  // Bottom-left title chrome zone (left 40% × bottom 45%)
  ctx.strokeRect(2, BANNER_H * 0.55, BANNER_W * 0.4, BANNER_H * 0.45 - 2);
  // Top-right badge/rating zone (right 20% × top 30%)
  ctx.strokeRect(BANNER_W * 0.8, 2, BANNER_W * 0.2 - 2, BANNER_H * 0.3);
  ctx.restore();
}

export function bannerToBlob(canvas: HTMLCanvasElement, quality = 0.86): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/jpeg', quality);
  });
}

/* ── helpers ── */

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: Drawable,
  dx: number, dy: number, dw: number, dh: number,
  scale = 1, offX = 0, offY = 0,
): void {
  const iw = (img as any).width;
  const ih = (img as any).height;
  if (!iw || !ih) return;
  const s = Math.max(dw / iw, dh / ih) * Math.max(0.2, scale);
  const rw = iw * s;
  const rh = ih * s;
  const x = dx + (dw - rw) / 2 + offX * (dw / 2);
  const y = dy + (dh - rh) / 2 + offY * (dh / 2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();
  ctx.drawImage(img as any, x, y, rw, rh);
  ctx.restore();
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trim()}…`;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function hexA(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
