'use client';

// The referral share card: the personal link, copy, WhatsApp, the phone's
// share sheet, Instagram and a QR code for sharing in person.
//
// Instagram has no web link for a pre-filled share, so its button opens the
// native share sheet on a phone (where Instagram is one of the targets) and
// otherwise copies the link with a "paste it into Instagram" hint.

import { useEffect, useState } from 'react';
import { Check, Copy, MessageCircle, QrCode, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { downloadFile, renderBrandedQr } from '@/lib/qr/brandedQr';

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

export default function ShareCard({ link, compact = false }: { link: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
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
      setTimeout(() => setCopied(false), 1800);
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

  const button =
    'inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-ink hover:bg-muted transition';

  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink" title={link}>
          {link.replace(/^https?:\/\//, '')}
        </span>
        <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-deep transition">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4')}>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={button}>
          <MessageCircle className="size-4 text-green-600" /> WhatsApp
        </a>
        {canShare ? (
          <button type="button" onClick={() => void nativeShare()} className={button}>
            <Share2 className="size-4" /> Share
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => (canShare ? void nativeShare() : void copy('Link copied. Paste it into your Instagram story, bio or a DM.'))}
          className={button}
        >
          <InstagramGlyph className="size-4 text-pink-600" /> Instagram
        </button>
        {!compact ? (
          <button type="button" onClick={() => setShowQr((v) => !v)} className={button}>
            <QrCode className="size-4" /> {showQr ? 'Hide QR' : 'QR code'}
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
            <button type="button" onClick={() => downloadFile('itutor-referral-qr.png', qr)} className="text-xs font-semibold text-brand underline">
              Download
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
