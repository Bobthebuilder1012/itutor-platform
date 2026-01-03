'use client';

import Link from 'next/link';
import { Community } from '@/lib/types/community';

interface CommunityCardProps {
  community: Community;
  isMember?: boolean;
  onJoin?: () => void;
  onLeave?: () => void;
  isLoading?: boolean;
}

export default function CommunityCard({
  community,
  isMember = false,
  onJoin,
  onLeave,
  isLoading = false,
}: CommunityCardProps) {
  const getTypeLabel = () => {
    switch (community.type) {
      case 'school':
        return 'School Community';
      case 'school_form':
        return 'Form Community';
      case 'subject_qa':
        return 'Subject Q&A';
      default:
        return '';
    }
  };

  const getAudienceLabel = () => {
    switch (community.audience) {
      case 'students':
        return 'Students';
      case 'itutors':
        return 'iTutors';
      case 'mixed':
        return 'Students & iTutors';
      default:
        return '';
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 hover:border-itutor-green/30 transition-all p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <Link
            href={`/communities/${community.id}`}
            className="text-lg font-semibold text-gray-900 hover:text-itutor-green transition-colors"
          >
            {community.name}
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
              {getTypeLabel()}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
              {getAudienceLabel()}
            </span>
          </div>
        </div>
        {community.image_url && (
          <img
            src={community.image_url}
            alt={community.name}
            className="w-12 h-12 rounded-lg object-cover ml-3"
          />
        )}
      </div>

      {/* Description */}
      {community.description && (
        <p className="text-sm text-gray-600 mb-4 line-clamp-2 flex-1">
          {community.description}
        </p>
      )}

      {/* Tags */}
      <div className="flex items-center gap-2 mb-4 text-xs text-gray-500">
        {community.level_tag && (
          <span className="px-2 py-1 rounded bg-gray-100">{community.level_tag}</span>
        )}
        {community.subject?.name && (
          <span className="px-2 py-1 rounded bg-gray-100">{community.subject.name}</span>
        )}
        {community.form_level && (
          <span className="px-2 py-1 rounded bg-gray-100">{community.form_level}</span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <div className="text-sm text-gray-500">
          {community.member_count !== undefined && (
            <span>
              {community.member_count} {community.member_count === 1 ? 'member' : 'members'}
            </span>
          )}
        </div>

        {/* Action Button */}
        {community.is_auto ? (
          <span className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600">
            Auto-assigned
          </span>
        ) : isMember ? (
          <button
            onClick={onLeave}
            disabled={isLoading}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Leaving...' : 'Leave'}
          </button>
        ) : (
          <button
            onClick={onJoin}
            disabled={isLoading}
            className="text-xs px-3 py-1.5 rounded-lg bg-itutor-green text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Joining...' : 'Join'}
          </button>
        )}
      </div>
    </div>
  );
}






