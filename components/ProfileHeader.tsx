'use client';

import VerifiedBadge from '@/components/VerifiedBadge';
import { getAvatarColor } from '@/lib/utils/avatarColors';

type ProfileHeaderProps = {
  fullName: string;
  role: 'student' | 'tutor' | 'parent';
  school?: string | null;
  country?: string | null;
  subjectsLine?: string | null;
  bio?: string | null;
  ratingAverage?: number | null;
  ratingCount?: number | null;
  avatarUrl?: string | null;
  onAvatarClick?: () => void;
  isVerified?: boolean;
  userId?: string; // Add userId for dynamic avatar colors
};

export default function ProfileHeader({
  fullName,
  role,
  school,
  country,
  subjectsLine,
  bio,
  ratingAverage,
  ratingCount,
  avatarUrl,
  onAvatarClick,
  isVerified = false,
  userId,
}: ProfileHeaderProps) {
  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getRoleColor = () => {
    switch (role) {
      case 'student':
        return 'bg-blue-100 text-blue-700';
      case 'tutor':
        return 'bg-green-100 text-green-700';
      case 'parent':
        return 'bg-purple-100 text-purple-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getRoleLabel = () => {
    switch (role) {
      case 'student':
        return 'Student';
      case 'tutor':
        return 'Tutor';
      case 'parent':
        return 'Parent';
      default:
        return role;
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border-2 border-gray-200 p-4 sm:p-6 mb-6 hover:shadow-itutor-green/20 transition-all duration-300">
      <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-4">
        {/* Left side: Avatar + Info */}
        <div className="flex items-start gap-3 sm:gap-4 w-full sm:w-auto">
          {/* Avatar */}
          <div
            className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-full shadow-md flex-shrink-0 ${
              onAvatarClick ? 'cursor-pointer group' : ''
            }`}
            onClick={onAvatarClick}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={fullName}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover"
              />
            ) : (
              <div 
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-white text-xl sm:text-2xl font-bold"
                style={{ background: getAvatarColor(userId || fullName) }}
              >
                {getInitials(fullName)}
              </div>
            )}
            {onAvatarClick && (
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 rounded-full transition-all duration-200 flex items-center justify-center">
                <svg
                  className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {/* Name */}
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1 flex flex-wrap items-center gap-2">
              {fullName}
              {role === 'tutor' && isVerified && <VerifiedBadge size="md" />}
            </h1>

            {/* Role chip */}
            <span className={`inline-block px-2 sm:px-3 py-1 rounded-full text-xs font-semibold ${getRoleColor()} mb-2`}>
              {getRoleLabel()}
              {role === 'tutor' && isVerified && <span className="ml-1">✓</span>}
            </span>

            {/* Secondary info */}
            <div className="space-y-1 text-sm text-gray-700">
              {school && (
                <div className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-itutor-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <span>{school}</span>
                </div>
              )}
              {country && (
                <div className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-itutor-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{country}</span>
                </div>
              )}
              {subjectsLine && (
                <div className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-itutor-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-gray-600">{subjectsLine}</span>
                </div>
              )}
            </div>

            {/* Biography */}
            {bio && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-start gap-2">
                  <svg className="h-4 w-4 text-itutor-green flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {bio}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right side: Rating (tutors only) - Stacks on mobile, side on desktop */}
        {role === 'tutor' && (ratingAverage !== null && ratingAverage !== undefined) && (
          <div className="flex flex-col sm:items-end items-start w-full sm:w-auto sm:flex-shrink-0">
            <div className="flex items-center gap-1 mb-1">
              <svg className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-xl sm:text-2xl font-bold text-gray-900">
                {ratingAverage.toFixed(1)}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-gray-600">
              {ratingCount} {ratingCount === 1 ? 'review' : 'reviews'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}


