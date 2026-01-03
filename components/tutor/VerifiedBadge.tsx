// =====================================================
// VERIFIED BADGE COMPONENT
// =====================================================
// Green checkmark badge shown for verified tutors

type VerifiedBadgeProps = {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
};

export default function VerifiedBadge({ size = 'md', showText = false }: VerifiedBadgeProps) {
  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      <div className={`${sizeClasses[size]} bg-green-600 rounded-full flex items-center justify-center flex-shrink-0`}>
        <svg 
          className="w-3/4 h-3/4 text-white" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={3} 
            d="M5 13l4 4L19 7" 
          />
        </svg>
      </div>
      {showText && (
        <span className={`${textSizeClasses[size]} font-semibold text-green-600`}>
          Verified
        </span>
      )}
    </div>
  );
}





