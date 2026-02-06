'use client';

import { useState, useEffect } from 'react';
import { 
  isPushNotificationSupported, 
  hasNotificationPermission,
  requestNotificationPermission,
  subscribeToPushNotifications
} from '@/lib/services/browserPushService';

interface EnableNotificationsPromptProps {
  userId: string;
  onDismiss?: () => void;
}

export default function EnableNotificationsPrompt({ userId, onDismiss }: EnableNotificationsPromptProps) {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkShouldShow();
  }, []);

  async function checkShouldShow() {
    if (!isPushNotificationSupported()) return;
    
    const hasPermission = hasNotificationPermission();
    const dismissed = localStorage.getItem('notifications-prompt-dismissed');
    
    // Show if no permission and not dismissed
    if (!hasPermission && !dismissed) {
      setShow(true);
    } else if (hasPermission) {
      // Auto-subscribe if permission already granted
      await subscribeToPushNotifications(userId);
    }
  }

  async function handleEnable() {
    setLoading(true);
    try {
      const granted = await requestNotificationPermission();
      if (granted) {
        await subscribeToPushNotifications(userId);
        setShow(false);
      } else {
        alert('Please enable notifications in your browser settings to receive alerts.');
      }
    } catch (error) {
      console.error('Error enabling notifications:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleDismiss() {
    localStorage.setItem('notifications-prompt-dismissed', 'true');
    setShow(false);
    onDismiss?.();
  }

  if (!show) return null;

  return (
    <div className="bg-gradient-to-r from-blue-600 to-purple-600 border border-blue-500 rounded-lg p-4 mb-4 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-sm mb-1">
            Enable Desktop Notifications
          </h3>
          <p className="text-blue-100 text-sm">
            Get notified about sessions, bookings, and messages even when iTutor is not open.
          </p>
        </div>
        <div className="flex-shrink-0 flex gap-2">
          <button
            onClick={handleEnable}
            disabled={loading}
            className="px-4 py-2 bg-white hover:bg-gray-100 text-blue-600 text-sm font-semibold rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'Enabling...' : 'Enable'}
          </button>
          <button
            onClick={handleDismiss}
            className="px-3 py-2 text-white hover:bg-white/10 text-sm rounded-lg transition"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
