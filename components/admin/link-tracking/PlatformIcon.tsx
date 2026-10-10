/**
 * Platform badge for /admin/link-tracking. The glyphs are the ones the landing
 * footer already uses (components/landing/Footer.tsx); the badge colour is the
 * platform's, and is the only place on the page a brand colour appears — the
 * numbers stay in text colours so nothing reads as "good" or "bad" by hue.
 */

const BADGE: Record<string, string> = {
  instagram: 'bg-gradient-to-br from-amber-400 via-pink-500 to-purple-600',
  tiktok: 'bg-black',
  facebook: 'bg-blue-600',
};

function Glyph({ platform }: { platform: string }) {
  if (platform === 'instagram') {
    return (
      <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
      </svg>
    );
  }
  if (platform === 'tiktok') {
    return (
      <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]" fill="currentColor" aria-hidden>
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.42a8.16 8.16 0 0 0 4.77 1.52V6.49a4.85 4.85 0 0 1-1.84.2Z" />
      </svg>
    );
  }
  if (platform === 'facebook') {
    return (
      <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]" fill="currentColor" aria-hidden>
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export default function PlatformIcon({ platform, size = 'md' }: { platform: string; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-7 w-7 rounded-lg' : 'h-10 w-10 rounded-xl';
  return (
    <span className={`inline-flex shrink-0 items-center justify-center text-white ${box} ${BADGE[platform] ?? 'bg-gray-500'}`}>
      <Glyph platform={platform} />
    </span>
  );
}
