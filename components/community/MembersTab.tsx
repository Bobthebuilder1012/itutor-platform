'use client';

import { useEffect, useState } from 'react';
import { getCommunityMembers } from '@/lib/supabase/community-v2';
import { getDisplayName } from '@/lib/utils/displayName';

interface MembersTabProps {
  communityId: string;
}

type Member = Awaited<ReturnType<typeof getCommunityMembers>>[number];

export default function MembersTab({ communityId }: MembersTabProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCommunityMembers(communityId, { limit: 100 }).then(setMembers).finally(() => setLoading(false));
  }, [communityId]);

  if (loading) return <p className="text-gray-500">Loading members...</p>;
  if (members.length === 0) return <p className="text-gray-500">No members.</p>;

  return (
    <ul className="space-y-2">
      {members.map((m) => (
        <li key={m.id} className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0">
          <span className="font-medium text-gray-900">
            {m.profile ? getDisplayName(m.profile as { full_name?: string; username?: string }) : 'Unknown'}
          </span>
          {m.role === 'ADMIN' && (
            <span className="text-xs px-2 py-0.5 bg-gray-200 rounded">Admin</span>
          )}
        </li>
      ))}
    </ul>
  );
}
