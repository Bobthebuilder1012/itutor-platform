'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  getMessages,
  sendMessage,
  markMessagesAsRead,
  subscribeToMessages,
  getConversationWithStatus,
  acceptConversationRequest,
  declineConversationRequest,
} from '@/lib/services/notificationService';
import type { MessageWithSender } from '@/lib/types/notifications';
import { getDisplayName } from '@/lib/utils/displayName';
import { formatTime } from '@/lib/utils/calendar';
import { supabase } from '@/lib/supabase/client';
import { getAvatarColor } from '@/lib/utils/avatarColors';
import { uploadMessageAttachment } from '@/lib/utils/messageAttachments';
import MessageInputBar from '@/components/MessageInputBar';

interface ConversationViewProps {
  conversationId: string;
  currentUserId: string;
  otherUserId: string;
}

export default function ConversationView({
  conversationId,
  currentUserId,
  otherUserId
}: ConversationViewProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [conversationStatus, setConversationStatus] = useState<Awaited<ReturnType<typeof getConversationWithStatus>>>(null);
  const [acceptDeclineLoading, setAcceptDeclineLoading] = useState(false);
  const [attachmentDraft, setAttachmentDraft] = useState<{ file?: File; voiceBlob?: Blob } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const isStudentStudentPending =
    conversationStatus?.status === 'PENDING' &&
    (conversationStatus.participant_1_role ?? '').toLowerCase() === 'student' &&
    (conversationStatus.participant_2_role ?? '').toLowerCase() === 'student';
  const amInitiator = conversationStatus?.initiated_by_id === currentUserId;
  const amReceiver = isStudentStudentPending && !amInitiator;
  const canChat =
    conversationStatus == null ||
    conversationStatus.status === 'ACCEPTED' ||
    conversationStatus.status === null;
  const showRequestReceiverUI = isStudentStudentPending && amReceiver;
  const showRequestInitiatorUI = isStudentStudentPending && amInitiator;

  useEffect(() => {
    loadConversationStatus();
    loadMessages();
    loadOtherUser();

    // Mark messages as read when viewing
    markMessagesAsRead(conversationId, currentUserId);

    // Subscribe to new messages
    const subscription = subscribeToMessages(conversationId, async (message) => {
      // Fetch sender info for the new message
      const { data: sender } = await supabase
        .from('profiles')
        .select('id, username, display_name, full_name, avatar_url')
        .eq('id', message.sender_id)
        .single();

      if (sender) {
        const enrichedMessage: MessageWithSender = {
          ...message,
          sender,
          is_own_message: message.sender_id === currentUserId
        };
        setMessages(prev => [...prev, enrichedMessage]);
        
        // Mark as read if not sent by current user
        if (message.sender_id !== currentUserId) {
          await markMessagesAsRead(conversationId, currentUserId);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [conversationId, currentUserId]);

  async function loadConversationStatus() {
    try {
      const conv = await getConversationWithStatus(conversationId);
      setConversationStatus(conv);
    } catch (e) {
      console.error('Error loading conversation status:', e);
    }
  }

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  async function loadMessages() {
    setLoading(true);
    try {
      console.log('🔄 Loading messages for conversation:', conversationId);
      const data = await getMessages(conversationId, currentUserId);
      console.log('📨 Loaded messages:', data.length);
      setMessages(data);
      
      if (data.length === 0) {
        console.warn('⚠️ No messages found for this conversation');
        console.log('Conversation ID:', conversationId);
        console.log('Current User ID:', currentUserId);
      }
    } catch (error) {
      console.error('❌ Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadOtherUser() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, full_name, avatar_url, role')
        .eq('id', otherUserId)
        .single();

      if (error) throw error;
      setOtherUser(data);
    } catch (error) {
      console.error('Error loading other user:', error);
    }
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  async function handleSendMessage() {
    const hasText = newMessage.trim();
    const hasFile = attachmentDraft?.file;
    const hasVoice = attachmentDraft?.voiceBlob;
    if ((!hasText && !hasFile && !hasVoice) || sending) return;
    setSending(true);
    try {
      let attachmentUrl: string | null = null;
      let attachmentType: 'image' | 'file' | 'voice' | null = null;
      let attachmentName: string | null = null;

      if (hasFile) {
        const f = attachmentDraft!.file!;
        const isImage = f.type.startsWith('image/');
        const { url, name } = await uploadMessageAttachment(currentUserId, f, isImage ? 'image' : 'file', f.name);
        attachmentUrl = url;
        attachmentType = isImage ? 'image' : 'file';
        attachmentName = name;
      } else if (hasVoice) {
        const { url, name } = await uploadMessageAttachment(currentUserId, attachmentDraft!.voiceBlob!, 'voice');
        attachmentUrl = url;
        attachmentType = 'voice';
        attachmentName = name;
      }

      await sendMessage(conversationId, currentUserId, newMessage.trim() || '', {
        attachmentUrl: attachmentUrl || undefined,
        attachmentType: attachmentType || undefined,
        attachmentName: attachmentName || undefined,
      });
      setNewMessage('');
      setAttachmentDraft(null);
      await loadConversationStatus();
    } catch (error: any) {
      console.error('Error sending message:', error);
      alert(error?.message ?? 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  }

  async function sendWithVoiceBlob(blob: Blob) {
    if (sending) return;
    setSending(true);
    try {
      const { url, name } = await uploadMessageAttachment(currentUserId, blob, 'voice');
      await sendMessage(conversationId, currentUserId, '', {
        attachmentUrl: url,
        attachmentType: 'voice',
        attachmentName: name,
      });
      setNewMessage('');
      setAttachmentDraft(null);
      await loadConversationStatus();
    } catch (error: any) {
      console.error('Error sending voice message:', error);
      alert(error?.message ?? 'Failed to send voice note.');
    } finally {
      setSending(false);
    }
  }

  async function handleAcceptRequest() {
    setAcceptDeclineLoading(true);
    try {
      await acceptConversationRequest(conversationId, currentUserId);
      await loadConversationStatus();
    } catch (err: any) {
      alert(err?.message ?? 'Could not accept request.');
    } finally {
      setAcceptDeclineLoading(false);
    }
  }

  async function handleDeclineRequest() {
    setAcceptDeclineLoading(true);
    try {
      await declineConversationRequest(conversationId, currentUserId);
      await loadConversationStatus();
    } catch (err: any) {
      alert(err?.message ?? 'Could not decline request.');
    } finally {
      setAcceptDeclineLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 bg-gray-50">
        <button
          onClick={() => router.back()}
          className="text-gray-600 hover:text-gray-900 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>

        {otherUser && (
          <>
            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(otherUser.id)} flex items-center justify-center text-white font-bold`}>
              {otherUser.avatar_url ? (
                <img src={otherUser.avatar_url} alt={getDisplayName(otherUser)} className="w-full h-full rounded-full object-cover" />
              ) : (
                getDisplayName(otherUser).charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-900">{getDisplayName(otherUser)}</h2>
              <p className="text-xs text-gray-500 capitalize">{otherUser.role}</p>
            </div>
            
            {/* Refresh Button */}
            <button
              onClick={() => loadMessages()}
              className="text-gray-500 hover:text-itutor-green transition-colors p-2 hover:bg-gray-200 rounded-lg"
              title="Refresh messages"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50"
        style={{ scrollBehavior: 'smooth' }}
      >
        {messages.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-gray-700">No messages yet</p>
            <p className="text-sm text-gray-500 mt-2">Send a message to start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.is_own_message ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex items-end gap-2 max-w-[70%] ${message.is_own_message ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                {!message.is_own_message && (
                  <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(message.sender.id)} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
                    {message.sender.avatar_url ? (
                      <img src={message.sender.avatar_url} alt={getDisplayName(message.sender)} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      getDisplayName(message.sender).charAt(0).toUpperCase()
                    )}
                  </div>
                )}

                {/* Message Bubble */}
                <div>
                  <div
                    className={`
                      px-4 py-2 rounded-2xl
                      ${message.is_own_message
                        ? 'bg-gradient-to-r from-itutor-green to-emerald-600 text-white rounded-br-none'
                        : 'bg-white border border-gray-200 text-gray-900 rounded-bl-none shadow-sm'
                      }
                    `}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                  </div>
                  <p
                    className={`text-xs text-gray-500 mt-1 ${message.is_own_message ? 'text-right' : 'text-left'}`}
                  >
                    {formatTime(message.created_at)}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message request: receiver can accept or decline */}
      {showRequestReceiverUI && (
        <div className="border-t border-gray-200 p-4 bg-amber-50">
          <p className="text-sm text-gray-700 mb-3">Accept this message request to start chatting.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAcceptRequest}
              disabled={acceptDeclineLoading}
              className="px-4 py-2 rounded-lg bg-itutor-green text-white font-medium text-sm hover:opacity-90 disabled:opacity-50"
            >
              {acceptDeclineLoading ? '…' : 'Accept'}
            </button>
            <button
              type="button"
              onClick={handleDeclineRequest}
              disabled={acceptDeclineLoading}
              className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Message request: initiator waiting */}
      {showRequestInitiatorUI && (
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <p className="text-sm text-gray-600">
            Waiting for {otherUser ? getDisplayName(otherUser) : 'them'} to accept your message request.
          </p>
        </div>
      )}

      {/* Declined request */}
      {conversationStatus?.status === 'DECLINED' && (
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <p className="text-sm text-gray-600">This message request was declined.</p>
        </div>
      )}

      {canChat && (
        <MessageInputBar
          value={newMessage}
          onChange={setNewMessage}
          onSubmit={handleSendMessage}
          placeholder="Type a message..."
          disabled={false}
          sending={sending}
          onFileSelect={(file) => setAttachmentDraft((d) => ({ ...d, file, voiceBlob: undefined }))}
          onVoiceRecord={(blob) => setAttachmentDraft((d) => ({ ...d, voiceBlob: blob, file: undefined }))}
          onVoiceRecordAndSend={sendWithVoiceBlob}
          attachmentPreview={
            attachmentDraft?.file
              ? { name: attachmentDraft.file.name, type: attachmentDraft.file.type.startsWith('image/') ? 'image' : 'file' }
              : attachmentDraft?.voiceBlob
                ? { name: 'Voice note', type: 'voice' }
                : null
          }
          onClearAttachment={() => setAttachmentDraft(null)}
        />
      )}
    </div>
  );
}














