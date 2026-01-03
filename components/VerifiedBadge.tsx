interface VerifiedBadgeProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function VerifiedBadge({ size = 'md', className = '' }: VerifiedBadgeProps) {
  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-7 h-7',
  };

  // Create a perfectly symmetrical 12-pointed star/badge
  const points = 12;
  const outerRadius = 10;
  const innerRadius = 7;
  const centerX = 12;
  const centerY = 12;
  
  let pathData = '';
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI * 2 * i) / (points * 2) - Math.PI / 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    pathData += `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  pathData += 'Z';

  return (
    <svg
      className={`inline-block flex-shrink-0 ${sizeClasses[size]} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Verified"
    >
      <title>Verified iTutor</title>
      {/* Perfectly symmetrical badge shape */}
      <path
        d={pathData}
        fill="url(#gradient)"
        stroke="#059669"
        strokeWidth="0.3"
      />
      
      {/* White checkmark */}
      <path
        d="M8.5 12L11 14.5L15.5 9.5"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Gradient definition */}
      <defs>
        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
    </svg>
  );
}

