'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getConversations, getMessages, sendMessage, markMessagesAsRead, subscribeToMessages } from '@/lib/services/notificationService';
import { supabase } from '@/lib/supabase/client';
import type { ConversationWithParticipant, MessageWithSender } from '@/lib/types/notifications';
import { getDisplayName } from '@/lib/utils/displayName';
import { getRelativeTime, formatTime } from '@/lib/utils/calendar';
import { getAvatarColor } from '@/lib/utils/avatarColors';

interface MessagesSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  role: 'student' | 'tutor' | 'parent';
}

export default function MessagesSidePanel({ isOpen, onClose, userId, role }: MessagesSidePanelProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationWithParticipant[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationWithParticipant | null>(null);
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [panelWidth, setPanelWidth] = useState<'normal' | 'wide' | 'full'>('normal');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadConversations();
    }
  }, [isOpen, userId]);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
      markMessagesAsRead(selectedConversation.id, userId);
      
      // Scroll to bottom after messages load
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);

      // Subscribe to new messages
      const subscription = subscribeToMessages(selectedConversation.id, async (message) => {
        const { data: sender } = await supabase
          .from('profiles')
          .select('id, username, display_name, full_name, avatar_url')
          .eq('id', message.sender_id)
          .single();

        if (sender) {
          const enrichedMessage: MessageWithSender = {
            ...message,
            sender,
            is_own_message: message.sender_id === userId
          };
          setMessages(prev => [...prev, enrichedMessage]);
          
          if (message.sender_id !== userId) {
            await markMessagesAsRead(selectedConversation.id, userId);
          }
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [selectedConversation, userId]);

  async function loadConversations() {
    setLoading(true);
    try {
      const data = await getConversations(userId);
      setConversations(data);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(conversationId: string) {
    try {
      const data = await getMessages(conversationId, userId);
      setMessages(data);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || sending || !selectedConversation) return;

    setSending(true);
    try {
      await sendMessage(selectedConversation.id, userId, newMessage.trim());
      setNewMessage('');
      await loadConversations(); // Refresh conversation list
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  }

  function handleBack() {
    setSelectedConversation(null);
    setMessages([]);
  }

  function getWidthStyle() {
    switch (panelWidth) {
      case 'normal': return { width: '384px' };
      case 'wide': return { width: '600px' };
      case 'full': return { width: '100vw' };
      default: return { width: '384px' };
    }
  }

  return (
    <>
      {/* Side Panel - No Backdrop, Just the Panel */}
      <div 
        className={`fixed bg-gradient-to-br from-gray-900 via-itutor-black to-gray-900 border-l border-gray-700 shadow-2xl flex flex-col transition-all duration-300 overflow-hidden ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ 
          ...getWidthStyle(), 
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          maxHeight: '100vh',
          zIndex: 9999
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800/50">
          <div className="flex items-center gap-3">
            {selectedConversation && (
              <button
                onClick={handleBack}
                className="text-gray-400 hover:text-itutor-white transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
            )}
            <h2 className="text-lg font-bold text-itutor-white">
              {selectedConversation ? getDisplayName(selectedConversation.other_participant) : 'Messages'}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Width Toggle */}
            <button
              onClick={() => setPanelWidth(prev => prev === 'normal' ? 'wide' : prev === 'wide' ? 'full' : 'normal')}
              className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-itutor-white hover:bg-gray-700 rounded-lg transition"
              title={`Current: ${panelWidth === 'normal' ? 'Normal' : panelWidth === 'wide' ? 'Wide' : 'Full Screen'} - Click to resize`}
            >
              {panelWidth === 'normal' && (
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                  </svg>
                  Normal
                </span>
              )}
              {panelWidth === 'wide' && (
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  Wide
                </span>
              )}
              {panelWidth === 'full' && (
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Full
                </span>
              )}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-itutor-white transition"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        {!selectedConversation ? (
          /* Conversations List */
          <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-itutor-green"></div>
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-12 px-4">
                <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-gray-400">No messages yet</p>
                <p className="text-sm text-gray-500 mt-2">Start a conversation!</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-700">
                {conversations.map((conversation) => {
                  const hasUnread = conversation.unread_count > 0;
                  return (
                    <button
                      key={conversation.id}
                      onClick={() => setSelectedConversation(conversation)}
                      className={`w-full text-left p-4 hover:bg-gray-800/50 transition ${hasUnread ? 'bg-gray-800/30' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${getAvatarColor(conversation.other_participant?.id || '')} flex items-center justify-center text-white font-bold flex-shrink-0`}>
                          {conversation.other_participant?.avatar_url ? (
                            <img src={conversation.other_participant.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            getDisplayName(conversation.other_participant).charAt(0).toUpperCase()
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h3 className={`font-semibold truncate ${hasUnread ? 'text-itutor-white' : 'text-gray-300'}`}>
                              {getDisplayName(conversation.other_participant)}
                            </h3>
                            {conversation.last_message_at && (
                              <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                                {getRelativeTime(conversation.last_message_at)}
                              </span>
                            )}
                          </div>
                          {conversation.last_message_preview && (
                            <p className={`text-sm truncate ${hasUnread ? 'text-gray-300 font-medium' : 'text-gray-500'}`}>
                              {conversation.last_message_preview}
                            </p>
                          )}
                        </div>

                        {/* Unread Badge */}
                        {hasUnread && (
                          <div className="w-6 h-6 bg-itutor-green rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                            {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Conversation View */
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 overscroll-contain" style={{ minHeight: 0 }}>
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <p>No messages yet</p>
                  <p className="text-sm mt-2">Send a message to start the conversation!</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.is_own_message ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[75%] ${message.is_own_message ? '' : 'flex items-end gap-2'}`}>
                      {/* Avatar (for other person) */}
                      {!message.is_own_message && (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                          {message.sender.avatar_url ? (
                            <img src={message.sender.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            getDisplayName(message.sender).charAt(0).toUpperCase()
                          )}
                        </div>
                      )}

                      {/* Message Bubble */}
                      <div>
                        <div
                          className={`px-4 py-2 rounded-2xl ${
                            message.is_own_message
                              ? 'bg-gradient-to-r from-itutor-green to-emerald-600 text-white rounded-br-none'
                              : 'bg-gray-700 text-itutor-white rounded-bl-none'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                        </div>
                        <p className={`text-xs text-gray-500 mt-1 ${message.is_own_message ? 'text-right' : 'text-left'}`}>
                          {formatTime(message.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-700 bg-gray-800/50">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  disabled={sending}
                  className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 text-itutor-white rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition placeholder-gray-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={sending || !newMessage.trim()}
                  className="p-2 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </>
  );
}

