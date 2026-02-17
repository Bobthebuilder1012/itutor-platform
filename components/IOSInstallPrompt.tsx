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
  // #region agent log
  const [debugInfo, setDebugInfo] = useState<any[]>([]);
  
  const logDebug = (location: string, message: string, data: any) => {
    const entry = { location, message, data, time: new Date().toISOString() };
    console.log('[DEBUG]', entry);
    setDebugInfo(prev => [...prev.slice(-20), entry]); // Keep last 20 entries
  };
  // #endregion

  useEffect(() => {
    // #region agent log
    logDebug('useEffect:mount', 'Component mounted', {});
    // #endregion
    // Add animation styles and scrollbar styling
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
      /* Smooth scrolling for iOS prompt */
      .ios-prompt-scroll {
        -webkit-overflow-scrolling: touch;
        scroll-behavior: smooth;
      }
      /* Custom scrollbar for better visibility */
      .ios-prompt-scroll::-webkit-scrollbar {
        width: 8px;
      }
      .ios-prompt-scroll::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
      }
      .ios-prompt-scroll::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.3);
        border-radius: 4px;
      }
      .ios-prompt-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.5);
      }
    `;
    
    if (!document.getElementById('ios-install-prompt-styles')) {
      document.head.appendChild(style);
    }
    
    checkShouldShow();

    // Check status periodically (every 3 seconds)
    // #region agent log
    logDebug('useEffect:interval', 'Interval setup', {});
    // #endregion
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
    // #region agent log
    logDebug('checkShouldShow:start', 'Function called', {windowUndefined:typeof window==='undefined'});
    // #endregion
    if (typeof window === 'undefined') return;

    // Detect if user is on iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    // #region agent log
    logDebug('checkShouldShow:ios', 'iOS detection', {isIOS,userAgent:navigator.userAgent});
    // #endregion
    if (!isIOS) {
      logDebug('checkShouldShow:not-ios', 'Early return: not iOS', {});
      return;
    }

    // Detect if using Safari
    const userAgent = navigator.userAgent;
    const isSafariBrowser = /Safari/.test(userAgent) && !/CriOS|FxiOS|OPiOS|mercury|EdgiOS/.test(userAgent);
    setIsSafari(isSafariBrowser);
    // #region agent log
    logDebug('checkShouldShow:safari', 'Safari detection', {isSafariBrowser,userAgent,safariTest:/Safari/.test(userAgent),chromeTest:/CriOS|FxiOS|OPiOS|mercury|EdgiOS/.test(userAgent)});
    // #endregion

    // Check actual setup status
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone;
    const hasNotifications = 'Notification' in window && Notification.permission === 'granted';
    // #region agent log
    logDebug('checkShouldShow:status', 'Setup status check', {isStandalone,hasNotifications,notificationPermission:typeof Notification!=='undefined'?Notification.permission:'undefined',displayMode:window.matchMedia('(display-mode: standalone)').matches,standaloneNav:(window.navigator as any).standalone});
    // #endregion

    // If everything is set up, never show
    if (isStandalone && hasNotifications) {
      // #region agent log
      logDebug('checkShouldShow:complete', 'Early return: setup complete', {});
      // #endregion
      return;
    }

    // Check if user dismissed recently (within last 24 hours)
    const dismissedTimestamp = localStorage.getItem('ios-prompt-dismissed');
    if (dismissedTimestamp) {
      const dismissedTime = parseInt(dismissedTimestamp, 10);
      const twentyFourHours = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      const timeSinceDismissed = Date.now() - dismissedTime;
      // #region agent log
      logDebug('checkShouldShow:dismissed', 'Dismissal check', {dismissedTimestamp,timeSinceDismissed,twentyFourHours,withinPeriod:timeSinceDismissed<twentyFourHours});
      // #endregion
      
      if (timeSinceDismissed < twentyFourHours) {
        // Still within the 24-hour dismissal period
        // #region agent log
        logDebug('checkShouldShow:dismissed-return', 'Early return: within dismissal period', {});
        // #endregion
        return;
      }
    }

    // Determine what step they're on
    if (!isStandalone) {
      setCurrentStep('add-to-home');
    } else if (!hasNotifications) {
      setCurrentStep('enable-notifications');
    }

    // #region agent log
    logDebug('checkShouldShow:show', 'Setting show=true', {stepSet:!isStandalone?'add-to-home':'enable-notifications'});
    // #endregion
    setShow(true);
  }

  function checkCurrentStatus() {
    // #region agent log
    logDebug('checkCurrentStatus:start', 'Function called', {windowUndefined:typeof window==='undefined',show});
    // #endregion
    if (typeof window === 'undefined' || !show) return;

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone;
    const hasNotifications = 'Notification' in window && Notification.permission === 'granted';
    // #region agent log
    logDebug('checkCurrentStatus:status', 'Status detected in interval', {isStandalone,hasNotifications,notificationPermission:typeof Notification!=='undefined'?Notification.permission:'undefined'});
    // #endregion

    // Auto-advance to next step based on actual status
    if (isStandalone && hasNotifications) {
      // Fully complete! Clear dismissal timestamp
      // #region agent log
      logDebug('checkCurrentStatus:complete', 'Setup complete detected', {});
      // #endregion
      localStorage.removeItem('ios-prompt-dismissed');
      setCurrentStep('complete');
      setTimeout(() => {
        setShow(false);
      }, 3000);
    } else if (isStandalone && !hasNotifications) {
      // In PWA mode but notifications not enabled
      // #region agent log
      logDebug('checkCurrentStatus:pwa', 'PWA mode detected, advancing to enable-notifications', {});
      // #endregion
      setCurrentStep('enable-notifications');
    } else if (!isStandalone) {
      // Not in PWA mode yet
      // #region agent log
      logDebug('checkCurrentStatus:not-pwa', 'Not in PWA mode, staying at add-to-home', {});
      // #endregion
      setCurrentStep('add-to-home');
    }
  }

  async function handleEnableNotifications() {
    setChecking(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        // Clear dismissal timestamp since setup is complete
        localStorage.removeItem('ios-prompt-dismissed');
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
    // Store dismissal timestamp to prevent showing again for 24 hours
    localStorage.setItem('ios-prompt-dismissed', Date.now().toString());
    setShow(false);
    if (onDismiss) {
      onDismiss();
    }
  }

  function handleCopyUrl() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      alert('✅ Link copied!\n\nNow:\n1. Close this browser\n2. Open Safari\n3. Paste the link in the address bar\n4. Press "Go"\n\nThis message will close automatically so you can continue using the site.');
      // Auto-dismiss after copying so user can use the site
      setTimeout(() => {
        handleRemindLater();
      }, 500);
    }).catch(() => {
      // Fallback: show URL in alert
      alert(`Copy this link and open it in Safari:\n\n${url}`);
      setTimeout(() => {
        handleRemindLater();
      }, 500);
    });
  }

  // #region agent log
  if (typeof window !== 'undefined') {
    logDebug('render', 'Render check', {show,currentStep,isSafari});
  }
  // #endregion
  
  // #region agent log - Debug Panel
  const debugPanel = debugInfo.length > 0 && (
    <div style={{position:'fixed',top:0,left:0,right:0,background:'black',color:'lime',padding:'10px',fontSize:'10px',maxHeight:'200px',overflow:'auto',zIndex:9999,fontFamily:'monospace'}}>
      <div style={{fontWeight:'bold',marginBottom:'5px'}}>DEBUG INFO (H1:Prompt Show | H2:Safari | H3:Detection | H4:State | H5:Timing)</div>
      {debugInfo.map((info, i) => (
        <div key={i} style={{borderBottom:'1px solid #333',padding:'3px 0'}}>
          <span style={{color:'cyan'}}>[{info.location}]</span> {info.message}: {JSON.stringify(info.data)}
        </div>
      ))}
    </div>
  );
  // #endregion
  
  if (!show) return <>{debugPanel}</>;


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
          <div className="mb-4 bg-red-500/30 border-3 border-red-400 rounded-xl p-5 backdrop-blur-sm">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0">
                <svg className="w-8 h-8 text-red-300 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-white font-bold text-lg mb-3">🚫 You Must Use Safari</h4>
                <p className="text-red-100 text-base mb-3 leading-relaxed font-semibold">
                  iOS notifications only work in Safari browser. You're currently using a different browser.
                </p>
              </div>
            </div>
            
            <div className="bg-white/10 rounded-lg p-4 mb-3">
              <p className="text-white font-bold text-sm mb-3">Follow these steps:</p>
              <ol className="space-y-2 text-red-100 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-white font-bold mt-0.5">1.</span>
                  <span>Click the button below to copy this page's link</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-white font-bold mt-0.5">2.</span>
                  <span>Close this browser and open the <strong>Safari</strong> app on your iPhone</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-white font-bold mt-0.5">3.</span>
                  <span>Tap the address bar at the top and paste the link</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-white font-bold mt-0.5">4.</span>
                  <span>Press "Go" to open iTutor in Safari</span>
                </li>
              </ol>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCopyUrl}
                className="flex-1 px-5 py-4 bg-red-400 hover:bg-red-500 text-white font-bold rounded-lg transition-all shadow-lg text-base flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy Link
              </button>
              <button
                onClick={handleRemindLater}
                className="px-5 py-4 bg-white/20 hover:bg-white/30 text-white font-semibold rounded-lg transition-all text-base"
              >
                Skip
              </button>
            </div>
            <p className="text-white text-xs text-center mt-3 font-medium">
              💡 After copying, this prompt will close automatically so you can continue using iTutor. Switch to Safari when you're ready!
            </p>
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

        {/* Action Buttons */}
        {isSafari && (
          <div className="flex gap-2">
            <button
              onClick={handleRemindLater}
              className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-all backdrop-blur-sm border border-white/20 text-sm"
            >
              Continue Without Notifications
            </button>
          </div>
        )}

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
      {/* #region agent log */}
      {debugPanel}
      {/* #endregion */}
      
      {/* Backdrop overlay to block background interaction */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={handleRemindLater}
        aria-hidden="true"
      />
      
      {/* Prompt content */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-6 animate-slide-up max-h-[90vh] flex flex-col">
        <div className="max-w-2xl mx-auto bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl shadow-2xl border border-blue-400/30 overflow-hidden flex flex-col max-h-full">
          <div className="overflow-y-auto ios-prompt-scroll p-6">
            {renderStepContent()}
          </div>
        </div>
      </div>
    </>
  );
}
