'use client';

/**
 * A tutor's banner, blurred, as the background of their profile header.
 *
 * Students and parents saw a flat green gradient where the teacher had a banner
 * they had chosen and uploaded. This puts it behind the header instead: the
 * teacher's own image, blurred and darkened, so the page carries something of
 * them without the header becoming a picture with text on top of it.
 *
 * WHY BLURRED RATHER THAN SHOWN. The banner is a wide crop of arbitrary
 * content — photos, logos, hand-made graphics of every contrast. Rendered
 * sharp, it competes with the name and the verification badge sitting over it,
 * and there is no crop that is safe for every upload. Blurring reduces it to
 * colour and shape, which is what a background is for, and makes the result
 * legible whatever was uploaded.
 *
 * WHY A SCRIM ON TOP. Blur alone does not guarantee contrast — a pale banner
 * blurs to a pale wash, and the avatar ring and any white text over it
 * disappear. The gradient scrim holds the floor no matter what is behind it.
 *
 * WHY `scale-110`. `blur()` samples beyond the element's edges, which fades the
 * outermost pixels to transparent and leaves a visible pale border on all four
 * sides. Scaling the image up past its container pushes that fade outside the
 * clip, so the blur reaches the edges.
 *
 * A tutor with no banner gets the platform default, which is what
 * profileBannerDisplayUrl already returns — so this never renders empty, and
 * there is no "no banner" state to design.
 */

import { cn } from '@/lib/utils';
import { profileBannerDisplayUrl } from '@/lib/utils/profileBannerDisplayUrl';

export default function BlurredBannerBackdrop({
  bannerUrl,
  /** `profiles.updated_at`, to cache-bust a re-upload. */
  version,
  className,
  children,
}: {
  bannerUrl: string | null | undefined;
  version?: string | null;
  /** Height and radius belong to the caller — the two profiles differ. */
  className?: string;
  /** Anything that sits over the banner. */
  children?: React.ReactNode;
}) {
  const src = profileBannerDisplayUrl(bannerUrl, version);

  return (
    <div className={cn('relative overflow-hidden bg-brand-deep', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 size-full scale-110 object-cover blur-xl"
        // Decorative and below the fold of importance: never let it hold up
        // the name, the rating or the booking button.
        loading="lazy"
        decoding="async"
      />
      {/* The scrim. Darker at the bottom, where the avatar and the name land. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/30 to-black/55"
      />
      {children && <div className="relative">{children}</div>}
    </div>
  );
}
