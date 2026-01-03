'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/useProfile';
import { getConversations } from '@/lib/services/notificationService';
import DashboardLayout from '@/components/DashboardLayout';
import { getDisplayName } from '@/lib/utils/displayName';
import type { ConversationWithParticipant } from '@/lib/types/notifications';
import { getRelativeTime } from '@/lib/utils/calendar';

export default function ParentMessagesPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  
  const [conversations, setConversations] = useState<ConversationWithParticipant[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<ConversationWithParticipant[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profileLoading) return;
    
    if (!profile || profile.role !== 'parent') {
      router.push('/login');
      return;
    }

    loadConversations();
  }, [profile, profileLoading, router]);

  useEffect(() => {
    // Filter conversations based on search and filter
    let filtered = conversations;

    // Apply unread filter
    if (filter === 'unread') {
      filtered = filtered.filter(c => c.unread_count > 0);
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => {
        const otherUserName = getDisplayName(c.other_participant).toLowerCase();
        const lastMessage = c.last_message_preview?.toLowerCase() || '';
        return otherUserName.includes(query) || lastMessage.includes(query);
      });
    }

    setFilteredConversations(filtered);
  }, [conversations, searchQuery, filter]);

  async function loadConversations() {
    if (!profile) return;

    setLoading(true);
    try {
      const data = await getConversations(profile.id);
      setConversations(data);
      setFilteredConversations(data);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setLoading(false);
    }
  }

  const unreadCount = conversations.filter(c => c.unread_count > 0).length;

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  return (
    <DashboardLayout role="parent" userName={getDisplayName(profile)}>
      <div className="px-4 py-6 sm:px-0 max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Messages</h1>
              <p className="text-gray-600">Conversations with iTutors about your children</p>
            </div>
            {unreadCount > 0 && (
              <div className="px-4 py-2 bg-red-100 border-2 border-red-300 rounded-lg">
                <p className="text-sm font-semibold text-red-800">
                  {unreadCount} unread {unreadCount === 1 ? 'conversation' : 'conversations'}
                </p>
              </div>
            )}
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Bar */}
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green outline-none transition"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-3 rounded-lg font-medium transition-all ${
                  filter === 'all'
                    ? 'bg-itutor-green text-white shadow-lg'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                All ({conversations.length})
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`px-4 py-3 rounded-lg font-medium transition-all ${
                  filter === 'unread'
                    ? 'bg-itutor-green text-white shadow-lg'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>
          </div>
        </div>

        {/* Conversations List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-itutor-green"></div>
            <span className="ml-3 text-gray-600">Loading messages...</span>
          </div>
        ) : filteredConversations.length === 0 ? (
          /* Empty State */
          <div className="text-center py-12 bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 rounded-2xl">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {searchQuery || filter === 'unread' ? (
              <>
                <p className="text-gray-600 mb-4 font-medium">No conversations found</p>
                <p className="text-sm text-gray-500">Try adjusting your search or filter</p>
              </>
            ) : (
              <>
                <p className="text-gray-600 mb-4 font-medium">No messages yet</p>
                <p className="text-sm text-gray-500">iTutors will be able to message you once sessions are booked!</p>
              </>
            )}
          </div>
        ) : (
          /* Conversations */
          <div className="space-y-3">
            {filteredConversations.map((conversation) => {
              const otherUser = conversation.other_participant;
              const hasUnread = conversation.unread_count > 0;

              return (
                <Link
                  key={conversation.id}
                  href={`/parent/messages/${conversation.id}`}
                  className={`
                    block bg-white border-2 rounded-xl p-4 
                    hover:shadow-lg transition-all duration-300 hover:scale-[1.01]
                    ${hasUnread ? 'border-itutor-green/50 bg-green-50/30' : 'border-gray-200'}
                  `}
                >
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white font-bold text-xl shadow-md">
                        {otherUser?.avatar_url ? (
                          <img src={otherUser.avatar_url} alt={getDisplayName(otherUser)} className="w-full h-full rounded-full object-cover" />
                        ) : (
                          getDisplayName(otherUser).charAt(0).toUpperCase()
                        )}
                      </div>
                      {hasUnread && (
                        <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg">
                          {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className={`text-lg font-semibold truncate ${hasUnread ? 'text-gray-900' : 'text-gray-700'}`}>
                          {getDisplayName(otherUser)}
                        </h3>
                        {conversation.last_message_at && (
                          <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                            {getRelativeTime(conversation.last_message_at)}
                          </span>
                        )}
                      </div>
                      {conversation.last_message_preview && (
                        <p className={`text-sm truncate ${hasUnread ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>
                          {conversation.last_message_preview}
                        </p>
                      )}
                      {otherUser?.role && (
                        <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full font-medium capitalize">
                          {otherUser.role}
                        </span>
                      )}
                    </div>

                    {/* Arrow */}
                    <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}





