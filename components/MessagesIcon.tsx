'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

interface MessagesIconProps {
  userId: string;
  role: 'student' | 'tutor' | 'parent' | 'reviewer' | 'admin';
}

export default function MessagesIcon({ userId, role }: MessagesIconProps) {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadUnreadCount();

    // Subscribe to real-time message updates
    const subscription = supabase
      .channel(`messages_count:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        async (payload: any) => {
          // Check if this message is for the current user
          const { data: conversation } = await supabase
            .from('conversations')
            .select('participant_1_id, participant_2_id')
            .eq('id', payload.new.conversation_id)
            .single();

          if (conversation && 
              (conversation.participant_1_id === userId || conversation.participant_2_id === userId) &&
              payload.new.sender_id !== userId) {
            await loadUnreadCount();
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [userId]);

  async function loadUnreadCount() {
    try {
      // Get all conversations for this user
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id')
        .or(`participant_1_id.eq.${userId},participant_2_id.eq.${userId}`);

      if (!conversations || conversations.length === 0) {
        setUnreadCount(0);
        return;
      }

      const conversationIds = conversations.map(c => c.id);

      // Count unread messages in these conversations
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .in('conversation_id', conversationIds)
        .eq('is_read', false)
        .neq('sender_id', userId);

      setUnreadCount(count || 0);
    } catch (error) {
      console.error('Error loading unread count:', error);
    }
  }

  function handleClick() {
    const path = role === 'student' ? '/student/messages' : 
                 role === 'tutor' ? '/tutor/messages' : 
                 '/parent/messages';
    router.push(path);
  }

  return (
    <button
      onClick={handleClick}
      className="relative p-2 text-gray-400 hover:text-itutor-white transition-colors rounded-lg hover:bg-gray-800"
    >
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
      
      {/* Unread Badge */}
      {unreadCount > 0 && (
        <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-blue-500 rounded-full">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}

