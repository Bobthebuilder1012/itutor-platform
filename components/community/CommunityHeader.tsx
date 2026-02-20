'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { ensureSchoolCommunityAndMembership } from '@/lib/actions/community';
import type { SchoolCommunityWithSchool } from '@/lib/types/community-v2';
import type { SchoolCommunityMembership } from '@/lib/types/community-v2';

interface CommunityHeaderProps {
  community: SchoolCommunityWithSchool;
  membership: SchoolCommunityMembership | null;
  onMuteChange: () => void;
  onLeave: () => void;
  onRejoin: () => void;
}

export default function CommunityHeader({ community, membership, onMuteChange, onLeave, onRejoin }: CommunityHeaderProps) {
  const [muting, setMuting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [rejoining, setRejoining] = useState(false);
  const [error, setError] = useState('');

  const schoolName = community.school?.name ?? 'School';

  const handleMuteToggle = async () => {
    if (!membership || muting) return;
    setMuting(true);
    setError('');
    const { error: e } = await supabase
      .from('school_community_memberships')
      .update({ muted: !membership.muted })
      .eq('id', membership.id);
    setMuting(false);
    if (e) setError(e.message);
    else onMuteChange();
  };

  const handleLeave = async () => {
    if (!membership || leaving) return;
    setLeaving(true);
    setError('');
    const { error: e } = await supabase
      .from('school_community_memberships')
      .update({ status: 'LEFT', left_at: new Date().toISOString() })
      .eq('id', membership.id);
    setLeaving(false);
    if (e) setError(e.message);
    else onLeave();
  };

  const handleRejoin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || rejoining) return;
    setRejoining(true);
    setError('');
    const result = await ensureSchoolCommunityAndMembership(user.id);
    setRejoining(false);
    if (result.success) onRejoin();
    else setError(result.error ?? 'Could not rejoin');
  };

  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-gray-900">{community.name}</h1>
      {community.description && <p className="text-gray-600 mt-1">{community.description}</p>}
      <p className="text-sm text-gray-500 mt-2">You are in: {schoolName} Community</p>
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      <div className="flex flex-wrap gap-3 mt-3">
        {membership ? (
          <>
            <button
              type="button"
              onClick={handleMuteToggle}
              disabled={muting}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {membership.muted ? 'Unmute' : 'Mute'}
            </button>
            {membership.status === 'ACTIVE' ? (
              <button
                type="button"
                onClick={handleLeave}
                disabled={leaving}
                className="px-3 py-1.5 text-sm border border-red-200 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                Leave
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRejoin}
                disabled={rejoining}
                className="px-3 py-1.5 text-sm bg-itutor-green text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                Rejoin
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={handleRejoin}
            disabled={rejoining}
            className="px-3 py-1.5 text-sm bg-itutor-green text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            Join
          </button>
        )}
      </div>
    </div>
  );
}
