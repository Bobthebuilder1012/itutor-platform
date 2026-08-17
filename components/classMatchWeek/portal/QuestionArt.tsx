'use client';

/**
 * The illustration half of the questionnaire.
 *
 * Borrowed from the Preply flow's interaction model: a large piece of art that
 * changes per question AND reacts to the answer being chosen, so a selection
 * produces visible feedback beyond a highlighted row. Rendered in iTutor's
 * palette rather than Preply's — brand green on mint, not pink.
 *
 * Composition is lucide icons rather than bespoke illustration: it stays on the
 * icon set the rest of the product already uses, weighs nothing, and scales
 * crisply. The target device is a mid-range Android on mobile data, so the
 * motion is a CSS opacity/scale transition on a remounted node — no animation
 * library, no layout thrash.
 */

import { useEffect, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  Check,
  Clock,
  Compass,
  Flame,
  GraduationCap,
  Heart,
  Sparkles,
  Star,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';

type Art = { icon: LucideIcon; accents: LucideIcon[]; caption: string };

/**
 * Art per step, in two states: nothing chosen yet, and answered. The answered
 * variant is the "reactive" half — it should read as progress, not decoration.
 */
const ART: Record<number, { idle: Art; answered: Art }> = {
  0: {
    idle: { icon: Compass, accents: [Star, BookOpen], caption: 'Let’s find the right fit' },
    answered: { icon: GraduationCap, accents: [Check, Star], caption: 'Good — we know the level' },
  },
  1: {
    idle: { icon: BookOpen, accents: [Sparkles, Star], caption: 'Pick what they’re studying' },
    answered: { icon: Sparkles, accents: [Check, BookOpen], caption: 'Teachers teach exactly this' },
  },
  2: {
    idle: { icon: CalendarDays, accents: [Clock, Star], caption: 'When are they free?' },
    answered: { icon: Clock, accents: [Check, CalendarDays], caption: 'We’ll rank by these times' },
  },
  3: {
    idle: { icon: Trophy, accents: [Flame, Star], caption: 'What would help most?' },
    answered: { icon: Flame, accents: [Check, Trophy], caption: 'Noted — that shapes the match' },
  },
  4: {
    idle: { icon: Users, accents: [Heart, Star], caption: 'What kind of teacher?' },
    answered: { icon: Heart, accents: [Check, Users], caption: 'Almost there' },
  },
};

export default function QuestionArt({ step, answered }: { step: number; answered: boolean }) {
  const art = (ART[step] ?? ART[0])![answered ? 'answered' : 'idle'];
  const Icon = art.icon;
  const [A1, A2] = art.accents;

  // Remount-on-change drives the transition: the node mounts at rest state,
  // then an effect flips it, so every swap animates without a library.
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
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-mint via-brand-soft to-mint-wash p-8"
    >
      <div
        key={key}
        className={`flex flex-col items-center transition-all duration-500 ease-out ${
          shown ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        }`}
      >
        <div className="relative">
          <span className="grid size-32 place-items-center rounded-[2rem] bg-white shadow-card sm:size-40">
            <Icon
              className={`size-16 text-brand-deep transition-transform duration-500 sm:size-20 ${
                shown ? 'scale-100' : 'scale-90'
              }`}
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
        <p className="mt-8 max-w-[16rem] text-center text-sm font-semibold text-brand-deep">
          {art.caption}
        </p>
      </div>
    </div>
  );
}
