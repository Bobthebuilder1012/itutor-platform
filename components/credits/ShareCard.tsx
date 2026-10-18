'use client';

// The referral share card: the personal link, copy, WhatsApp, the phone's
// share sheet, Instagram and a QR code for sharing in person.
//
// Instagram has no web link for a pre-filled share, so its button opens the
// native share sheet on a phone (where Instagram is one of the targets) and
// otherwise copies the link with a "paste it into Instagram" hint.
//
// Copy → Copied is a morph, not a swap: both labels sit in the same grid
// cell (so the button never changes width) and cross-fade with a 2px blur,
// which reads as one label turning into the other. A live region says it
// out loud for screen readers.

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, MessageCircle, QrCode, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { downloadFile, renderBrandedQr } from '@/lib/qr/brandedQr';
import { pressable } from '@/components/credits/press';

// lucide-react 1.x dropped brand icons, so Instagram's glyph is drawn here.
function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

const MESSAGE = 'Join me on iTutor — great classes with real tutors. Sign up with my link:';

const morph =
  'col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 transition-[opacity,filter,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-opacity';
const shown = 'opacity-100 blur-0 scale-100';
const hidden = 'opacity-0 blur-[2px] scale-90 motion-reduce:blur-0 motion-reduce:scale-100';

export default function ShareCard({ link, compact = false }: { link: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!showQr || qr) return;
    void renderBrandedQr(link).then(setQr);
  }, [showQr, qr, link]);

  const copy = async (then?: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setHint(then ?? null);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setHint('Copy the link above by hand.');
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: 'iTutor', text: MESSAGE, url: link });
    } catch {
      /* dismissed */
    }
  };

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${MESSAGE} ${link}`)}`;

  const button = cn(
    'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-ink hover:bg-zinc-50',
    pressable
  );

  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-zinc-50 py-1.5 pl-3.5 pr-1.5">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink" title={link}>
          {link.replace(/^https?:\/\//, '')}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={copied ? 'Link copied' : 'Copy link'}
          className={cn('grid h-9 shrink-0 rounded-lg bg-brand-deep px-3.5 text-xs font-semibold text-white hover:bg-brand-dark', pressable)}
        >
          <span aria-hidden className={cn(morph, copied ? hidden : shown)}>
            <Copy className="size-3.5" /> Copy
          </span>
          <span aria-hidden className={cn(morph, copied ? shown : hidden)}>
            <Check className="size-3.5" /> Copied
          </span>
        </button>
      </div>
      <span className="sr-only" aria-live="polite">{copied ? 'Link copied' : ''}</span>

      <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4')}>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={button}>
          <MessageCircle className="size-4 shrink-0 text-green-600" aria-hidden /> WhatsApp
        </a>
        {canShare ? (
          <button type="button" onClick={() => void nativeShare()} className={button}>
            <Share2 className="size-4 shrink-0" aria-hidden /> Share
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => (canShare ? void nativeShare() : void copy('Link copied. Paste it into your Instagram story, bio or a DM.'))}
          className={button}
        >
          <InstagramGlyph className="size-4 shrink-0 text-pink-600" /> Instagram
        </button>
        {!compact ? (
          <button type="button" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr} className={button}>
            <QrCode className="size-4 shrink-0" aria-hidden /> {showQr ? 'Hide QR' : 'QR code'}
          </button>
        ) : null}
      </div>

      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}

      {showQr ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-white p-4">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code for your referral link" className="size-48" />
          ) : (
            <div className="grid size-48 place-items-center text-sm text-muted-foreground">Drawing…</div>
          )}
          <p className="text-xs text-muted-foreground">Let a friend scan this to open your link.</p>
          {qr ? (
            <button
              type="button"
              onClick={() => downloadFile('itutor-referral-qr.png', qr)}
              className={cn('rounded-lg px-2 py-1 text-xs font-semibold text-brand-deep underline', pressable)}
            >
              Download
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
