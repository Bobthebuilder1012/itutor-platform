'use client';

import Image from 'next/image';

interface UserAvatarProps {
  avatarUrl?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  rounded?: 'full' | 'xl' | '2xl' | 'lg';
}

export default function UserAvatar({
  avatarUrl,
  name,
  size = 40,
  className = '',
  rounded = 'full',
}: UserAvatarProps) {
  const roundedClass = {
    full: 'rounded-full',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    lg: 'rounded-lg',
  }[rounded];

  const base = `bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0 ${roundedClass} ${className}`;

  if (avatarUrl) {
    return (
      <div className={base} style={{ width: size, height: size }}>
        <Image
          src={avatarUrl}
          alt={name || 'User avatar'}
          width={size}
          height={size}
          className={`w-full h-full object-cover ${roundedClass}`}
          unoptimized
        />
      </div>
    );
  }

  return (
    <div className={base} style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        style={{ width: size * 0.62, height: size * 0.62 }}
        aria-label={name || 'Default avatar'}
      >
        <circle cx="12" cy="8" r="4" fill="#9ca3af" />
        <path
          d="M4 20c0-4 3.582-7 8-7s8 3 8 7"
          stroke="#9ca3af"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}
