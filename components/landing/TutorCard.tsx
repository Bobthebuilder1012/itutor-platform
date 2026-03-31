import Link from 'next/link';
import Image from 'next/image';
import type { FeaturedTutor } from '@/lib/services/landingTutorsService';
interface TutorCardProps {
  tutor: FeaturedTutor;
  showPrice?: boolean;
  /** Smaller padding and type for featured row */
  compact?: boolean;
}

export default function TutorCard({ tutor, showPrice = false, compact = false }: TutorCardProps) {
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

  // Get first 3 subjects and count remaining
  const displaySubjects = subjects.slice(0, 3);
  const remainingCount = subjects.length - 3;

  return (
    <div
      className={`group flex h-full w-full flex-col rounded-3xl border border-white/60 bg-gradient-to-br from-white/70 via-white/40 to-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-8px_16px_rgba(255,255,255,0.1)] ring-1 ring-inset ring-white/50 backdrop-blur-2xl backdrop-saturate-150 transition-all duration-300 hover:scale-[1.03] hover:border-white/80 hover:from-white/80 hover:via-white/55 hover:to-white/30 hover:shadow-[0_16px_48px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.95)] ${compact ? 'p-3' : 'p-6'}`}
    >
      {/* Avatar and Name */}
      <div className={`flex shrink-0 items-start gap-3 ${compact ? 'mb-2' : 'mb-4'}`}>
        <div className="relative flex-shrink-0">
          <Image
            src={avatar_url || '/default-avatar.png'}
            alt={full_name}
            width={compact ? 48 : 64}
            height={compact ? 48 : 64}
            className={`rounded-full object-cover ${compact ? 'h-12 w-12' : 'h-16 w-16'}`}
          />
          {isVerified && (
            <div
              className={`absolute -bottom-1 -right-1 rounded-full bg-itutor-green shadow-lg ${compact ? 'p-0.5' : 'p-1'}`}
              title="Verified Tutor"
            >
              <svg
                className={`text-white ${compact ? 'h-3 w-3' : 'h-4 w-4'}`}
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
        <div className="min-w-0 flex-1">
          <h3
            className={`truncate font-bold text-gray-900 transition-colors group-hover:text-itutor-green ${compact ? 'text-sm' : 'text-lg'}`}
          >
            {full_name}
          </h3>
          {rating_average !== null && rating_count > 0 ? (
            <div className={`flex items-center gap-1 ${compact ? 'text-xs' : 'text-sm'}`}>
              <svg
                className={`text-yellow-400 ${compact ? 'h-3 w-3' : 'h-4 w-4'} fill-current`}
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
            <div className={`text-gray-500 ${compact ? 'text-xs' : 'text-sm'}`}>New iTutor</div>
          )}
        </div>
      </div>

      <div className={`flex min-h-0 flex-1 flex-col ${compact ? 'gap-2' : 'gap-4'}`}>
        {/* Price - show $0.00 if paid sessions disabled */}
        <div className="shrink-0">
          <div className={`font-bold text-itutor-green ${compact ? 'text-lg' : 'text-2xl'}`}>
            {process.env.NEXT_PUBLIC_ENABLE_PAID_SESSIONS === 'true' && showPrice && priceRange.min > 0
              ? priceRange.min === priceRange.max
                ? `$${priceRange.min}`
                : `$${priceRange.min}-$${priceRange.max}`
              : '$0.00'}
            <span className={`font-normal text-gray-500 ${compact ? 'text-xs' : 'text-sm'}`}>/hr TTD</span>
          </div>
        </div>

        {/* Subjects — fixed min height so every card body aligns */}
        <div
          className={`min-h-0 flex-1 ${compact ? 'min-h-[4.25rem]' : 'min-h-[5.5rem]'}`}
        >
          {displaySubjects.length > 0 ? (
            <div className="flex flex-wrap content-start gap-1.5">
              {displaySubjects.map((subject, idx) => (
                <span
                  key={idx}
                  className={`rounded-full border border-green-200 bg-green-50 font-medium text-itutor-green ${compact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'}`}
                >
                  {subject.name}
                </span>
              ))}
              {remainingCount > 0 && (
                <span
                  className={`rounded-full bg-gray-100 font-medium text-gray-600 ${compact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'}`}
                >
                  +{remainingCount} more
                </span>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* CTA Button */}
      <Link
        href={`/tutors/${id}`}
        className={`mt-auto block w-full shrink-0 rounded-xl bg-gradient-to-r from-itutor-green to-emerald-500 text-center font-bold text-white transition-all duration-300 hover:scale-105 hover:shadow-lg ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-3'}`}
      >
        View Profile
      </Link>
    </div>
  );
}




