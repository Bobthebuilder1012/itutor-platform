'use client';

import { useState, useEffect } from 'react';

interface IOSInstallPromptProps {
  onDismiss?: () => void;
}

type SetupStep = 'detect' | 'add-to-home' | 'open-from-home' | 'enable-notifications' | 'complete';

/**
 * Interactive iOS setup guide that detects user's progress
 * and guides them through each step to enable notifications
 */
export default function IOSInstallPrompt({ onDismiss }: IOSInstallPromptProps) {
  const [show, setShow] = useState(false);
  const [currentStep, setCurrentStep] = useState<SetupStep>('detect');
  const [checking, setChecking] = useState(false);
  const [isSafari, setIsSafari] = useState(true);

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
      @keyframes pulse-slow {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
      .animate-pulse-slow {
        animation: pulse-slow 2s ease-in-out infinite;
      }
    `;
    
    if (!document.getElementById('ios-install-prompt-styles')) {
      document.head.appendChild(style);
    }
    
    checkShouldShow();

    // Check status periodically (every 3 seconds)
    const interval = setInterval(() => {
      checkCurrentStatus();
    }, 3000);

    return () => {
      clearInterval(interval);
      const existingStyle = document.getElementById('ios-install-prompt-styles');
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);

  function checkShouldShow() {
    if (typeof window === 'undefined') return;

    // Detect if user is on iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!isIOS) return;

    // Detect if using Safari
    const userAgent = navigator.userAgent;
    const isSafariBrowser = /Safari/.test(userAgent) && !/CriOS|FxiOS|OPiOS|mercury|EdgiOS/.test(userAgent);
    setIsSafari(isSafariBrowser);

    // Check actual setup status
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone;
    const hasNotifications = 'Notification' in window && Notification.permission === 'granted';

    // If everything is set up, never show
    if (isStandalone && hasNotifications) {
      return;
    }

    // Determine what step they're on
    if (!isStandalone) {
      setCurrentStep('add-to-home');
    } else if (!hasNotifications) {
      setCurrentStep('enable-notifications');
    }

    setShow(true);
  }

  function checkCurrentStatus() {
    if (typeof window === 'undefined' || !show) return;

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone;
    const hasNotifications = 'Notification' in window && Notification.permission === 'granted';

    // Auto-advance to next step based on actual status
    if (isStandalone && hasNotifications) {
      // Fully complete!
      setCurrentStep('complete');
      setTimeout(() => {
        setShow(false);
      }, 3000);
    } else if (isStandalone && !hasNotifications) {
      // In PWA mode but notifications not enabled
      setCurrentStep('enable-notifications');
    } else if (!isStandalone) {
      // Not in PWA mode yet
      setCurrentStep('add-to-home');
    }
  }

  async function handleEnableNotifications() {
    setChecking(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setCurrentStep('complete');
        setTimeout(() => {
          setShow(false);
        }, 3000);
      } else {
        alert('Please allow notifications in your browser settings to receive updates.');
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      alert('Unable to request notification permission. Please check your iOS settings.');
    } finally {
      setChecking(false);
    }
  }

  function handleRemindLater() {
    // Just close, will show again next session if not set up
    setShow(false);
  }

  function handleCopyUrl() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      alert('Link copied! Now open Safari and paste this link.');
    }).catch(() => {
      // Fallback: show URL in alert
      alert(`Copy this link and open it in Safari:\n\n${url}`);
    });
  }

  if (!show) return null;

  // Render different content based on current step
  const renderStepContent = () => {
    if (currentStep === 'complete') {
      return (
        <div className="text-center py-4">
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-white font-bold text-xl mb-2">All Set! 🎉</h3>
          <p className="text-blue-100 text-sm">You'll now receive notifications for sessions, bookings, and messages.</p>
        </div>
      );
    }

    if (currentStep === 'enable-notifications') {
      return (
        <>
          <div className="flex items-start gap-4 mb-4">
            <div className="flex-shrink-0 w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center backdrop-blur-sm border-2 border-green-400">
              <svg className="w-6 h-6 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            
            <div className="flex-1">
              <h3 className="text-white font-bold text-lg mb-1">
                Step 2: Enable Notifications
              </h3>
              <p className="text-green-200 text-sm mb-2">
                ✅ Great! You've added iTutor to your Home Screen!
              </p>
              <p className="text-blue-100 text-sm leading-relaxed">
                Now let's enable notifications so you never miss a session.
              </p>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 mb-4 border border-green-400/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-itutor-green text-black rounded-full flex items-center justify-center text-sm font-bold animate-pulse-slow">
                →
              </div>
              <p className="text-white font-semibold text-sm">Click the button below to enable notifications:</p>
            </div>

            <button
              onClick={handleEnableNotifications}
              disabled={checking}
              className="w-full px-6 py-4 bg-itutor-green hover:bg-emerald-600 text-black font-bold rounded-lg transition-all shadow-lg text-base disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {checking ? 'Checking...' : 'Enable Notifications'}
            </button>
          </div>
        </>
      );
    }

    // Step 1: Add to Home Screen
    return (
      <>
        {/* Safari Required Warning */}
        {!isSafari && (
          <div className="mb-4 bg-orange-500/20 border-2 border-orange-400 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-orange-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-orange-200 font-bold text-sm mb-2">⚠️ Safari Required</h4>
                <p className="text-orange-100 text-sm mb-3 leading-relaxed">
                  iOS notifications only work in Safari. You're currently using a different browser.
                </p>
                <button
                  onClick={handleCopyUrl}
                  className="w-full px-4 py-2 bg-orange-400 hover:bg-orange-500 text-black font-semibold rounded-lg transition-all shadow-lg text-sm flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy Link & Open in Safari
                </button>
                <p className="text-orange-200 text-xs mt-2 text-center">
                  After copying, open Safari and paste the link
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0 w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          
          <div className="flex-1">
            <h3 className="text-white font-bold text-lg mb-1">
              Step 1: Add iTutor to Home Screen
            </h3>
            <p className="text-blue-100 text-sm leading-relaxed">
              This enables notifications on your iPhone. It only takes a moment!
            </p>
          </div>
        </div>

        {/* Visual Step-by-Step Guide */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 mb-4 border border-white/20">
          <div className="space-y-4">
            {/* Step 1a: Tap Share */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-itutor-green text-black rounded-full flex items-center justify-center text-sm font-bold animate-pulse-slow">
                1
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm mb-2">Tap the Share button at the bottom of Safari:</p>
                <div className="bg-blue-900/30 px-4 py-3 rounded-lg border border-blue-400/30 flex items-center justify-center gap-2">
                  <svg className="w-6 h-6 text-blue-300" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z"/>
                  </svg>
                  <span className="text-blue-200 text-sm font-medium">Look for this icon</span>
                </div>
              </div>
            </div>

            {/* Step 1b: Add to Home Screen */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-itutor-green text-black rounded-full flex items-center justify-center text-sm font-bold">
                2
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm mb-2">In the menu, scroll down and tap:</p>
                <div className="bg-green-900/30 px-4 py-3 rounded-lg border border-green-400/30">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-green-200 font-bold text-sm">"Add to Home Screen"</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 1c: Tap Add */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-itutor-green text-black rounded-full flex items-center justify-center text-sm font-bold">
                3
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm mb-2">Tap the blue "Add" button in the top right corner</p>
              </div>
            </div>

            {/* Step 1d: Open from Home */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-itutor-green text-black rounded-full flex items-center justify-center text-sm font-bold">
                4
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm mb-2">
                  <strong>CLOSE Safari</strong>, go to your Home Screen, and tap the iTutor icon
                </p>
                <p className="text-yellow-200 text-xs font-medium bg-yellow-900/30 rounded px-2 py-1 mt-2">
                  ⚠️ Critical: You must CLOSE this browser and open from the Home Screen icon. This prompt will automatically disappear once you do!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Clear Next Steps */}
        <div className="mb-4 bg-gradient-to-r from-green-900/40 to-blue-900/40 rounded-xl p-5 border-2 border-itutor-green/50">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-1">
              <div className="w-10 h-10 bg-itutor-green rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
            <div className="flex-1">
              <p className="text-white font-bold text-base mb-2">What to do now:</p>
              <ol className="space-y-2 text-sm text-green-100">
                <li className="flex items-start gap-2">
                  <span className="text-itutor-green font-bold mt-0.5">1.</span>
                  <span>Follow steps 1-4 above to add iTutor to your Home Screen</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-itutor-green font-bold mt-0.5">2.</span>
                  <span><strong>Close Safari completely</strong> (swipe up to close the app)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-itutor-green font-bold mt-0.5">3.</span>
                  <span>Open iTutor from the <strong>Home Screen icon</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-itutor-green font-bold mt-0.5">✓</span>
                  <span className="font-semibold">This prompt will automatically disappear and you'll continue to notifications!</span>
                </li>
              </ol>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleRemindLater}
            className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-all backdrop-blur-sm border border-white/20 text-sm"
          >
            I'll Do This Later
          </button>
        </div>

        {/* iOS Version Notice */}
        <p className="text-blue-200 text-xs text-center mt-3 opacity-90">
          Requires iOS 16.4 or later • Free feature • No app store needed
        </p>
        
        {/* Bottom help text */}
        <p className="text-yellow-200 text-xs text-center mt-2 font-medium">
          💡 Tip: You cannot complete setup while in Safari. Follow the steps, then open from Home Screen!
        </p>
      </>
    );
  };

  return (
    <>
      {/* Backdrop overlay to block background interaction */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={handleRemindLater}
        aria-hidden="true"
      />
      
      {/* Prompt content */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-6 animate-slide-up">
        <div className="max-w-2xl mx-auto bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl shadow-2xl p-6 border border-blue-400/30">
          {renderStepContent()}
        </div>
      </div>
    </>
  );
}
