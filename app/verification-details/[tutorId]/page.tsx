import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { isVerificationV2Enabled } from '@/lib/featureFlags/verificationV2';
import { getServiceClient } from '@/lib/supabase/server';
import type { Db } from '@/lib/verification/setStatus';
import { loadVerificationDetailsPage, PROOF_LINK_SECONDS } from '@/lib/verificationV2/publicDetails';

// Public. Read per request so the signed proof links are always fresh and short-lived.
export const dynamic = 'force-dynamic';
// No title here on purpose: this metadata is sent even when the page answers "not found", and a
// title would then mention verification for a teacher who is not verified.
export const metadata: Metadata = { robots: { index: false, follow: false } };

const UUIDISH = /^[0-9a-zA-Z-]{1,64}$/;

function describe(c: { kind: string; subject: string | null; grade: string | null; examYear: number | null; school: string | null; degree: string | null; field: string | null; graduationYear: number | null }) {
  if (c.kind === 'DEGREE') {
    return `${c.degree ?? ''}${c.field ? `, ${c.field}` : ''}`;
  }
  return `${c.kind} ${c.subject ?? ''}`;
}

function detail(c: { kind: string; grade: string | null; examYear: number | null; school: string | null; graduationYear: number | null }) {
  return c.kind === 'DEGREE'
    ? [c.school, c.graduationYear].filter(Boolean).join(' · ')
    : [c.grade ? `Grade ${c.grade}` : null, c.examYear].filter(Boolean).join(' · ');
}

export default async function VerificationDetailsPage({ params }: { params: { tutorId: string } }) {
  // Anything that is not a verified teacher is a plain 404: the page says nothing about verification.
  if (!isVerificationV2Enabled() || !UUIDISH.test(params.tutorId)) notFound();

  let page;
  try {
    page = await loadVerificationDetailsPage(getServiceClient() as Db, params.tutorId);
  } catch {
    notFound();
  }
  if (!page) notFound();

  const when = page.verifiedAt
    ? new Date(page.verifiedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-ink">
      <header>
        <Link href={`/tutors/${page.tutorId}`} className="text-xs text-muted-foreground hover:text-ink">
          ← Back to profile
        </Link>
        <h1 className="mt-2 text-2xl font-bold lg:text-3xl">Verification details</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {page.name ? `${page.name} is verified by iTutor` : 'This teacher is verified by iTutor'}
          {when ? ` (${when})` : ''}. These are the qualifications our team has approved.
        </p>
      </header>

      {page.credentials.length === 0 ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">No qualifications to show yet.</p>
        </section>
      ) : (
        page.credentials.map((c, i) => (
          <section key={i} className="rounded-2xl border border-border bg-card">
            <header className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">{describe(c)}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{detail(c)}</p>
            </header>
            <div className="p-5">
              {c.proofLink && c.proofType === 'image' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.proofLink} alt={`Proof of ${describe(c)}`} className="max-h-96 w-full rounded-xl border border-border object-contain" />
              )}
              {c.proofLink && c.proofType === 'pdf' && (
                <a
                  href={c.proofLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted"
                >
                  Open the proof (PDF)
                </a>
              )}
              {!c.proofLink && <p className="text-sm text-muted-foreground">No proof file is shown for this qualification.</p>}
            </div>
          </section>
        ))
      )}

      <p className="text-xs text-muted-foreground">
        Proof links expire after {Math.round(PROOF_LINK_SECONDS / 60)} minutes. Refresh the page for a new one.
      </p>
    </main>
  );
}
