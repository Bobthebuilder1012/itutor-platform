'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { getDisplayName } from '@/lib/utils/displayName';
import { getAvatarColor } from '@/lib/utils/avatarColors';
import type { CommunityMembershipV2WithProfile } from '@/lib/types/communities';

type ViewerRole = 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin';

function getProfileHref(userId: string, memberRole: string | null | undefined, viewerRole: ViewerRole | null): string {
  const role = (memberRole ?? '').toLowerCase();
  if (role === 'tutor') {
    if (viewerRole === 'student') return `/student/tutors/${userId}`;
    if (viewerRole === 'parent') return `/parent/tutors/${userId}`;
    return `/tutors/${userId}`;
  }
  return `/profile/${userId}`;
}

function MemberAvatar({
  avatarUrl,
  initial,
  userId,
}: { avatarUrl: string | null | undefined; initial: string; userId: string }) {
  const [failed, setFailed] = useState(false);
  const showImg = avatarUrl && !failed;
  useEffect(() => {
    setFailed(false);
  }, [avatarUrl]);
  return (
    <div
      className={`h-8 w-8 flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center ${
        showImg ? 'bg-gray-200' : `bg-gradient-to-br ${getAvatarColor(userId)}`
      }`}
    >
      {showImg ? (
        <Image
          src={avatarUrl}
          alt=""
          width={32}
          height={32}
          className="h-8 w-8 object-cover"
          unoptimized={avatarUrl?.includes('supabase')}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-sm font-bold text-white">{initial}</span>
      )}
    </div>
  );
}

interface MembersSidebarProps {
  communityId: string;
  className?: string;
  initialMembers?: CommunityMembershipV2WithProfile[];
  edge?: boolean;
  currentUserRole?: ViewerRole | null;
}

export default function MembersSidebar({
  communityId,
  className = '',
  initialMembers,
  edge = false,
  currentUserRole = null,
}: MembersSidebarProps) {
  const [members, setMembers] = useState<CommunityMembershipV2WithProfile[]>(initialMembers ?? []);
  const [loading, setLoading] = useState(!initialMembers);

  useEffect(() => {
    if (initialMembers != null) {
      setMembers(initialMembers);
      setLoading(false);
      return;
    }
    supabase
      .from('community_memberships_v2')
      .select('*, profile:profiles(id, full_name, username, avatar_url, role)')
      .eq('community_id', communityId)
      .eq('status', 'ACTIVE')
      .order('joined_at')
      .then(({ data }) => {
        setMembers((data as CommunityMembershipV2WithProfile[]) ?? []);
        setLoading(false);
      });
  }, [communityId, initialMembers]);

  const displayName = (m: CommunityMembershipV2WithProfile) =>
    getDisplayName(m.profile as { full_name?: string; username?: string; display_name?: string });
  const initial = (m: CommunityMembershipV2WithProfile) => displayName(m).charAt(0).toUpperCase() || '?';

  const students = members.filter((m) => (m.profile?.role ?? '').toLowerCase() === 'student');
  const itutors = members.filter((m) => (m.profile?.role ?? '').toLowerCase() !== 'student');

  const renderMember = (m: CommunityMembershipV2WithProfile) => {
    const href = getProfileHref(m.user_id, m.profile?.role, currentUserRole);
    return (
      <li key={m.id} className="flex-shrink-0">
        <Link
          href={href}
          className="flex items-center gap-2 rounded-lg px-1 py-0.5 -mx-1 hover:bg-gray-200/80 transition-colors"
        >
          <MemberAvatar
            avatarUrl={m.profile?.avatar_url}
            initial={initial(m)}
            userId={m.user_id}
          />
          <span className="text-sm text-gray-900 truncate min-w-0">
            {displayName(m)}
          </span>
          {m.role === 'ADMIN' && (
            <span className="text-xs text-amber-600 font-medium flex-shrink-0">Admin</span>
          )}
        </Link>
      </li>
    );
  };

  const asideClass = edge
    ? `w-56 flex-shrink-0 flex flex-col bg-transparent p-3 min-h-0 flex-1 ${className}`
    : `w-56 flex-shrink-0 flex flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-sm max-h-[70vh] ${className}`;
  return (
    <aside className={asideClass}>
      <h3 className="text-sm font-semibold text-gray-700 mb-2 flex-shrink-0">Members</h3>
      {loading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : (
        <div className="overflow-y-auto min-h-0 flex-1 pr-1 space-y-3">
          {students.length > 0 && (
            <section>
              <h4 className={`text-xs font-semibold text-itutor-green uppercase tracking-wide mb-1.5 sticky top-0 py-0.5 ${edge ? 'bg-gray-50/80' : 'bg-white'}`}>
                Students
              </h4>
              <ul className="space-y-2">{students.map(renderMember)}</ul>
            </section>
          )}
          {itutors.length > 0 && (
            <section>
              <h4 className={`text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1.5 sticky top-0 py-0.5 ${edge ? 'bg-gray-50/80' : 'bg-white'}`}>
                iTutors
              </h4>
              <ul className="space-y-2">{itutors.map(renderMember)}</ul>
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
