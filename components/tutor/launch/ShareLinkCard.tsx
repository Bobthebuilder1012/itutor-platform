'use client';

/**
 * "Copy class link."
 *
 * The URL is never built here. The API returns it absolute, for two reasons:
 * the production host is fixed (these links are pasted into WhatsApp and
 * forwarded for months, so a preview host would bake a dead domain into
 * somebody's group chat), and QrCodePanel already hardcodes that host in a
 * second place — a third copy in a component is how they eventually disagree.
 *
 * This is the action most likely to actually move a teacher's number. Most of
 * these students will arrive through a WhatsApp group, not an addressed email,
 * which is why a link arrival writes a real attributed row rather than being
 * treated as anonymous traffic.
 */

import { useState } from 'react';
import { Copy, Check, Share2, Link2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ShareLinkCard({
  classes,
  disabled,
}: {
  classes: Array<{ groupId: string; name: string }>;
  disabled?: boolean;
}) {
  const [groupId, setGroupId] = useState(classes[0]?.groupId ?? '');
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mint = async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setUrl(null);
    try {
      const res = await fetch('/api/tutor/invites/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: id }),
      });
      const body = await res.json();
      if (!res.ok || !body?.success) {
        setError(body?.error ?? 'Could not make a link for that class.');
        return;
      }
      setUrl(body.data.url as string);
    } catch {
      setError('Could not make a link. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      // The 1500ms flip used everywhere else in the tutor area.
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy. Select the link and copy it manually.');
    }
  };

  const share = async () => {
    if (!url || typeof navigator.share !== 'function') return;
    try {
      await navigator.share({ title: 'Join my class on iTutor', url });
    } catch {
      /* the user dismissed the sheet; not an error */
    }
  };

  if (classes.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Link2 className="size-4" /> Share a class link
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Create a class first, and you&apos;ll get a link you can paste anywhere.
        </p>
        <a
          href="/tutor/classes"
          className="mt-3 inline-flex text-sm font-semibold text-brand-deep hover:underline"
        >
          Go to My Classes →
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Link2 className="size-4" /> Share a class link
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Anyone who signs up through this link counts toward your 5.
      </p>

      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <select
          value={groupId}
          onChange={(e) => {
            setGroupId(e.target.value);
            setUrl(null);
          }}
          aria-label="Class"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
        >
          {classes.map((c) => (
            <option key={c.groupId} value={c.groupId}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => void mint(groupId)}
          disabled={disabled || loading || !groupId}
          className="shrink-0 rounded-lg bg-ink text-white px-4 py-2 text-sm font-semibold hover:bg-ink/90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="size-4 animate-spin" />}
          {url ? 'Refresh link' : 'Get link'}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

      {url && (
        <div className="mt-3 flex items-center gap-2">
          {/* min-w-0 is load-bearing: without it a long unbreakable URL forces
              the row wider than its container instead of truncating. */}
          <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs text-ink">
            {url}
          </code>
          <button
            onClick={copy}
            aria-label="Copy link"
            className={cn(
              'shrink-0 size-9 grid place-items-center rounded-lg border border-border hover:bg-muted',
              copied && 'text-green-600'
            )}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </button>
          {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
            <button
              onClick={share}
              aria-label="Share link"
              className="shrink-0 size-9 grid place-items-center rounded-lg border border-border hover:bg-muted"
            >
              <Share2 className="size-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
