'use client';

// "Have a code?" — redeem a campaign code into the credit wallet. Codes are
// not case-sensitive. Redemption happens only on the button press, never on
// load (link previews and QR scanners fetch URLs and would use up single-use
// codes); the /redeem/<code> page follows the same rule.

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { invalidateCredits } from '@/lib/credits/useCredits';

export default function RedeemCodeBox({ initialCode = '', onRedeemed }: { initialCode?: string; onRedeemed?: () => void }) {
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const redeem = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/credits/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: 'error', text: json?.error ?? 'That code could not be redeemed.' });
        return;
      }
      setMessage({
        tone: 'ok',
        text: `TT$${Number(json.amount_ttd ?? 0).toFixed(2)} added to your credits${json.campaign ? ` (${json.campaign})` : ''}.`,
      });
      setCode('');
      invalidateCredits();
      onRedeemed?.();
    } catch {
      setMessage({ tone: 'error', text: 'Could not reach iTutor. Check your connection.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void redeem();
          }}
          placeholder="Enter code"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={32}
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold uppercase tracking-wider text-ink placeholder:font-normal placeholder:normal-case placeholder:tracking-normal"
        />
        <button
          type="button"
          onClick={() => void redeem()}
          disabled={busy || !code.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep transition disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null} Redeem
        </button>
      </div>
      {message ? (
        <p className={message.tone === 'ok' ? 'inline-flex items-center gap-1.5 text-sm text-brand-deep' : 'text-sm text-red-600'}>
          {message.tone === 'ok' ? <CheckCircle2 className="size-4" /> : null}
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
