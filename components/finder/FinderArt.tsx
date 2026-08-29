'use client';

/**
 * The illustration half of the Finder.
 *
 * Same interaction model as Class Match Week's QuestionArt, and deliberately so
 * — a family who met the campaign questionnaire should recognise this as the
 * same product rather than a second one. Large art per question that also reacts
 * to the answer, so choosing produces visible feedback beyond a highlighted row.
 *
 * A sibling of QuestionArt rather than a shared component: the two flows ask
 * different questions in a different order, so one shared step->art map would
 * have to be keyed by meaning rather than index and would break whenever either
 * flow gained a step. The 30 lines of duplicated shell are cheaper than that
 * coupling.
 *
 * Composition is lucide icons, not bespoke illustration: it stays on the icon set
 * the rest of the product uses, weighs nothing, and scales crisply. The target
 * device is a mid-range Android on mobile data, so motion is a CSS
 * opacity/transform transition on a remounted node — no animation library, no
 * layout thrash.
 */

import { useEffect, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  Check,
  Clock,
  Compass,
  GraduationCap,
  Heart,
  Laptop,
  MapPin,
  Rocket,
  Sparkles,
  Star,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { STEP } from '@/lib/finder/wizard';

type Art = { icon: LucideIcon; accents: LucideIcon[]; caption: string };

const ART: Record<number, { idle: Art; answered: Art }> = {
  [STEP.ROLE]: {
    idle: { icon: Compass, accents: [Star, Sparkles], caption: 'Let’s find the right teacher' },
    answered: { icon: Compass, accents: [Star, Sparkles], caption: 'Let’s find the right teacher' },
  },
  [STEP.LEVEL]: {
    idle: { icon: GraduationCap, accents: [BookOpen, Star], caption: 'Which year are we shopping for?' },
    answered: { icon: BookOpen, accents: [Check, GraduationCap], caption: 'We’ll match the syllabus' },
  },
  [STEP.CHILD]: {
    idle: { icon: Heart, accents: [Star, Users], caption: 'Who are we finding a class for?' },
    answered: { icon: Users, accents: [Check, Heart], caption: 'Lovely — let’s get started' },
  },
  [STEP.SUBJECT]: {
    idle: { icon: BookOpen, accents: [Sparkles, Star], caption: 'What do you want help with?' },
    answered: { icon: Sparkles, accents: [Check, BookOpen], caption: 'We have teachers for this' },
  },
  [STEP.AVAILABILITY]: {
    idle: { icon: CalendarDays, accents: [Clock, Star], caption: 'When are you free?' },
    answered: { icon: Clock, accents: [Check, CalendarDays], caption: 'We’ll rank by these times' },
  },
  [STEP.LESSON_TYPE]: {
    idle: { icon: Users, accents: [Heart, Star], caption: 'How do you like to learn?' },
    answered: { icon: Heart, accents: [Check, Users], caption: 'Noted — that shapes the match' },
  },
  [STEP.DELIVERY]: {
    idle: { icon: Laptop, accents: [MapPin, Star], caption: 'Online, or somewhere to go?' },
    answered: { icon: MapPin, accents: [Check, Laptop], caption: 'We’ll only show classes you can reach' },
  },
  [STEP.BUDGET]: {
    idle: { icon: Wallet, accents: [Star, Sparkles], caption: 'What feels comfortable?' },
    answered: { icon: Sparkles, accents: [Check, Wallet], caption: 'We’ll stay inside it' },
  },
  [STEP.URGENCY]: {
    idle: { icon: Rocket, accents: [Clock, Star], caption: 'When would you start?' },
    answered: { icon: Compass, accents: [Check, Rocket], caption: 'That’s everything — let’s look' },
  },
};

export default function FinderArt({
  step,
  answered,
  compact = false,
}: {
  step: number;
  answered: boolean;
  /**
   * The mobile strip. Its wrapper is `h-32`, and the full layout (p-8 + a
   * size-32 tile + an mt-8 caption) does not fit — the caption has been clipped
   * and invisible on every phone since that strip was added. Compact shrinks the
   * tile and drops the caption rather than pretending it renders.
   */
  compact?: boolean;
}) {
  const art = (ART[step] ?? ART[STEP.SUBJECT])[answered ? 'answered' : 'idle'];
  const Icon = art.icon;
  const [A1, A2] = art.accents;

  // Remount-on-change drives the transition: the node mounts at rest state, then
  // an effect flips it, so every swap animates without a library.
  const key = `${step}-${answered ? 'a' : 'i'}`;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [key]);

  return (
    <div
      aria-hidden
      // The gradient lives on the two CALL SITES now, not here. The desktop
      // aside is a flex column with this as one row, so a gradient on both would
      // paint a visible seam where two `from-mint` edges meet at the boundary.
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${
        compact ? 'p-3' : 'p-8'
      }`}
    >
      <div
        key={key}
        className={`flex flex-col items-center transition-all duration-500 ease-out ${
          shown ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        }`}
      >
        <div className="relative">
          <span
            className={`grid place-items-center rounded-[2rem] bg-white shadow-card ${
              compact ? 'size-20' : 'size-32 sm:size-40'
            }`}
          >
            <Icon
              className={`text-brand-deep transition-transform duration-500 ${
                compact ? 'size-10' : 'size-16 sm:size-20'
              } ${shown ? 'scale-100' : 'scale-90'}`}
              strokeWidth={1.5}
            />
          </span>
          {A1 && (
            <span className="absolute -right-3 -top-3 grid size-11 place-items-center rounded-2xl bg-brand text-white shadow-card">
              <A1 className="size-5" strokeWidth={2} />
            </span>
          )}
          {A2 && (
            <span className="absolute -bottom-3 -left-4 grid size-9 place-items-center rounded-xl bg-white text-brand-deep shadow-card">
              <A2 className="size-4" strokeWidth={2} />
            </span>
          )}
        </div>
        {compact ? null : (
          <p className="mt-8 max-w-[16rem] text-center text-sm font-semibold text-brand-deep">
            {art.caption}
          </p>
        )}
      </div>
    </div>
  );
}
