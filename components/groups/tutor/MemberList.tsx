'use client';

import { useState } from 'react';
import type { GroupMember } from '@/lib/types/groups';

interface MemberListProps {
  groupId: string;
  members: GroupMember[];
  onRefresh: () => void;
}

function MemberAvatar({ member }: { member: GroupMember }) {
  const name = member.profile?.full_name ?? 'Member';
  return (
    <div className="flex-shrink-0 w-9 h-9 rounded-full overflow-hidden">
      {member.profile?.avatar_url ? (
        <img src={member.profile.avatar_url} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white text-sm font-semibold">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

export default function MemberList({ groupId, members, onRefresh }: MemberListProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const pending = members.filter((m) => m.status === 'pending');
  const approved = members.filter((m) => m.status === 'approved');

  const handleDecide = async (userId: string, status: 'approved' | 'denied') => {
    setActionLoading(userId);
    try {
      await fetch(`/api/groups/${groupId}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      onRefresh();
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!confirm('Remove this member?')) return;
    setActionLoading(userId);
    try {
      await fetch(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' });
      onRefresh();
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Pending requests */}
      {pending.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">
            Pending Requests ({pending.length})
          </h4>
          <div className="space-y-2">
            {pending.map((m) => (
              <div key={m.id} className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
                <MemberAvatar member={m} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {m.profile?.full_name ?? 'Unknown'}
                  </p>
                  <p className="text-xs text-gray-400">Requested to join</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleDecide(m.user_id, 'approved')}
                    disabled={actionLoading === m.user_id}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleDecide(m.user_id, 'denied')}
                    disabled={actionLoading === m.user_id}
                    className="px-3 py-1.5 bg-white hover:bg-red-50 border border-gray-200 hover:border-red-300 text-gray-600 hover:text-red-600 disabled:opacity-50 text-xs font-medium rounded-lg transition-colors"
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approved members */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Members ({approved.length})
        </h4>
        {approved.length === 0 ? (
          <p className="text-sm text-gray-400">No approved members yet.</p>
        ) : (
          <div className="space-y-2">
            {approved.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <MemberAvatar member={m} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {m.profile?.full_name ?? 'Unknown'}
                  </p>
                  <p className="text-xs text-gray-400">
                    Joined {new Date(m.joined_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(m.user_id)}
                  disabled={actionLoading === m.user_id}
                  className="text-xs text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
