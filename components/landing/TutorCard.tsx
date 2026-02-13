import Link from 'next/link';
import Image from 'next/image';
import type { FeaturedTutor } from '@/lib/services/landingTutorsService';
import { getAvatarColor } from '@/lib/utils/avatarColors';

interface TutorCardProps {
  tutor: FeaturedTutor;
  showPrice?: boolean;
}

export default function TutorCard({ tutor, showPrice = false }: TutorCardProps) {
  const {
    id,
    full_name,
    avatar_url,
    rating_average,
    rating_count,
    isVerified,
    subjects,
    priceRange,
  } = tutor;

  // Generate initials for fallback avatar
  const initials = full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Get first 3 subjects and count remaining
  const displaySubjects = subjects.slice(0, 3);
  const remainingCount = subjects.length - 3;

  return (
    <div className="bg-white border-2 border-gray-100 rounded-2xl p-6 hover:border-itutor-green hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
      {/* Avatar and Name */}
      <div className="flex items-start gap-4 mb-4">
        <div className="relative flex-shrink-0">
          {avatar_url ? (
            <Image
              src={avatar_url}
              alt={full_name}
              width={64}
              height={64}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${getAvatarColor(id)} flex items-center justify-center text-white font-bold text-xl`}>
              {initials}
            </div>
          )}
          {isVerified && (
            <div className="absolute -bottom-1 -right-1 bg-itutor-green rounded-full p-1 shadow-lg" title="Verified Tutor">
              <svg
                className="w-4 h-4 text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg text-gray-900 group-hover:text-itutor-green transition-colors truncate">
            {full_name}
          </h3>
          {rating_average !== null && rating_count > 0 ? (
            <div className="flex items-center gap-1 text-sm">
              <svg
                className="w-4 h-4 text-yellow-400 fill-current"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="font-semibold text-gray-900">
                {rating_average.toFixed(1)}
              </span>
              <span className="text-gray-500">({rating_count})</span>
            </div>
          ) : (
            <div className="text-sm text-gray-500">New iTutor</div>
          )}
        </div>
      </div>

      {/* Price - show $0.00 if paid sessions disabled */}
      <div className="mb-4">
        <div className="text-2xl font-bold text-itutor-green">
          {process.env.NEXT_PUBLIC_ENABLE_PAID_SESSIONS === 'true' && showPrice && priceRange.min > 0
            ? priceRange.min === priceRange.max
              ? `$${priceRange.min}`
              : `$${priceRange.min}-$${priceRange.max}`
            : '$0.00'}
          <span className="text-sm font-normal text-gray-600">/hr TTD</span>
        </div>
      </div>

      {/* Subjects */}
      {displaySubjects.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {displaySubjects.map((subject, idx) => (
              <span
                key={idx}
                className="px-3 py-1 bg-green-50 text-itutor-green text-xs font-medium rounded-full border border-green-200"
              >
                {subject.name}
              </span>
            ))}
            {remainingCount > 0 && (
              <span className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                +{remainingCount} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* CTA Button */}
      <Link
        href={`/tutors/${id}`}
        className="block w-full px-4 py-3 bg-gradient-to-r from-itutor-green to-emerald-500 text-white font-bold rounded-xl text-center hover:shadow-lg hover:scale-105 transition-all duration-300"
      >
        View Profile
      </Link>
    </div>
  );
}




