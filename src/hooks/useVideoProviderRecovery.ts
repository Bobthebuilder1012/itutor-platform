import { useState, useCallback } from 'react';
import { getVideoProviderService } from '../services/videoProviderService';

export type RecoveryStep = 'retry' | 'tryAgain' | 'manualGuide';

export interface UseVideoProviderRecoveryResult {
  recoveryStep: RecoveryStep;
  isRecovering: boolean;
  error: string | null;
  isManualGuideOpen: boolean;
  performAutoRecovery: () => Promise<boolean>;
  openManualGuide: () => void;
  closeManualGuide: () => void;
  resetRecovery: () => void;
}

/**
 * Performs disconnect then reconnect for all/current video providers.
 * Returns true if recovery succeeded, false otherwise.
 */
export function useVideoProviderRecovery(): UseVideoProviderRecoveryResult {
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>('retry');
  const [isRecovering, setIsRecovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isManualGuideOpen, setIsManualGuideOpen] = useState(false);

  const performAutoRecovery = useCallback(async (): Promise<boolean> => {
    setIsRecovering(true);
    setError(null);
    try {
      const service = getVideoProviderService();
      await service.disconnect();
      await service.reconnect();
      setRecoveryStep('retry');
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Connection recovery failed';
      setError(message);
      setRecoveryStep((prev) => (prev === 'retry' ? 'tryAgain' : 'manualGuide'));
      return false;
    } finally {
      setIsRecovering(false);
    }
  }, []);

  const openManualGuide = useCallback(() => {
    setRecoveryStep('manualGuide');
    setIsManualGuideOpen(true);
  }, []);

  const closeManualGuide = useCallback(() => {
    setRecoveryStep('retry');
    setError(null);
    setIsManualGuideOpen(false);
  }, []);

  const resetRecovery = useCallback(() => {
    setRecoveryStep('retry');
    setError(null);
    setIsRecovering(false);
    setIsManualGuideOpen(false);
  }, []);

  return {
    recoveryStep,
    isRecovering,
    error,
    isManualGuideOpen,
    performAutoRecovery,
    openManualGuide,
    closeManualGuide,
    resetRecovery,
  };
}
