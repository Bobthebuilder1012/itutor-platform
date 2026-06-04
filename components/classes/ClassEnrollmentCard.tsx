'use client';

import { BadgeCheck, Check } from "lucide-react";
import { StarRating } from "./StarRating";

export type EnrollmentClass = {
  name: string;
  priceTTD: number;
  nextBilling: string;
  enrolled: boolean;
  highlights: string[];
  onJoin?: () => void;
  joining?: boolean;
  tutor: {
    name: string;
    avatar?: string;
    verified?: boolean;
    rating: number;
    students: number;
  };
};

export function ClassEnrollmentCard({ c }: { c: EnrollmentClass }) {
  return (
    <aside className="sticky top-24 rounded-2xl border border-[#1F1F1F] bg-[#111111] p-6 space-y-5">
      <div>
        <div className="text-3xl font-bold text-white">TTD ${c.priceTTD}</div>
        <div className="text-xs text-[#A0A0A0]">per month · next billing {c.nextBilling}</div>
      </div>

      {c.enrolled ? (
        <span className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#32CC6F]/15 px-4 py-2.5 text-sm font-semibold text-[#32CC6F]">
          <Check className="size-4" /> You're enrolled
        </span>
      ) : (
        <button
          onClick={c.onJoin}
          disabled={c.joining}
          className="w-full rounded-full bg-[#32CC6F] px-4 py-3 text-sm font-bold text-black hover:brightness-110 transition disabled:opacity-60"
        >
          {c.joining ? 'Joining…' : 'Join Class'}
        </button>
      )}

      <ul className="space-y-2">
        {c.highlights.map((h) => (
          <li key={h} className="flex items-start gap-2 text-sm text-white/85">
            <Check className="mt-0.5 size-4 shrink-0 text-[#32CC6F]" />
            <span>{h}</span>
          </li>
        ))}
      </ul>

      <div className="rounded-xl border border-[#1F1F1F] bg-black/40 p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-full bg-[#1F1F1F] text-xs font-bold text-white/70 overflow-hidden">
            {c.tutor.avatar ? (
              <img src={c.tutor.avatar} alt={c.tutor.name} className="size-full object-cover" />
            ) : (
              c.tutor.name.split(" ").map((s) => s[0]).slice(0, 2).join("")
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-sm font-semibold text-white">
              {c.tutor.name}
              {c.tutor.verified && <BadgeCheck className="size-4 text-[#32CC6F]" />}
            </div>
            <div className="text-xs text-[#A0A0A0]">{c.tutor.students} students</div>
          </div>
        </div>
        <div className="mt-3">
          <StarRating value={c.tutor.rating} />
        </div>
      </div>
    </aside>
  );
}
