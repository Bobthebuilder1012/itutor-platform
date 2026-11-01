'use client';

/**
 * The design system's icon names mapped to Phosphor, which is what the Figma
 * files draw with. The design system's own bundle ships hand-drawn SVG
 * stand-ins only so its previews do not depend on a package; its README says
 * the app should use `@phosphor-icons/react` at the regular weight, so that is
 * what this does.
 *
 * Line icons at 21–22px, stroke about 1.8, round caps — Phosphor's regular
 * weight matches that without further configuration.
 */

import {
  Bell,
  CaretRight,
  ChatCircle,
  Compass,
  CreditCard,
  GraduationCap,
  House,
  MagnifyingGlass,
  Play,
  User,
  type Icon as PhosphorIcon,
  type IconWeight,
} from '@phosphor-icons/react';

export type IconName =
  | 'home'
  | 'explore'
  | 'classes'
  | 'billing'
  | 'profile'
  | 'bell'
  | 'chat'
  | 'search'
  | 'chevron'
  | 'play';

const ICONS: Record<IconName, PhosphorIcon> = {
  home: House,
  explore: Compass,
  classes: GraduationCap,
  billing: CreditCard,
  profile: User,
  bell: Bell,
  chat: ChatCircle,
  search: MagnifyingGlass,
  chevron: CaretRight,
  play: Play,
};

export interface DsIconProps {
  name: IconName;
  /** Pixel size of the square icon. Default 22, the header/nav size. */
  size?: number;
  weight?: IconWeight;
  className?: string;
}

export function DsIcon({ name, size = 22, weight = 'regular', className }: DsIconProps) {
  const Glyph = ICONS[name] ?? ICONS.chevron;
  return <Glyph size={size} weight={weight} className={className} aria-hidden />;
}
