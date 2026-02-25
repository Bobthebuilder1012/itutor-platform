'use client';

interface ProfilePreview {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
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

  const colors = [
    'from-emerald-400 to-teal-500',
    'from-violet-400 to-purple-500',
    'from-sky-400 to-blue-500',
  ];

  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <div
          key={p.id}
          className={`${dim} ${i > 0 ? overlap : ''} rounded-full border-2 border-white flex-shrink-0 overflow-hidden`}
          title={p.full_name ?? 'Member'}
          style={{ zIndex: shown.length - i }}
        >
          {p.avatar_url ? (
            <img
              src={p.avatar_url}
              alt={p.full_name ?? 'Member'}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className={`w-full h-full bg-gradient-to-br ${colors[i % colors.length]} flex items-center justify-center text-white font-semibold`}
            >
              {(p.full_name ?? 'M').charAt(0).toUpperCase()}
            </div>
          )}
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
