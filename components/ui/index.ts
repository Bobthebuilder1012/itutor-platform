/**
 * The iTutor design system, as React components.
 *
 * Built from the design system artifact (tokens.json, bundle.css,
 * index.d.ts and each component's README), which is itself drawn from the
 * parent and student Figma files. Props match index.d.ts; the look matches
 * bundle.css, expressed as Tailwind classes on the new tokens.
 *
 * Light-only. Everything here expects to sit inside `NewUiShell`, which
 * supplies the `.ds-root` class the tokens resolve against.
 */

export { AppHeader, type AppHeaderProps, type HeaderAction } from './AppHeader';
export { BottomNav, DEFAULT_NAV, type BottomNavProps, type NavItem } from './BottomNav';
export { Button, type ButtonProps } from './Button';
export { Card, type CardProps } from './Card';
export { ClassRow, type ClassRowProps } from './ClassRow';
export { Countdown, type CountdownProps } from './Countdown';
export { DsPortal, DS_ROOT_CLASS, type DsPortalProps } from './DsPortal';
export { DsIcon, type DsIconProps, type IconName } from './icons';
export { NewUiShell, type NewUiShellProps } from './NewUiShell';
export { QuestProgress, type QuestProgressProps } from './QuestProgress';
export { SectionHeader, type SectionHeaderProps } from './SectionHeader';
export { SubjectTile, type SubjectColor, type SubjectTileProps } from './SubjectTile';
export { Tag, type TagProps } from './Tag';
