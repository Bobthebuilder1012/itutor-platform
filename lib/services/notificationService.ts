import { supabase } from '@/lib/supabase/client';
import type { 
  Notification, 
  Message, 
  Conversation,
  MessageWithSender,
  ConversationWithParticipant,
  ConversationStatus
} from '@/lib/types/notifications';

// ==================== NOTIFICATIONS ====================

/**
 * Get all notifications for a user
 */
export async function getNotifications(
  userId: string,
  unreadOnly: boolean = false
): Promise<Notification[]> {
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching notifications:', error);
    throw error;
  }

  return data as Notification[];
}

/**
 * Get count of unread notifications
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) {
    console.error('Error fetching unread count:', error);
    throw error;
  }

  return count || 0;
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
}

/**
 * Subscribe to real-time notifications
 */
export function subscribeToNotifications(
  userId: string,
  callback: (notification: Notification) => void
) {
  return supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        callback(payload.new as Notification);
      }
    )
    .subscribe();
}

// ==================== CONVERSATIONS ====================

/**
 * Get or create a conversation between two users
 */
export async function getOrCreateConversation(
  userId1: string,
  userId2: string
): Promise<string> {
  // Try to find existing conversation
  const { data: existing, error: findError } = await supabase
    .from('conversations')
    .select('id')
    .or(`and(participant_1_id.eq.${userId1},participant_2_id.eq.${userId2}),and(participant_1_id.eq.${userId2},participant_2_id.eq.${userId1})`)
    .single();

  if (existing) {
    return existing.id;
  }

  // Create new conversation
  const { data: newConv, error: createError } = await supabase
    .from('conversations')
    .insert({
      participant_1_id: userId1,
      participant_2_id: userId2
    })
    .select('id')
    .single();

  if (createError) {
    console.error('Error creating conversation:', createError);
    throw createError;
  }

  return newConv.id;
}

export interface ConversationWithStatus extends Conversation {
  status: ConversationStatus;
  initiated_by_id: string | null;
  participant_1_role?: string | null;
  participant_2_role?: string | null;
}

/**
 * Get a single conversation with status and participant roles (for request UI)
 */
export async function getConversationWithStatus(
  conversationId: string
): Promise<ConversationWithStatus | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      participant_1:profiles!conversations_participant_1_id_fkey(id, role),
      participant_2:profiles!conversations_participant_2_id_fkey(id, role)
    `)
    .eq('id', conversationId)
    .single();

  if (error || !data) return null;
  const c = data as any;
  return {
    ...c,
    participant_1_role: c.participant_1?.role ?? null,
    participant_2_role: c.participant_2?.role ?? null,
  } as ConversationWithStatus;
}

/**
 * Accept a message request (receiver only). Sets conversation status to ACCEPTED.
 */
export async function acceptConversationRequest(
  conversationId: string,
  userId: string
): Promise<void> {
  const conv = await getConversationWithStatus(conversationId);
  if (!conv) throw new Error('Conversation not found');
  if (conv.status !== 'PENDING') throw new Error('No pending request');
  const receiverId = conv.initiated_by_id === conv.participant_1_id ? conv.participant_2_id : conv.participant_1_id;
  if (receiverId !== userId) throw new Error('Only the recipient can accept');
  const { error } = await supabase
    .from('conversations')
    .update({ status: 'ACCEPTED' })
    .eq('id', conversationId);
  if (error) throw error;
}

/**
 * Decline a message request (receiver only). Sets conversation status to DECLINED.
 */
export async function declineConversationRequest(
  conversationId: string,
  userId: string
): Promise<void> {
  const conv = await getConversationWithStatus(conversationId);
  if (!conv) throw new Error('Conversation not found');
  if (conv.status !== 'PENDING') throw new Error('No pending request');
  const receiverId = conv.initiated_by_id === conv.participant_1_id ? conv.participant_2_id : conv.participant_1_id;
  if (receiverId !== userId) throw new Error('Only the recipient can decline');
  const { error } = await supabase
    .from('conversations')
    .update({ status: 'DECLINED' })
    .eq('id', conversationId);
  if (error) throw error;
}

/**
 * Check if the current user can send a message in this conversation (student-student request flow).
 */
export async function canSendMessageInConversation(
  conversationId: string,
  senderId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const conv = await getConversationWithStatus(conversationId);
  if (!conv) return { allowed: false, reason: 'Conversation not found' };
  const status = conv.status ?? null;
  if (status === 'DECLINED') return { allowed: false, reason: 'This request was declined.' };
  if (status === 'ACCEPTED' || status === null) return { allowed: true };
  if (status !== 'PENDING') return { allowed: true };
  const isStudentStudent =
    (conv.participant_1_role ?? '').toLowerCase() === 'student' &&
    (conv.participant_2_role ?? '').toLowerCase() === 'student';
  if (!isStudentStudent) return { allowed: true };
  const { count } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);
  const messageCount = count ?? 0;
  if (messageCount === 0) {
    return { allowed: true };
  }
  const initiatedBy = conv.initiated_by_id;
  if (initiatedBy === senderId) {
    return { allowed: false, reason: 'Waiting for them to accept your message request.' };
  }
  return { allowed: false, reason: 'Accept the message request to continue chatting.' };
}

/**
 * Get all conversations for a user with participant details
 */
export async function getConversations(
  userId: string
): Promise<ConversationWithParticipant[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      participant_1:profiles!conversations_participant_1_id_fkey(id, username, display_name, full_name, avatar_url),
      participant_2:profiles!conversations_participant_2_id_fkey(id, username, display_name, full_name, avatar_url)
    `)
    .or(`participant_1_id.eq.${userId},participant_2_id.eq.${userId}`)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('Error fetching conversations:', error);
    throw error;
  }

  // Enrich with other participant and unread count
  const enriched = await Promise.all(
    data.map(async (conv: any) => {
      const otherParticipant = conv.participant_1_id === userId ? conv.participant_2 : conv.participant_1;
      
      // Get unread count
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .eq('is_read', false)
        .neq('sender_id', userId);

      return {
        ...conv,
        other_participant: otherParticipant,
        unread_count: count || 0
      } as ConversationWithParticipant;
    })
  );

  return enriched;
}

