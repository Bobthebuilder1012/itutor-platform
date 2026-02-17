'use client';

import { useEffect } from 'react';

/**
 * Suppresses non-critical console warnings from browser extensions
 * (Grammarly, etc.) that add attributes to server-rendered HTML
 */
export default function SuppressHydrationWarnings() {
  useEffect(() => {
    // Store original console methods
    const originalError = console.error;
    const originalWarn = console.warn;

    // List of patterns to suppress
    const suppressPatterns = [
      'Extra attributes from the server',
      'data-new-gr-c-s-check-loaded',
      'data-gr-ext-installed',
      'Grammarly',
    ];

    // Override console.error
    console.error = (...args: any[]) => {
      const message = args.join(' ');
      // Check if this is a suppressable warning
      const shouldSuppress = suppressPatterns.some(pattern => 
        message.includes(pattern)
      );
      
      if (!shouldSuppress) {
        originalError.apply(console, args);
      }
    };

    // Override console.warn
    console.warn = (...args: any[]) => {
      const message = args.join(' ');
      const shouldSuppress = suppressPatterns.some(pattern => 
        message.includes(pattern)
      );
      
      if (!shouldSuppress) {
        originalWarn.apply(console, args);
      }
    };

    // Cleanup on unmount
    return () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  return null;
}
