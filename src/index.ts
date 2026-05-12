// Video Provider Recovery
export { VideoProviderRecoveryFlow, ManualRecoveryModal } from './components';
export { useVideoProviderRecovery } from './hooks/useVideoProviderRecovery';
export type { RecoveryStep, UseVideoProviderRecoveryResult } from './hooks/useVideoProviderRecovery';
export {
  getVideoProviderService,
  setVideoProviderService,
  defaultVideoProviderService,
} from './services/videoProviderService';
export type { VideoProviderService } from './services/videoProviderService';

// Authentication
export { LoginForm } from './components';
export { useAuth } from './hooks/useAuth';
export type { UseAuthResult } from './hooks/useAuth';
export {
  createSupabaseClient,
  supabase,
  signInWithEmail,
  signOut,
  getCurrentSession,
  getRememberMePreference,
  setRememberMePreference,
} from './lib';
