import React, { useState } from 'react';
import { getVideoProviderService } from '../services/videoProviderService';

export interface ManualRecoveryModalProps {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}

type Step = 'disconnect' | 'reconnect';

/**
 * Guided pop-up: Step A = Disconnect video provider, Step B = Reconnect.
 * User can use in-app Disconnect/Reconnect buttons or follow instructions.
 */
export function ManualRecoveryModal({ open, onClose, onDone }: ManualRecoveryModalProps) {
  const [step, setStep] = useState<Step>('disconnect');
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  if (!open) return null;

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await getVideoProviderService().disconnect();
      setStep('reconnect');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleReconnect = async () => {
    setIsReconnecting(true);
    try {
      await getVideoProviderService().reconnect();
      onDone?.();
      onClose();
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleClose = () => {
    setStep('disconnect');
    onClose();
  };

  const handleDoneWithoutReconnectButton = () => {
    onDone?.();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-recovery-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
      }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        style={{
          background: 'var(--modal-bg, #1e1e1e)',
          color: 'var(--modal-fg, #e0e0e0)',
          padding: '1.5rem',
          borderRadius: '8px',
          maxWidth: '420px',
          width: '90%',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="manual-recovery-title" style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.25rem' }}>
          Fix video connection
        </h2>

        {step === 'disconnect' && (
          <>
            <p style={{ marginBottom: '1rem' }}>
              Disconnect your video provider (e.g. leave the call or disconnect in the provider&apos;s app).
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                style={{ padding: '0.5rem 1rem', cursor: isDisconnecting ? 'not-allowed' : 'pointer' }}
              >
                {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
              <button type="button" onClick={() => setStep('reconnect')} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
                I&apos;ve disconnected
              </button>
              <button type="button" onClick={handleClose} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </>
        )}

        {step === 'reconnect' && (
          <>
            <p style={{ marginBottom: '1rem' }}>
              Reconnect your video provider (e.g. join again or click Connect).
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleReconnect}
                disabled={isReconnecting}
                style={{ padding: '0.5rem 1rem', cursor: isReconnecting ? 'not-allowed' : 'pointer' }}
              >
                {isReconnecting ? 'Reconnecting…' : 'Reconnect'}
              </button>
              <button type="button" onClick={handleDoneWithoutReconnectButton} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
                I&apos;ve reconnected
              </button>
              <button type="button" onClick={() => setStep('disconnect')} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
