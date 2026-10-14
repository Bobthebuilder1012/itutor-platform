'use client';

// /redeem/<code> — where a campaign code's link and QR code land.
//
// Shows what the code is worth and a Redeem button. Redemption happens ONLY
// when the button is pressed, never when the page loads: link previews and QR
// scanners fetch URLs, and a page that redeemed on load would use up a
// single-use code before its owner ever saw it.
//
// Signed out: sign in or sign up first, then come straight back here (both
// pages honour ?redirect=). Tutors and admins are told codes are for students
// and parents.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { CheckCircle2, Gift, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { fmtCredits, invalidateCredits } from '@/lib/credits/useCredits';

type Preview = {
  ok: boolean;
  campaign?: string;
  amount_ttd?: number;
  expires_in_days?: number | null;
  state?: string;
  message?: string | null;
  error?: string;
};

export default function RedeemPage() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = decodeURIComponent(rawCode ?? '').toUpperCase();
  const back = `/redeem/${encodeURIComponent(code)}`;

  const [phase, setPhase] = useState<'loading' | 'signed_out' | 'wrong_role' | 'ready' | 'done'>('loading');
  const [role, setRole] = useState<'student' | 'parent' | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ amount: number; campaign: string; expires: number | null } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPhase('signed_out');
        return;
      }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (profile?.role !== 'student' && profile?.role !== 'parent') {
        setPhase('wrong_role');
        return;
      }
      setRole(profile.role);
      const res = await fetch(`/api/credits/redeem?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
      const json = (await res.json().catch(() => ({ ok: false }))) as Preview;
      setPreview(json);
      setPhase('ready');
    })();
  }, [code]);

  const redeem = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/credits/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? 'That code could not be redeemed.');
        return;
      }
      invalidateCredits();
      setResult({ amount: Number(json.amount_ttd), campaign: json.campaign, expires: json.expires_in_days ?? null });
      setPhase('done');
    } catch {
      setError('Could not reach iTutor. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const rewardsHref = role === 'parent' ? '/parent/rewards' : '/student/rewards';

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" className="mx-auto mb-6 block w-fit">
          <Image src="/assets/logo/itutor-mark.png" alt="iTutor" width={44} height={44} />
        </Link>

        <div className="rounded-2xl border border-border bg-background p-6 text-center shadow-sm">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand text-white">
            {phase === 'done' ? <CheckCircle2 className="size-6" /> : <Gift className="size-6" />}
          </div>
          <div className="mt-4 font-mono text-sm font-semibold tracking-widest text-muted-foreground">{code}</div>

          {phase === 'loading' ? (
            <div className="mt-6 flex justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : phase === 'signed_out' ? (
            <>
              <h1 className="mt-2 text-xl font-bold text-ink">You have an iTutor credit code</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign in or create a free account to add it to your credits. You’ll come straight back here.
              </p>
              <div className="mt-6 grid gap-2">
                <Link
                  href={`/signup?redirect=${encodeURIComponent(back)}`}
                  className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep"
                >
                  Create an account
                </Link>
                <Link
                  href={`/login?redirect=${encodeURIComponent(back)}`}
                  className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-ink hover:bg-muted"
                >
                  Sign in
                </Link>
              </div>
            </>
          ) : phase === 'wrong_role' ? (
            <>
              <h1 className="mt-2 text-xl font-bold text-ink">Codes are for students and parents</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                This code can only be redeemed from a student or parent account.
              </p>
            </>
          ) : phase === 'done' && result ? (
            <>
              <h1 className="mt-2 text-xl font-bold text-ink">{fmtCredits(result.amount)} added to your credits</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                From {result.campaign}.
                {result.expires ? ` Use them within ${result.expires} days.` : ''} Spend them on any group class.
              </p>
              <Link
                href={rewardsHref}
                className="mt-6 inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep"
              >
                See my credits
              </Link>
            </>
          ) : preview?.ok ? (
            <>
              <h1 className="mt-2 text-xl font-bold text-ink">{fmtCredits(preview.amount_ttd)} in iTutor credits</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {preview.campaign}
                {preview.expires_in_days ? ` · use within ${preview.expires_in_days} days of redeeming` : ''}
              </p>
              {preview.state === 'redeemable' ? (
                <button
                  type="button"
                  onClick={() => void redeem()}
                  disabled={busy}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-60"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null} Redeem
                </button>
              ) : (
                <p className="mt-6 rounded-xl bg-muted px-4 py-3 text-sm text-ink">{preview.message}</p>
              )}
              {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            </>
          ) : (
            <>
              <h1 className="mt-2 text-xl font-bold text-ink">This code can’t be used</h1>
              <p className="mt-2 text-sm text-muted-foreground">{preview?.error ?? 'We couldn’t find that code.'}</p>
              <Link href={rewardsHref} className="mt-6 inline-block text-sm font-semibold text-brand">
                Go to my credits
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
