'use client';

import type { GroupWithTutor } from '@/lib/types/groups';
import { getDefaultThumbnail, deterministicDefault, isDefaultThumbnail, type DefaultThumbnail } from '@/lib/defaultThumbnails';

interface GroupGridCardProps {
  group: GroupWithTutor;
  onClick: () => void;
  onAskToJoin?: () => void;
  joining?: boolean;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function GroupGridCard({ group, onClick, onAskToJoin }: GroupGridCardProps) {
  const tutorName = group.tutor?.full_name ?? 'Tutor';
  const tutorRating = group.tutor?.rating_average;
  const tutorReviewCount = group.tutor?.rating_count ?? 0;
  const coverImage =
    (group as any).cover_image ??
    (group as any).coverImage ??
    (group as any).header_image ??
    (group as any).headerImage ??
    null;
  const subjects: string[] =
    (group as any).subject_list?.length > 0
      ? (group as any).subject_list
      : group.subject
      ? [group.subject]
      : [];
  const membershipStatus = group.current_user_membership?.status;
  const isManageCard = !onAskToJoin && membershipStatus !== 'approved' && membershipStatus !== 'pending';
  const sessionLengthMinutes =
    (group as any).sessionLengthMinutes ?? (group as any).session_length_minutes ?? null;
  const pricingMode =
    ((group as any).pricing_mode as string | undefined) ??
    (group.pricing_model === 'PER_SESSION'
      ? 'PER_SESSION'
      : group.pricing_model === 'MONTHLY'
        ? 'PER_COURSE'
        : (group.pricing_model as string | undefined) ?? 'FREE');
  const effectivePrice =
    pricingMode === 'PER_SESSION'
      ? (group as any).pricePerSession ?? (group as any).price_per_session ?? null
      : pricingMode === 'PER_COURSE'
        ? (group as any).pricePerCourse ?? (group as any).price_per_course ?? null
        : (group as any).pricePerSession ??
          (group as any).price_per_session ??
          (group as any).pricePerCourse ??
          (group as any).price_per_course ??
          null;
  const isPaid =
    pricingMode !== 'FREE' && effectivePrice != null && Number(effectivePrice) > 0;
  const priceSuffix = pricingMode === 'PER_SESSION' ? '/session' : '/mo';
  const nextSession = group.next_occurrence
    ? new Date(group.next_occurrence.scheduled_start_at).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : null;
  const estimatedEarnings = Number((group as any).estimated_earnings ?? 0);
  const cap = group.max_students != null && group.max_students > 0 ? group.max_students : null;
  const enrolledCount = group.member_count ?? 0;
  const enrolledStudents = Math.max(0, enrolledCount - 1);
  const spotsLeft = cap != null ? Math.max(cap - enrolledStudents, 0) : null;
  const pctFull = cap && cap > 0 ? enrolledStudents / cap : 0;

  const hasCustomImage = coverImage && !isDefaultThumbnail(coverImage);
  const thumbnail: DefaultThumbnail =
    getDefaultThumbnail(coverImage) ?? deterministicDefault(group.id);

  const starCount = Math.round(Number(tutorRating ?? 0));
  const stars = '★'.repeat(Math.min(starCount, 5)) + '☆'.repeat(Math.max(5 - starCount, 0));
  const lengthDisplay = sessionLengthMinutes
    ? sessionLengthMinutes >= 60
      ? `${(sessionLengthMinutes / 60).toFixed(sessionLengthMinutes % 60 === 0 ? 0 : 1)} hrs`
      : `${sessionLengthMinutes} min`
    : 'N/A';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="group bg-white border border-gray-200 rounded-[14px] overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(0,0,0,0.08),0_4px_8px_rgba(0,0,0,0.04)] hover:border-emerald-500"
    >
      <div className="relative h-[140px] overflow-hidden">
        {hasCustomImage ? (
          <img src={coverImage} alt={group.name} className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: thumbnail.gradient }}
          >
            <div className="w-[60px] h-[60px] rounded-2xl flex items-center justify-center bg-white/35 backdrop-blur-sm shadow-[0_4px_14px_rgba(0,0,0,0.1)]">
              <thumbnail.Icon />
            </div>
          </div>
        )}
        <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap max-w-[85%]">
          {cap != null && spotsLeft !== null && spotsLeft > 0 && spotsLeft <= 5 && (
            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-orange-500/90 text-white backdrop-blur-sm">
              Only {spotsLeft} spot{spotsLeft === 1 ? '' : 's'} left
            </span>
          )}
          {cap != null && pctFull >= 0.8 && (
            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-rose-600/90 text-white backdrop-blur-sm">
              Filling fast
            </span>
          )}
          {membershipStatus === 'approved' && (
            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 backdrop-blur-sm">
              Member
            </span>
          )}
          {membershipStatus === 'pending' && (
            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 backdrop-blur-sm">
              Requested
            </span>
          )}
        </div>
        {subjects.length > 0 && (
          <div className="absolute bottom-3 left-3 flex gap-1.5 flex-wrap">
            {subjects.slice(0, 2).map((s) => (
              <span
                key={s}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white/90 backdrop-blur-sm text-gray-800"
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="p-[18px]">
        <h3 className="text-[17px] font-bold text-gray-900 mb-1 leading-snug line-clamp-2">
          {group.name}
        </h3>
        <p className="text-[12px] text-slate-500 mb-3">
          {enrolledStudents} student{enrolledStudents === 1 ? '' : 's'} enrolled
        </p>

        <div className="flex items-center gap-2.5 mb-3.5">
          {group.tutor?.avatar_url ? (
            <img
              src={group.tutor.avatar_url}
              alt={tutorName}
              className="w-[30px] h-[30px] rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-[30px] h-[30px] rounded-full bg-emerald-500 text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0">
              {getInitials(tutorName)}
            </div>
          )}
          <span className="text-[13px] font-medium text-slate-500 truncate">{tutorName}</span>
        </div>

        <div className="flex items-center gap-1 mb-4">
          <span className="text-amber-400 text-[13px]">{stars}</span>
          {tutorReviewCount > 0 && tutorRating != null ? (
            <span className="text-[12px] text-slate-500">
              {Number(tutorRating).toFixed(1)} ({tutorReviewCount} reviews)
            </span>
          ) : (
            <span className="text-[12px] text-slate-500">No reviews yet</span>
          )}
        </div>

        {isManageCard && (
          <div className="rounded-lg bg-emerald-50 px-3.5 py-2.5 flex justify-between items-center mb-3.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
              Earnings
            </span>
            <span className="text-lg font-extrabold text-emerald-700">
              ${estimatedEarnings.toFixed(2)}
            </span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-px bg-gray-200 rounded-lg overflow-hidden mb-3.5">
          <div className="bg-white py-2.5 px-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Members</p>
            <p className="text-sm font-bold text-gray-900">{group.member_count}</p>
          </div>
          <div className="bg-white py-2.5 px-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Next</p>
            <p className={`text-sm font-bold ${nextSession ? 'text-indigo-600' : 'text-red-500'}`}>
              {nextSession ?? 'Not scheduled'}
            </p>
          </div>
          <div className="bg-white py-2.5 px-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">Length</p>
            <p className="text-sm font-bold text-gray-900">{lengthDisplay}</p>
          </div>
        </div>

        <div className="flex justify-between items-center pt-3.5 border-t border-gray-200">
          <div className="flex gap-4">
            <span className="flex items-center gap-1.5 text-[12px] text-slate-500">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {lengthDisplay}
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-slate-500">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
              {group.member_count > 0 ? `${group.member_count} members` : 'No members yet'}
            </span>
          </div>
          <span className={`text-base font-extrabold ${isPaid ? 'text-indigo-600' : 'text-emerald-600'}`}>
            {isPaid ? `$${Number(effectivePrice)}${priceSuffix}` : 'Free'}
          </span>
        </div>
      </div>
    </div>
  );
}
