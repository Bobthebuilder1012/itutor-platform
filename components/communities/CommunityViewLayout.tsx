'use client';

import { useState } from 'react';
import Link from 'next/link';
import type {
  CommunityV2WithInstitution,
  CommunityMembershipV2WithProfile,
} from '@/lib/types/communities';
import MessageFeed from './MessageFeed';
import MessageComposer from './MessageComposer';
import MembersSidebar from './MembersSidebar';
import PinnedSection from './PinnedSection';
import FavoritesView from './FavoritesView';

type ViewTab = 'feed' | 'favorites';

interface CommunityViewLayoutProps {
  community: CommunityV2WithInstitution;
  communityId: string;
  canPost: boolean;
  isAdmin: boolean;
  currentUserId: string | null;
  currentUserRole?: 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin' | null;
  onRefresh?: () => void;
  initialMembers?: CommunityMembershipV2WithProfile[];
}

export default function CommunityViewLayout({
  community,
  communityId,
  canPost,
  isAdmin,
  currentUserId,
  currentUserRole = null,
  onRefresh,
  initialMembers,
}: CommunityViewLayoutProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [feedVersion, setFeedVersion] = useState(0);
  const [tab, setTab] = useState<ViewTab>('feed');

  return (
    <div className="flex flex-1 min-h-0 gap-0 w-full h-full">
      <aside className="w-48 flex-shrink-0 flex flex-col border-r border-gray-200 bg-gray-50/80 min-h-0 overflow-hidden">
        <h3 className="text-sm font-semibold text-gray-700 mb-2 flex-shrink-0 p-3 pb-0">Chats</h3>
        <ul className="flex-1 min-h-0 overflow-y-auto space-y-1 px-3 py-2">
          <li>
            <span className="block rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-900">
              General
            </span>
          </li>
        </ul>
      </aside>
      <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-white overflow-hidden">
        <div className="flex-shrink-0 px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 mb-2">
            <Link
              href="/communities"
              className="text-sm text-gray-500 hover:text-itutor-green"
            >
              ← Communities
            </Link>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{community.name}</h2>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="search"
              placeholder="Search messages…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-itutor-green focus:ring-1 focus:ring-itutor-green"
            />
            <button
              type="button"
              onClick={() => setTab(tab === 'favorites' ? 'feed' : 'favorites')}
              className={`rounded-xl px-3 py-2 text-sm font-medium ${
                tab === 'favorites'
                  ? 'bg-itutor-green text-white'
                  : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Favorites
            </button>
          </div>
          <PinnedSection communityId={communityId} className="mb-2" />
        </div>
        {tab === 'feed' ? (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-4">
              <MessageFeed
                communityId={communityId}
                canPost={canPost}
                isAdmin={isAdmin}
                currentUserId={currentUserId}
                refreshTrigger={feedVersion}
                searchQuery={searchQuery}
              />
            </div>
            {canPost && (
              <div className="flex-shrink-0 px-4 py-3 bg-white border-t border-gray-100">
                <MessageComposer
                  communityId={communityId}
                  onPosted={() => setFeedVersion((v) => v + 1)}
                />
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto px-4">
            <FavoritesView communityId={communityId} />
          </div>
        )}
      </div>
      <aside className="w-56 flex-shrink-0 flex flex-col border-l border-gray-200 bg-gray-50/80 min-h-0 overflow-hidden">
        <MembersSidebar communityId={communityId} initialMembers={initialMembers} edge currentUserRole={currentUserRole} />
      </aside>
    </div>
  );
}
