import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { StarRating } from "./StarRating";

export type ClassCardData = {
  id: string;
  name: string;
  subject: string;
  description: string;
  tutorName: string;
  tutorAvatar?: string;
  verified?: boolean;
  rating: number;
  ratingCount: number;
  priceTTD: number;
  accent?: string;
};

export function ClassCard({ c }: { c: ClassCardData }) {
  const accent = c.accent ?? "#32CC6F";
  return (
    <Link
      href={`/classes/${c.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[#1F1F1F] bg-[#111111] transition hover:border-[#32CC6F]/50"
    >
      <div className="h-2 w-full" style={{ background: accent }} />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-full bg-[#1F1F1F] text-xs font-bold text-white/70 overflow-hidden">
            {c.tutorAvatar ? (
              <img src={c.tutorAvatar} alt={c.tutorName} className="size-full object-cover" />
            ) : (
              c.tutorName.split(" ").map((s) => s[0]).slice(0, 2).join("")
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-sm font-medium text-white truncate">
              {c.tutorName}
              {c.verified && (
                <BadgeCheck className="size-4 shrink-0 text-[#32CC6F]" />
              )}
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-[16px] font-bold text-white leading-snug line-clamp-2">{c.name}</h3>
          <span className="mt-1.5 inline-block rounded-full bg-[#1F1F1F] px-2.5 py-0.5 text-[11px] font-medium text-[#A0A0A0]">
            {c.subject}
          </span>
        </div>

        <p className="text-sm text-[#A0A0A0] line-clamp-2">{c.description}</p>

        <StarRating value={c.rating} count={c.ratingCount} />

        <div className="mt-2 flex items-center justify-between pt-3 border-t border-[#1F1F1F]">
          <div>
            <div className="text-base font-bold text-white">TTD ${c.priceTTD}</div>
            <div className="text-[11px] text-[#A0A0A0]">per month</div>
          </div>
          <span className="rounded-full bg-[#32CC6F] px-4 py-2 text-xs font-semibold text-black transition group-hover:brightness-110">
            Join Class
          </span>
        </div>
      </div>
    </Link>
  );
}
