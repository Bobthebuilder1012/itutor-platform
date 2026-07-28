'use client';

// Student/child-facing credential block. Fetches ONLY the structured,
// admin-verified text (title / institution / year) from
// /api/degrees/[tutorId]/verified — never the document image. Renders
// nothing unless the tutor has a verified credential, so an unverified or
// rejected claim never appears to a student as if it were verified.

import { useEffect, useState } from 'react';
import { GraduationCap, BadgeCheck } from 'lucide-react';

interface VerifiedDegree {
  degree: string;
  school_name: string;
  field: string | null;
  graduation_year: number | null;
}

export default function TutorCredentials({
  tutorId,
  variant = 'full',
  className = '',
}: {
  tutorId: string;
  variant?: 'full' | 'compact';
  className?: string;
}) {
  const [degree, setDegree] = useState<VerifiedDegree | null>(null);

  useEffect(() => {
    if (!tutorId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/degrees/${tutorId}/verified`);
        const json = await res.json();
        if (!cancelled && json?.verified && json?.degree) setDegree(json.degree);
      } catch {
        /* non-fatal — just render nothing */
      }
    })();
    return () => { cancelled = true; };
  }, [tutorId]);

  if (!degree) return null;

  const line = [degree.school_name, degree.graduation_year].filter(Boolean).join(' · ');
  const title = degree.field ? `${degree.degree} — ${degree.field}` : degree.degree;

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-2 text-sm ${className}`}>
        <BadgeCheck className="size-4 shrink-0 text-brand-deep" />
        <span className="text-ink">{title}</span>
        {line && <span className="text-muted-foreground">· {line}</span>}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-border bg-card p-5 ${className}`}>
      <div className="flex items-center gap-2">
        <GraduationCap className="size-4 text-brand-deep" />
        <h3 className="font-semibold text-ink">Credentials</h3>
      </div>
      <div className="mt-3 flex items-start gap-3">
        <div className="flex-1">
          <div className="font-medium text-ink">{title}</div>
          {line && <div className="text-sm text-muted-foreground mt-0.5">{line}</div>}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-deep">
          <BadgeCheck className="size-3.5" /> Verified
        </span>
      </div>
    </div>
  );
}
