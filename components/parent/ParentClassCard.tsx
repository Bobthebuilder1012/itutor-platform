'use client';

// The one class card a parent ever sees.
//
// It was lifted verbatim out of /parent/classes so the marketplace and a child's
// Classes tab render the same object the same way. Before this, a class a parent
// had just enrolled their child in changed shape between the page they joined it
// on and the page they managed it from — banner and price on one, a grey book
// glyph on the other — and nothing about a class actually changes at enrolment.
//
// Only two things vary by caller, so only two things are props: the chips under
// the tutor line, and the footer action. Everything above them is fixed, which is
// the point — a caller cannot quietly grow its own variant.

import Link from 'next/link';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtTTD } from '@/lib/utils/formatCurrency';

export type ParentClassCardData = {
  id: string;
  name: string;
  subject?: string | null;
  formLevel?: string | null;
  tutorName: string;
  coverImage?: string | null;
  rating?: number | null;
  /** Already collapsed to one line by the caller. */
  scheduleLine?: string | null;
  priceMonthly?: number | null;
};

// Moved here from /parent/classes unchanged — same list, same hash — so the
// banner a class draws does not change colour when it is viewed from the other
// page. A class keeping its colour is most of what makes it recognisable.
const GRADIENTS = [
  'from-brand to-emerald-400', 'from-sky-500 to-cyan-400', 'from-orange-500 to-amber-400',
  'from-fuchsia-500 to-purple-500', 'from-rose-500 to-pink-400', 'from-indigo-500 to-blue-500',
];

export function gradientFor(name: string) {
  return GRADIENTS[Math.abs([...name].reduce((a, c) => a + c.charCodeAt(0), 0)) % GRADIENTS.length];
}

export default function ParentClassCard({
  c,
  chips,
  action,
  cornerBadge,
  href,
}: {
  c: ParentClassCardData;
  /** Small pills under the tutor line — scarcity, approval, enrolment status. */
  chips?: React.ReactNode;
  /** Footer control: Join on the marketplace, View on a child's Classes tab. */
  action?: React.ReactNode;
  /** Top-right of the banner, e.g. "Class full". */
  cornerBadge?: React.ReactNode;
  /** When set the whole card is a link; the footer action still wins on click. */
  href?: string;
}) {
  const price = c.priceMonthly ?? 0;

  const body = (
    <>
      <div
        className={cn('relative h-28 flex items-end p-3', !c.coverImage && `bg-gradient-to-br ${gradientFor(c.name)}`)}
        style={
          c.coverImage
            ? { backgroundImage: `url(${c.coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : undefined
        }
      >
        {cornerBadge}
        <div className="size-12 rounded-2xl bg-white/90 backdrop-blur grid place-items-center text-2xl shadow-md">📚</div>
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-bold text-ink leading-tight">{c.name}</h3>
          {c.rating != null && c.rating > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">
              <Star className="size-3 fill-amber-500 text-amber-500" /> {c.rating.toFixed(1)}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          by {c.tutorName}
          {c.subject ? ` · ${c.subject}` : ''}
          {c.formLevel ? ` · ${c.formLevel}` : ''}
        </div>

        {chips && <div className="mt-2 flex flex-wrap gap-1">{chips}</div>}

        {c.scheduleLine && <div className="text-xs text-muted-foreground mt-2">{c.scheduleLine}</div>}

        <div className="mt-auto pt-3 border-t border-border flex items-center justify-between gap-2">
          <div>
            {price > 0 ? (
              <>
                <span className="font-bold text-ink">{fmtTTD(price)}</span>
                <span className="text-[11px] text-muted-foreground">/mo</span>
              </>
            ) : (
              <span className="font-bold text-brand-deep">Free</span>
            )}
          </div>
          {action}
        </div>
      </div>
    </>
  );

  const shell = 'rounded-2xl border border-border bg-background overflow-hidden hover:shadow-card transition flex flex-col';

  return href ? (
    <Link href={href} className={shell}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
