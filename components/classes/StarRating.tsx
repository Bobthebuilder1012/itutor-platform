import { Star } from "lucide-react";

export function StarRating({
  value,
  count,
  size = 14,
  showNumber = true,
}: {
  value: number;
  count?: number;
  size?: number;
  showNumber?: boolean;
}) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="inline-flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => {
          const filled = i <= Math.floor(rounded);
          const half = !filled && i - 0.5 === rounded;
          return (
            <Star
              key={i}
              style={{ width: size, height: size }}
              className={
                filled || half
                  ? "fill-[#32CC6F] text-[#32CC6F]"
                  : "text-white/25"
              }
            />
          );
        })}
      </div>
      {showNumber && (
        <span className="text-sm font-semibold text-white tabular-nums">
          {value.toFixed(1)}
        </span>
      )}
      {typeof count === "number" && (
        <span className="text-xs text-[#A0A0A0]">({count} ratings)</span>
      )}
    </div>
  );
}
