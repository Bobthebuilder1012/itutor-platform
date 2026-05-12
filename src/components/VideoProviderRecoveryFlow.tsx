import React from 'react';
import { useVideoProviderRecovery } from '../hooks/useVideoProviderRecovery';
import { ManualRecoveryModal } from './ManualRecoveryModal';

export interface VideoProviderRecoveryFlowProps {
  onRecoverySuccess?: () => void;
  /** Optional: custom message when connection fails */
  errorMessage?: string;
  /** Optional: class name for the container */
  className?: string;
}

/**
 * Implements the three-step recovery flow:
 * 1. Retry button → auto disconnect + reconnect. On failure → show Try again.
 * 2. Try again button → same auto flow. On failure → show manual guide.
 * 3. Manual guide → pop-up to disconnect then reconnect with user steps.
 */
export function VideoProviderRecoveryFlow({
  onRecoverySuccess,
  errorMessage,
  className,
}: VideoProviderRecoveryFlowProps) {
  const {
    recoveryStep,
    isRecovering,
    error,
    isManualGuideOpen,
    performAutoRecovery,
    openManualGuide,
    closeManualGuide,
  } = useVideoProviderRecovery();

  const handleRetry = async () => {
    const success = await performAutoRecovery();
    if (success) onRecoverySuccess?.();
  };

  const showTryAgain = recoveryStep === 'tryAgain';
  const showManualGuideTrigger = recoveryStep === 'manualGuide';

  return (
    <>
      <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-start' }}>
        {error && (
          <p style={{ margin: 0, color: 'var(--error-color, #f87171)' }}>
            {errorMessage ?? error}
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleRetry}
            disabled={isRecovering}
            style={{ padding: '0.5rem 1rem', cursor: isRecovering ? 'not-allowed' : 'pointer' }}
          >
            {isRecovering ? 'Reconnecting…' : 'Retry'}
          </button>
          {showTryAgain && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isRecovering}
              style={{ padding: '0.5rem 1rem', cursor: isRecovering ? 'not-allowed' : 'pointer' }}
            >
              Try again
            </button>
          )}
          {showManualGuideTrigger && (
            <button
              type="button"
              onClick={openManualGuide}
              style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
            >
              Fix connection manually
            </button>
          )}
        </div>
      </div>

      <ManualRecoveryModal
        open={isManualGuideOpen}
        onClose={closeManualGuide}
        onDone={onRecoverySuccess}
      />
    </>
  );
}
