'use client';

// Parent-facing tutor profile — kit ParentPhase1 `TutorProfile`.
//
// WHY THIS IS NOT A LINK TO THE EXISTING PROFILE
// /tutors/[tutorId] redirects a parent to /student/tutors/[tutorId] — a student
// surface, inside the student shell, with student CTAs ("book this tutor for
// yourself"). A parent landing there loses their own navigation and is offered an
// action that does not apply to them.
//
// WHAT A PARENT IS ACTUALLY HERE FOR
// They are deciding whether to approve a booking, and half of that decision is
// "do I trust this person with my child". So the page leads with the one trust
// attribute the product actually holds — verification (decision 31) — and says
// plainly when it is absent, rather than leaving a blank space that reads as
// approval. No background-check or safeguarding badges: those are deferred, and
// implying vetting the platform has not done would be worse than showing nothing.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, MessageSquare, ShieldAlert, ShieldCheck, Star } from 'lucide-react';
import ParentShell from '@/components/parent/ParentShell';

type Tutor = {
  id: string;
  name: string;
  avatar: string | null;
  verified: boolean;
  rating: number | null;
  bio: string | null;
  teaches: string[];
  via: string;
};

export default function ParentTutorProfilePage() {
  return (
    <ParentShell>
      <TutorProfileContent />
    </ParentShell>
  );
}

function TutorProfileContent() {
  const { tutorId } = useParams<{ tutorId: string }>();
  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/parent/tutors', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          setTutor((json.tutors ?? []).find((t: Tutor) => t.id === tutorId) ?? null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [tutorId]);

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  // Not found means "not a tutor of your children" as often as it means
  // "no such tutor", and the honest phrasing covers both without confirming
  // whether an account exists.
  if (!tutor) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <BackLink />
        <div className="rounded-2xl border border-border bg-background p-6">
          <p className="text-sm text-ink">This tutor doesn&rsquo;t teach any of your children.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You can see the profile of any tutor once one of your children books with them.
          </p>
        </div>
      </div>
    );
  }

  const first = tutor.name.split(' ')[0];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <BackLink />

      <section className="rounded-2xl border border-border bg-background p-5">
        <div className="flex flex-wrap items-start gap-4">
          {tutor.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tutor.avatar} alt="" className="size-16 shrink-0 rounded-2xl object-cover" />
          ) : (
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-brand-soft text-xl font-bold text-brand-deep">
              {tutor.name.charAt(0).toUpperCase()}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-ink">{tutor.name}</h1>
              {tutor.verified && <ShieldCheck className="size-5 text-brand" />}
            </div>

            {tutor.rating != null && (
              <div className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Star className="size-3.5 fill-amber-400 text-amber-400" />
                <span className="font-semibold text-ink">{Number(tutor.rating).toFixed(1)}</span>
              </div>
            )}

            <p className="mt-1 text-sm text-muted-foreground">
              {tutor.teaches.length > 0
                ? `Teaches ${tutor.teaches.join(', ')} · ${tutor.via}`
                : tutor.via}
            </p>
          </div>

          <Link
            href="/parent/messages"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep"
          >
            <MessageSquare className="size-4" />
            Message {first}
          </Link>
        </div>

        {/* Decision 31: the only trust attribute the product holds, stated either
            way. An absent badge with no explanation reads as approval. */}
        <div
          className={`mt-4 flex items-start gap-2 rounded-xl border px-3.5 py-3 ${
            tutor.verified
              ? 'border-brand/30 bg-brand/5'
              : 'border-amber-300 bg-amber-50'
          }`}
        >
          {tutor.verified ? (
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />
          ) : (
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
          )}
          <p className="text-xs leading-relaxed text-ink/80">
            {tutor.verified ? (
              <>
                <strong>Verified iTutor.</strong> Their identity has been confirmed by our review
                team. That is the only check iTutor performs — we do not run background checks or
                safeguarding training.
              </>
            ) : (
              <>
                <strong>Not yet verified.</strong> This tutor&rsquo;s identity has not been confirmed
                by our review team. They can still teach on iTutor, so this is worth knowing before
                you approve a booking.
              </>
            )}
          </p>
        </div>
      </section>

      {tutor.bio && (
        <section className="rounded-2xl border border-border bg-background p-5">
          <h2 className="text-sm font-bold text-ink">About {first}</h2>
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {tutor.bio}
          </p>
        </section>
      )}

      {/* Nothing is invented to fill the page. The kit shows availability and
          reviews; neither is exposed to parents by an existing API, and a made-up
          block would be worse than an absent one on the screen a parent uses to
          decide whether to trust someone. */}
      <p className="text-xs text-muted-foreground">
        Availability and reviews are shown on the class listing when you book.
      </p>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/parent/approvals"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink"
    >
      <ArrowLeft className="size-4" /> Back to approvals
    </Link>
  );
}
