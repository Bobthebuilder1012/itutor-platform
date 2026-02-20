import { Profile } from './database';

// ==================== NOTIFICATION TYPES ====================

export type NotificationType = 
  | 'booking_request'
  | 'booking_accepted'
  | 'booking_declined'
  | 'booking_counter_offer'
  | 'booking_cancelled'
  | 'new_message'
  | 'payment_received'
  | 'session_reminder'
  | 'rating_received'
  | 'verification_complete';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  is_read: boolean;
  created_at: string;
  related_booking_id?: string;
  related_conversation_id?: string;
}

// ==================== CONVERSATION & MESSAGE TYPES ====================

export type ConversationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | null;

export interface Conversation {
  id: string;
  participant_1_id: string;
  participant_2_id: string;
  created_at: string;
  last_message_at?: string;
  last_message_preview?: string;
  status?: ConversationStatus;
  initiated_by_id?: string | null;
}

export interface ConversationWithParticipant extends Conversation {
  other_participant: Partial<Profile>;
  unread_count: number;
}

export type MessageAttachmentType = 'image' | 'file' | 'voice';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  attachment_url?: string | null;
  attachment_type?: MessageAttachmentType | null;
  attachment_name?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface MessageWithSender extends Message {
  sender: Partial<Profile>;
  is_own_message: boolean;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Get icon emoji for notification type
 */
export function getNotificationIcon(type: NotificationType): string {
  switch (type) {
    case 'booking_request':
      return '📅';
    case 'booking_accepted':
      return '✅';
    case 'booking_declined':
      return '❌';
    case 'booking_counter_offer':
      return '🔄';
    case 'booking_cancelled':
      return '🚫';
    case 'new_message':
      return '💬';
    case 'payment_received':
      return '💰';
    case 'session_reminder':
      return '⏰';
    case 'rating_received':
      return '⭐';
    case 'verification_complete':
      return '🎉';
    default:
      return '🔔';
  }
}

/**
 * Get color for notification type
 */
export function getNotificationColor(type: NotificationType): string {
  switch (type) {
    case 'booking_request':
    case 'booking_counter_offer':
      return 'bg-blue-500/20 text-blue-400';
    case 'booking_accepted':
    case 'verification_complete':
      return 'bg-green-500/20 text-green-400';
    case 'booking_declined':
    case 'booking_cancelled':
      return 'bg-red-500/20 text-red-400';
    case 'new_message':
      return 'bg-purple-500/20 text-purple-400';
    case 'payment_received':
      return 'bg-yellow-500/20 text-yellow-400';
    case 'session_reminder':
      return 'bg-orange-500/20 text-orange-400';
    case 'rating_received':
      return 'bg-pink-500/20 text-pink-400';
    default:
      return 'bg-gray-500/20 text-gray-400';
  }
}
