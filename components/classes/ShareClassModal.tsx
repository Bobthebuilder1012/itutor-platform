'use client';

// The share sheet behind "Invite student".
//
// It carries its own modal shell rather than importing the one from
// ClassDetailView: that module is 1500 lines of student-facing class detail,
// and pulling it into the tutor bundle for twenty lines of backdrop is a poor
// trade. The shell below matches it closely, with one necessary difference
// noted where it is defined.

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Link2, Lock, Mail, MessageSquare, Share2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  classInviteMessage,
  classInviteSubject,
  classShareUrl,
  type ShareClassInput,
} from '@/lib/classes/shareClass';
import { trackClient } from '@/lib/analytics/client';
import { PRODUCT_EVENTS, type ShareChannel } from '@/lib/analytics/events';

/* ─── Brand glyphs ───────────────────────────────────────
   lucide dropped its brand icons, so these are inline. Single-path marks,
   currentColor, sized by the parent. */

type GlyphProps = { className?: string };

const WhatsAppGlyph = ({ className }: GlyphProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
  </svg>
);

const FacebookGlyph = ({ className }: GlyphProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const XGlyph = ({ className }: GlyphProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
  </svg>
);

const TelegramGlyph = ({ className }: GlyphProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.015 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

/* ─── Modal shell ────────────────────────────────────────
   Mirrors components/classes/ClassDetailView.tsx — escape to close, scroll
   lock, bottom sheet on mobile and a centred card from sm up.

   It portals to document.body, which the original does not need to. This one
   is mounted inside a class card that lifts on hover, and a `transform` on an
   ancestor becomes the containing block for `position: fixed` descendants —
   so the sheet anchored itself to the card instead of the viewport. That also
   fed back on itself: re-anchoring moved the sheet out from under the cursor,
   which dropped the hover, which re-centred it under the cursor again, at
   screen-refresh speed. Escaping the card entirely is the fix. */

function Shell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  // document does not exist during the server render, so the portal can only
  // be opened once mounted on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Invite students to this class"
        className="relative w-full max-h-[92vh] overflow-y-auto rounded-t-3xl border border-border bg-background p-5 shadow-2xl sm:max-w-md sm:rounded-3xl"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ─── Share sheet ────────────────────────────────────────── */

type Target = {
  channel: ShareChannel;
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Brand tint for the glyph. */
  tint: string;
};

export default function ShareClassModal({
  classInfo,
  isPrivate = false,
  onMakePublic,
  onClose,
}: {
  classInfo: ShareClassInput;
  /** A private class 404s for anyone not already on the roster. */
  isPrivate?: boolean;
  onMakePublic?: () => void;
  onClose: () => void;
}) {
  const url = useMemo(() => classShareUrl(classInfo.id), [classInfo.id]);
  const [message, setMessage] = useState(() => classInviteMessage(classInfo));
  const [copied, setCopied] = useState<'link' | 'invite' | null>(null);
  const [canNativeShare, setCanNativeShare] = useState(false);

  // navigator.share is absent on desktop and on insecure origins, so the tile
  // is decided after mount rather than during render — otherwise the server
  // markup and the client markup disagree and React reports a mismatch.
  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const track = (channel: ShareChannel) =>
    trackClient(PRODUCT_EVENTS.CLASS_SHARED, { group_id: classInfo.id, channel });

  const copy = async (value: string, which: 'link' | 'invite') => {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
      track(which === 'link' ? 'copy_link' : 'copy_invite');
    } catch {
      // Clipboard access can be blocked outright. The textarea is selectable,
      // so there is still a way through — no need to raise an error.
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: classInfo.title, text: message, url });
      track('native');
    } catch {
      // Includes AbortError when the sheet is dismissed. Not a failure.
    }
  };

  const text = encodeURIComponent(message);
  const encodedUrl = encodeURIComponent(url);

  const targets: Target[] = [
    {
      channel: 'whatsapp', label: 'WhatsApp',
      href: `https://wa.me/?text=${text}`,
      icon: <WhatsAppGlyph className="size-5" />, tint: 'text-[#25D366]',
    },
    {
      // Facebook's sharer takes a URL and nothing else — it drops prefilled
      // text by policy. What lands there is the Open Graph unfurl.
      channel: 'facebook', label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      icon: <FacebookGlyph className="size-5" />, tint: 'text-[#1877F2]',
    },
    {
      channel: 'x', label: 'X',
      href: `https://twitter.com/intent/tweet?text=${text}`,
      icon: <XGlyph className="size-4" />, tint: 'text-ink',
    },
    {
      channel: 'telegram', label: 'Telegram',
      href: `https://t.me/share/url?url=${encodedUrl}&text=${text}`,
      icon: <TelegramGlyph className="size-5" />, tint: 'text-[#26A5E4]',
    },
    {
      channel: 'sms', label: 'Messages',
      href: `sms:?&body=${text}`,
      icon: <MessageSquare className="size-5" />, tint: 'text-emerald-600',
    },
    {
      channel: 'email', label: 'Email',
      href: `mailto:?subject=${encodeURIComponent(classInviteSubject(classInfo))}&body=${text}`,
      icon: <Mail className="size-5" />, tint: 'text-amber-600',
    },
  ];

  const tile =
    'flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-2 py-3 ' +
    'text-[11px] font-semibold text-ink hover:border-brand hover:bg-brand/5 transition';

  return (
    <Shell onClose={onClose}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-ink leading-tight">Invite students</h2>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">{classInfo.title}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 inline-flex items-center justify-center size-8 rounded-lg border border-border bg-background text-muted-foreground hover:text-ink hover:border-ink transition"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* A private class's link is dead on arrival — the API 404s it for anyone
          who is not already a member. Say so before it goes out. */}
      {isPrivate && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <Lock className="size-4 shrink-0 text-amber-600 mt-0.5" />
            <div className="min-w-0 text-xs text-amber-900">
              <p className="font-semibold">This class is private</p>
              <p className="mt-0.5 text-amber-800">
                Anyone you send this link to will see a &ldquo;not found&rdquo; page until the class is public.
              </p>
              {onMakePublic && (
                <button
                  onClick={onMakePublic}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700 transition"
                >
                  Make it public
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* The invitation, editable before it goes out. */}
      <label
        htmlFor="invite-message"
        className="mt-4 block text-[10px] uppercase tracking-wider font-bold text-muted-foreground"
      >
        Your invitation
      </label>
      <textarea
        id="invite-message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={7}
        className="mt-1.5 w-full resize-none rounded-xl border border-border bg-card p-3 text-xs leading-relaxed text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand/30"
      />
      <div className="mt-1.5 flex justify-end">
        <button
          onClick={() => copy(message, 'invite')}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-ink transition"
        >
          {copied === 'invite' ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied === 'invite' ? 'Copied' : 'Copy invitation'}
        </button>
      </div>

      {/* Targets */}
      <div className="mt-4 grid grid-cols-4 gap-2">
        {targets.map((t) => (
          <a
            key={t.channel}
            href={t.href}
            target={t.href.startsWith('http') ? '_blank' : undefined}
            rel={t.href.startsWith('http') ? 'noopener noreferrer' : undefined}
            onClick={() => track(t.channel)}
            className={tile}
          >
            <span className={t.tint}>{t.icon}</span>
            {t.label}
          </a>
        ))}

        {/* The real route to Instagram, TikTok and Snapchat: neither offers a
            web share intent that accepts a link, but both appear as targets in
            the operating system's own share sheet. */}
        {canNativeShare && (
          <button onClick={nativeShare} className={tile}>
            <span className="text-brand"><Share2 className="size-5" /></span>
            More
          </button>
        )}
      </div>

      {/* Raw link */}
      <div className="mt-4 rounded-xl border border-border bg-card p-3">
        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Class link</div>
        <div className="mt-1.5 flex items-center gap-2">
          <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate font-mono text-xs text-muted-foreground">{url}</span>
          <button
            onClick={() => copy(url, 'link')}
            className={cn(
              'shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition',
              copied === 'link' ? 'bg-brand/10 text-brand' : 'bg-ink text-white hover:bg-ink/90',
            )}
          >
            {copied === 'link' ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied === 'link' ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </Shell>
  );
}
