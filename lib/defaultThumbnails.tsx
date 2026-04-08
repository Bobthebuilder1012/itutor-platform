import React from 'react';

export const DEFAULT_THUMBNAIL_PREFIX = '__default_';

export interface DefaultThumbnail {
  id: number;
  gradient: string;
  Icon: React.FC;
}

const GRADIENTS = [
  'linear-gradient(135deg, #d1fae5 0%, #6ee7b7 50%, #34d399 100%)',
  'linear-gradient(135deg, #ede9fe 0%, #c4b5fd 40%, #a78bfa 70%, #7c3aed 100%)',
  'linear-gradient(135deg, #fef3c7 0%, #fde68a 30%, #fcd34d 70%, #fbbf24 100%)',
  'linear-gradient(135deg, #cffafe 0%, #67e8f9 30%, #22d3ee 60%, #0891b2 100%)',
  'linear-gradient(135deg, #ffe4e6 0%, #fda4af 35%, #fb7185 65%, #e11d48 100%)',
];

const BookIcon: React.FC = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    <line x1="9" y1="7" x2="15" y2="7" />
    <line x1="9" y1="11" x2="13" y2="11" />
  </svg>
);

const AtomIcon: React.FC = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round">
    <circle cx="12" cy="12" r="2.5" />
    <ellipse cx="12" cy="12" rx="10" ry="4" />
    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
    <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" />
  </svg>
);

const CalcIcon: React.FC = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <rect x="7" y="5" width="10" height="5" rx="1" />
    <circle cx="8.5" cy="14.5" r="0.8" fill="white" />
    <circle cx="12" cy="14.5" r="0.8" fill="white" />
    <circle cx="15.5" cy="14.5" r="0.8" fill="white" />
    <circle cx="8.5" cy="18" r="0.8" fill="white" />
    <circle cx="12" cy="18" r="0.8" fill="white" />
    <circle cx="15.5" cy="18" r="0.8" fill="white" />
  </svg>
);

const DnaIcon: React.FC = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="white" stroke="none">
    {/* Strand B — behind */}
    <circle cx="6"  cy="2"  r="1.4" />
    <circle cx="4"  cy="6"  r="2.6" />
    <circle cx="8"  cy="10" r="1.8" />
    <circle cx="16" cy="14" r="1.8" />
    <circle cx="20" cy="18" r="2.6" />
    <circle cx="18" cy="22" r="1.4" />
    {/* Strand A — in front */}
    <circle cx="18" cy="2"  r="1.4" />
    <circle cx="20" cy="6"  r="2.6" />
    <circle cx="16" cy="10" r="1.8" />
    <circle cx="8"  cy="14" r="1.8" />
    <circle cx="4"  cy="18" r="2.6" />
    <circle cx="6"  cy="22" r="1.4" />
    {/* Center crossing */}
    <circle cx="12" cy="12" r="1.4" />
  </svg>
);

const PenIcon: React.FC = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const ICON_COMPONENTS: React.FC[] = [BookIcon, AtomIcon, CalcIcon, DnaIcon, PenIcon];

export const DEFAULT_THUMBNAILS: DefaultThumbnail[] = GRADIENTS.map((gradient, i) => ({
  id: i,
  gradient,
  Icon: ICON_COMPONENTS[i],
}));

export function isDefaultThumbnail(coverImage: string | null | undefined): boolean {
  return !!coverImage && coverImage.startsWith(DEFAULT_THUMBNAIL_PREFIX);
}

export function getDefaultThumbnail(coverImage: string | null | undefined): DefaultThumbnail | null {
  if (!coverImage || !coverImage.startsWith(DEFAULT_THUMBNAIL_PREFIX)) return null;
  const idx = parseInt(coverImage.slice(DEFAULT_THUMBNAIL_PREFIX.length), 10);
  return DEFAULT_THUMBNAILS[idx] ?? null;
}

export function deterministicDefault(groupId: string): DefaultThumbnail {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) {
    hash = ((hash << 5) - hash + groupId.charCodeAt(i)) | 0;
  }
  return DEFAULT_THUMBNAILS[Math.abs(hash) % DEFAULT_THUMBNAILS.length];
}

export function randomDefaultThumbnailValue(): string {
  return `${DEFAULT_THUMBNAIL_PREFIX}${Math.floor(Math.random() * DEFAULT_THUMBNAILS.length)}`;
}
