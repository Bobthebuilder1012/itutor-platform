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
import BlurredBannerBackdrop from '@/components/tutor/BlurredBannerBackdrop';

type Tutor = {
  id: string;
  name: string;
  avatar: string | null;
  /** The teacher's uploaded banner, blurred behind the header. */
  banner: string | null;
  /** `profiles.updated_at`, to cache-bust a re-uploaded banner. */
  bannerVersion: string | null;
  verified: boolean;
  rating: number | null;
  bio: string | null;
  teaches: string[];
  via: string;
};

type Extra = {
  availability: Array<{ day: string; windows: string[] }>;
  reviews: Array<{ id: string; stars: number; comment: string | null; who: string; when: string }>;
  averageRating: number | null;
  ratingCount: number;
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
  const [extra, setExtra] = useState<Extra | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // In parallel: the identity block gates the page, the availability and
        // reviews only fill it, so one slow query should not delay the other.
        const [listRes, detailRes] = await Promise.all([
          fetch('/api/parent/tutors', { cache: 'no-store' }),
          fetch(`/api/parent/tutors/${tutorId}`, { cache: 'no-store' }),
        ]);
        if (listRes.ok) {
          const json = await listRes.json();
          setTutor((json.tutors ?? []).find((t: Tutor) => t.id === tutorId) ?? null);
        }
        if (detailRes.ok) setExtra(await detailRes.json());
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

      <section className="overflow-hidden rounded-2xl border border-border bg-background">
        {/* The same blurred banner a student sees. A parent deciding whether to
            approve a booking is looking at the same person, and the two profiles
            reading as two different products does not help them. */}
        <BlurredBannerBackdrop
          bannerUrl={tutor.banner}
          version={tutor.bannerVersion}
          className="h-24 sm:h-28"
        />
        <div className="p-5">
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

      {/* Availability — the weekly pattern, not bookable slots. A parent is
          judging "does this fit our week", not picking a time. */}
      {extra?.availability && extra.availability.length > 0 && (
        <section className="rounded-2xl border border-border bg-background p-5">
          <h2 className="text-sm font-bold text-ink">Availability</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {extra.availability.map((a) => (
              <div key={a.day} className="rounded-xl bg-muted/40 px-3 py-2">
                <div className="text-xs font-semibold text-muted-foreground">{a.day}</div>
                <div className="text-sm text-ink">{a.windows.join(', ')}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            The tutor&rsquo;s usual teaching hours. Actual class times are set per class.
          </p>
        </section>
      )}

      {/* Reviews from students who were taught. Only ones with something
          written — a wall of bare stars tells a parent nothing. */}
      {extra?.reviews && extra.reviews.length > 0 && (
        <section className="rounded-2xl border border-border bg-background p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">Reviews</h2>
            {extra.averageRating != null && (
              <span className="text-xs text-muted-foreground">
                <strong className="text-ink">{extra.averageRating.toFixed(1)}</strong> from{' '}
                {extra.ratingCount} {extra.ratingCount === 1 ? 'review' : 'reviews'}
              </span>
            )}
          </div>
          <ul className="mt-2 space-y-3">
            {extra.reviews.map((r) => (
              <li key={r.id} className="border-t border-border pt-3 first:border-0 first:pt-0">
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      className={`size-3 ${i < r.stars ? 'fill-amber-400 text-amber-400' : 'text-border'}`}
                    />
                  ))}
                </div>
                {r.comment && (
                  <p className="mt-1 text-sm leading-relaxed text-ink/80">“{r.comment}”</p>
                )}
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {r.who} · {r.when}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Said rather than left blank: an empty page under a tutor's name reads
          as a bad sign when it usually means a new tutor. */}
      {extra && extra.availability.length === 0 && extra.reviews.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {first} hasn&rsquo;t published teaching hours yet, and no student has left a written
          review. Neither means anything is wrong — both are common for a newer tutor.
        </p>
      )}
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
