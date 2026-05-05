'use client';

import UserAvatar from '@/components/UserAvatar';

interface ProfilePreview {
  id: string;
  full_name?: string | null;
  avatar_url?: string | null;
}

interface ProfilePictureRowProps {
  profiles: ProfilePreview[];
  totalCount: number;
  size?: 'sm' | 'md';
}

export default function ProfilePictureRow({
  profiles,
  totalCount,
  size = 'sm',
}: ProfilePictureRowProps) {
  const shown = profiles.slice(0, 3);
  const extra = totalCount - shown.length;
  const dim = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs';
  const overlap = size === 'sm' ? '-ml-2' : '-ml-2.5';
  const avatarPx = size === 'sm' ? 28 : 36;

  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <div
          key={p.id}
          className={`${dim} ${i > 0 ? overlap : ''} rounded-full border-2 border-white flex-shrink-0 overflow-hidden flex items-center justify-center`}
          title={p.full_name ?? 'Member'}
          style={{ zIndex: shown.length - i }}
        >
          <UserAvatar avatarUrl={p.avatar_url} name={p.full_name} size={avatarPx} />
        </div>
      ))}

      {extra > 0 && (
        <div
          className={`${dim} ${overlap} rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-gray-600 font-semibold flex-shrink-0`}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}
