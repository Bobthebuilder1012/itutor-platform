'use client';

import { useState, useEffect } from 'react';

interface IOSInstallPromptProps {
  onDismiss?: () => void;
}

/**
 * Detects iOS devices and prompts users to add app to Home Screen
 * for push notification support
 */
export default function IOSInstallPrompt({ onDismiss }: IOSInstallPromptProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Add animation styles
    const style = document.createElement('style');
    style.id = 'ios-install-prompt-styles';
    style.textContent = `
      @keyframes slide-up {
        from {
          transform: translateY(100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      .animate-slide-up {
        animation: slide-up 0.3s ease-out;
      }
    `;
    
    // Only add if not already added
    if (!document.getElementById('ios-install-prompt-styles')) {
      document.head.appendChild(style);
    }
    
    checkShouldShow();

    // Cleanup
    return () => {
      const existingStyle = document.getElementById('ios-install-prompt-styles');
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);

  function checkShouldShow() {
    // Only run in browser
    if (typeof window === 'undefined') return;

    // Check if user has dismissed the prompt
    const dismissed = localStorage.getItem('ios-install-prompt-dismissed');
    if (dismissed === 'true') return;

    // Detect if user is on iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!isIOS) return;

    // Check if already running as PWA (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone 
      || document.referrer.includes('android-app://');
    
    if (isStandalone) {
      // Already installed as PWA, don't show prompt
      return;
    }

    // Check if notifications are already enabled
    if ('Notification' in window && Notification.permission === 'granted') {
      // Notifications already working, don't show
      return;
    }

    // Show the prompt if:
    // - User is on iOS
    // - Not in PWA mode
    // - Hasn't dismissed before
    // - Notifications not enabled
    setShow(true);
  }

  function handleDismiss() {
    localStorage.setItem('ios-install-prompt-dismissed', 'true');
    setShow(false);
    onDismiss?.();
  }

  function handleRemindLater() {
    // Don't save to localStorage, so it shows again next session
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-6 bg-gradient-to-t from-black/95 via-black/90 to-transparent backdrop-blur-sm animate-slide-up">
      <div className="max-w-2xl mx-auto bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl shadow-2xl p-6 border border-blue-400/30">
        {/* Header with Icon */}
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          
          <div className="flex-1">
            <h3 className="text-white font-bold text-lg mb-1">
              Enable Notifications on iPhone
            </h3>
            <p className="text-blue-100 text-sm leading-relaxed">
              Get notified about sessions, bookings, and messages even when iTutor isn't open.
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-white/60 hover:text-white transition-colors p-1"
            aria-label="Dismiss"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Instructions */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 mb-4 border border-white/20">
          <p className="text-white font-semibold mb-3 text-sm">Quick Setup (3 steps):</p>
          
          <div className="space-y-3">
            {/* Step 1 */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-itutor-green text-black rounded-full flex items-center justify-center text-xs font-bold">
                1
              </div>
              <div className="flex items-center gap-2 flex-1">
                <span className="text-white text-sm">Tap the</span>
                <div className="bg-white/20 px-2 py-1 rounded flex items-center gap-1">
                  <svg className="w-4 h-4 text-blue-300" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z"/>
                  </svg>
                  <span className="text-white text-xs font-medium">Share</span>
                </div>
                <span className="text-white text-sm">button below</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-itutor-green text-black rounded-full flex items-center justify-center text-xs font-bold">
                2
              </div>
              <div className="flex-1">
                <span className="text-white text-sm">Scroll down and tap </span>
                <span className="text-itutor-green font-semibold text-sm">"Add to Home Screen"</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-itutor-green text-black rounded-full flex items-center justify-center text-xs font-bold">
                3
              </div>
              <div className="flex-1">
                <span className="text-white text-sm">Open iTutor from your Home Screen and enable notifications</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={handleRemindLater}
            className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-all backdrop-blur-sm border border-white/20"
          >
            Maybe Later
          </button>
          <button
            onClick={handleDismiss}
            className="flex-1 px-4 py-3 bg-white hover:bg-gray-100 text-blue-600 rounded-lg font-semibold transition-all shadow-lg"
          >
            Got It!
          </button>
        </div>

        {/* iOS Version Notice */}
        <p className="text-blue-200 text-xs text-center mt-3 opacity-75">
          Requires iOS 16.4 or later • Free feature
        </p>
      </div>
    </div>
  );
}
