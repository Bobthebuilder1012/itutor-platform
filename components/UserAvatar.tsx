'use client';

interface UserAvatarProps {
  avatarUrl?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  rounded?: 'full' | 'xl' | '2xl' | 'lg';
  /**
   * When true, the avatar stretches to 100% of its parent (which must have
   * a fixed width/height). When false (default), `size` sets the dimensions.
   */
  fill?: boolean;
}

export default function UserAvatar({
  avatarUrl,
  name,
  size = 40,
  className = '',
  rounded = 'full',
  fill = false,
}: UserAvatarProps) {
  const roundedClass = {
    full: 'rounded-full',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    lg: 'rounded-lg',
  }[rounded];

  const base = `bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0 ${roundedClass} ${className}`;
  const wrapperStyle: React.CSSProperties = { width: size, height: size };

  if (avatarUrl) {
    // In fill mode, render the <img> directly as a child of the parent so
    // nothing else can introduce a gap between the image and its container.
    if (fill) {
      return (
        <img
          src={avatarUrl}
          alt={name || 'User avatar'}
          draggable={false}
          className={`block object-cover object-center w-full h-full aspect-square ${roundedClass} ${className}`}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            aspectRatio: '1 / 1',
            objectFit: 'cover',
            objectPosition: 'center',
          }}
        />
      );
    }
    return (
      <div className={base} style={wrapperStyle}>
        <img
          src={avatarUrl}
          alt={name || 'User avatar'}
          draggable={false}
          className={`block w-full h-full object-cover ${roundedClass}`}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      </div>
    );
  }

  return (
    <div className={base} style={fill ? { width: '100%', height: '100%' } : wrapperStyle}>
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
