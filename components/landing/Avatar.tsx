type Props = { name: string; hue?: number; size?: number; className?: string };

export function Avatar({ name, hue = 145, size = 40, className = "" }: Props) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const bg = `oklch(0.8 0.12 ${hue})`;
  const fg = `oklch(0.25 0.05 ${hue})`;
  return (
    <div
      className={`inline-flex items-center justify-center rounded-full font-semibold ring-2 ring-white ${className}`}
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