// ==================== MESSAGES ====================

/**
 * Get messages for a conversation with sender details
 */
export async function getMessages(
  conversationId: string,
  currentUserId: string
): Promise<MessageWithSender[]> {
  console.log('🔍 getMessages called:', { conversationId, currentUserId });
  
  // Fetch messages without join to avoid constraint violations
  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (messagesError) {
    console.error('❌ Error fetching messages:', messagesError);
    throw messagesError;
  }

  console.log('✅ Messages fetched:', messages?.length || 0, 'messages');

  if (!messages || messages.length === 0) {
    return [];
  }

  // Get unique sender IDs
  const senderIds = [...new Set(messages.map(m => m.sender_id))];
  
  // Fetch sender profiles separately
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, display_name, full_name, avatar_url')
    .in('id', senderIds);

  if (profilesError) {
    console.error('⚠️ Error fetching sender profiles:', profilesError);
    // Continue without profiles
  }

  // Create a map of profiles
  const profileMap = new Map(
    (profiles || []).map(p => [p.id, p])
  );

  // Enrich messages with sender info
  const enrichedMessages = messages.map((msg: any) => ({
    ...msg,
    sender: profileMap.get(msg.sender_id) || {
      id: msg.sender_id,
      username: 'Unknown',
      display_name: null,
      full_name: null,
      avatar_url: null
    },
    is_own_message: msg.sender_id === currentUserId
  })) as MessageWithSender[];

  console.log('📨 First message:', enrichedMessages[0]);

  return enrichedMessages;
}

export type SendMessageOptions = {
  attachmentUrl?: string | null;
  attachmentType?: 'image' | 'file' | 'voice' | null;
  attachmentName?: string | null;
};

/**
 * Send a message. For student-student, first message becomes a request (conversation set to PENDING).
 */
export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string,
  options?: SendMessageOptions
): Promise<Message> {
  const canSend = await canSendMessageInConversation(conversationId, senderId);
  if (!canSend.allowed) {
    throw new Error(canSend.reason ?? 'You cannot send a message in this conversation.');
  }

  const text = content.trim();
  const hasAttachment = options?.attachmentUrl?.trim();
  if (!text && !hasAttachment) {
    throw new Error('Message must have text or an attachment.');
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content: text || null,
      attachment_url: options?.attachmentUrl ?? null,
      attachment_type: options?.attachmentType ?? null,
      attachment_name: options?.attachmentName ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error sending message:', error);
    throw error;
  }

  const preview = (text || (hasAttachment ? (options?.attachmentType === 'voice' ? '🎤 Voice note' : '📎 Attachment') : '')).substring(0, 100);
  const now = new Date().toISOString();

  const { count } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);
  const messageCount = count ?? 0;

  const conv = await getConversationWithStatus(conversationId);
  const isStudentStudent =
    conv &&
    (conv.participant_1_role ?? '').toLowerCase() === 'student' &&
    (conv.participant_2_role ?? '').toLowerCase() === 'student';

  const updates: Record<string, unknown> = {
    last_message_at: now,
    last_message_preview: preview,
  };
  if (messageCount === 1 && isStudentStudent && conv && (conv.status ?? null) === null) {
    updates.status = 'PENDING';
    updates.initiated_by_id = senderId;
  }

  await supabase
    .from('conversations')
    .update(updates)
    .eq('id', conversationId);

  return data as Message;
}

/**
 * Mark messages in a conversation as read
 */
export async function markMessagesAsRead(
  conversationId: string,
  currentUserId: string
): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', currentUserId)
    .eq('is_read', false);

  if (error) {
    console.error('Error marking messages as read:', error);
    // Don't throw, this is not critical
  }
}

/**
 * Subscribe to new messages in a conversation
 */
export function subscribeToMessages(
  conversationId: string,
  callback: (message: Message) => void
) {
  return supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      },
      (payload) => {
        callback(payload.new as Message);
      }
    )
    .subscribe();
}

// ==================== UTILITIES ====================

/**
 * Request browser notification permission
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('Browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}
