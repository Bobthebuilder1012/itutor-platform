'use client';

// /i/<token> — the invitation itself.
//
// A page rather than a bare redirect, because the invitation has something to
// say before it asks for anything: who invited you, and to what. That is the
// whole difference between this and the plain class link the share sheet used
// to send, which arrived anonymous and asked a stranger to sign up for a class
// they had no reason to trust.
//
// The token survives signup in the URL, not a cookie: the CTA sends a
// signed-out visitor to /signup?redirect=/i/<token>, and both the password path
// (SignupCard -> safeRedirectOr) and Google OAuth (auth/callback finalDest,
// which re-appends redirect across the role step) bring them back here. That
// round trip is what makes the invitation survive a social signup.

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Check, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useProfile } from '@/lib/hooks/useProfile';
import { formatLevel } from '@/lib/utils/formatLevel';

type Invite = {
  token: string;
  status: 'ok' | 'expired' | 'revoked' | 'full';
  groupId: string;
  className: string;
  subject: string | null;
  level: string | null;
  coverImage: string | null;
  priced: boolean;
  inviterName: string;
  inviterAvatar: string | null;
  tutorName: string;
};

const DEAD: Record<string, string> = {
  expired: 'This invitation has expired.',
  revoked: 'This invitation is no longer active.',
  full: 'This invitation has already been used.',
};

export default function ClassInvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = String(params?.token ?? '');
  const { profile, loading: profileLoading } = useProfile();

  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invites/class/${encodeURIComponent(token)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('not_found');
        const json = await res.json();
        if (!cancelled) setInvite(json.invite as Invite);
      } catch {
        if (!cancelled) setInvite(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const accept = async () => {
    if (accepting) return;
    setAccepting(true);
    setError('');
    try {
      const res = await fetch(`/api/invites/class/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: new URLSearchParams(window.location.search).get('s') }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 409 && json?.error === 'student_account_required') {
        setError('This invitation is for a student account. Sign in as a student to join the class.');
        return;
      }
      if (!res.ok) {
        setError('That did not work. The invitation may have expired.');
        return;
      }
      router.push(json.landing as string);
    } catch {
      setError('That did not work. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  // A signed-out visitor keeps the token in the return path, so the invitation
  // is still theirs after signup.
  const signupHref = `/signup?redirect=${encodeURIComponent(`/i/${token}`)}`;
  const loginHref = `/login?redirect=${encodeURIComponent(`/i/${token}`)}`;

  if (loading || profileLoading) {
    return (
      <Shell>
        <div className="flex justify-center py-10">
          <Loader2 className="size-6 animate-spin text-brand" />
        </div>
      </Shell>
    );
  }

  if (!invite) {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-ink">This invitation could not be found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be mistyped, or the class may no longer be open.
        </p>
        <Link href="/search" className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 transition">
          Browse classes <ArrowRight className="size-4" />
        </Link>
      </Shell>
    );
  }

  const dead = invite.status !== 'ok';
  const isStudent = profile?.role === 'student';

  return (
    <Shell>
      {/* Who invited you */}
      <div className="flex items-center gap-3">
        {invite.inviterAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={invite.inviterAvatar} alt="" className="size-11 rounded-full object-cover" />
        ) : (
          <div className="size-11 rounded-full bg-brand/10 grid place-items-center text-brand font-bold">
            {invite.inviterName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-ink">{invite.inviterName}</span> invited you to
          </p>
          <h1 className="text-lg font-bold text-ink leading-tight truncate">{invite.className}</h1>
        </div>
      </div>

      {/* Which class is ready */}
      <div className="mt-4 rounded-2xl border border-border overflow-hidden">
        <div
          className="h-24 bg-gradient-to-br from-brand to-emerald-400 relative"
          style={invite.coverImage ? {
            backgroundImage: `url(${invite.coverImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          } : undefined}
        >
          {!invite.coverImage && <BookOpen className="absolute bottom-3 left-4 size-6 text-white/85" />}
        </div>
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
            {invite.subject && (
              <span className="text-brand bg-brand/10 px-1.5 py-0.5 rounded">{invite.subject}</span>
            )}
            {invite.level && <span className="text-muted-foreground">{formatLevel(invite.level)}</span>}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Live online classes with <span className="font-semibold text-ink">{invite.tutorName}</span>.
            {invite.priced && ' You can see the price and secure your spot on the class page.'}
          </p>
        </div>
      </div>

      {dead ? (
        <p className="mt-5 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          {DEAD[invite.status] ?? 'This invitation is no longer active.'}{' '}
          <Link href={`/student/explore/${invite.groupId}`} className="font-semibold underline">
            View the class anyway
          </Link>
        </p>
      ) : !profile ? (
        <>
          <Link
            href={signupHref}
            className="mt-5 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand-deep transition"
          >
            Join My Class <ArrowRight className="size-4" />
          </Link>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Already have an account? <Link href={loginHref} className="font-semibold text-ink underline">Log in</Link>
          </p>
        </>
      ) : isStudent ? (
        <>
          <button
            onClick={accept}
            disabled={accepting}
            className="mt-5 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand-deep disabled:opacity-60 transition"
          >
            {accepting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {accepting ? 'Joining…' : 'Join My Class'}
          </button>
          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        </>
      ) : (
        // Reachable because signup still asks for a role, so an invited person
        // can arrive here on a tutor or parent account. Say so plainly.
        <p className="mt-5 rounded-xl bg-muted/60 border border-border p-3 text-sm text-muted-foreground">
          This invitation is for a student account, and you are signed in as a {profile.role}.{' '}
          <Link href={`/student/explore/${invite.groupId}`} className="font-semibold text-ink underline">
            View the class
          </Link>
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-border bg-background p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}
