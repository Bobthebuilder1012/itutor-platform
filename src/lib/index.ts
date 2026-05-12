// Supabase client
export { createSupabaseClient, supabase } from './supabase';

// Auth utilities
export {
  signInWithEmail,
  signOut,
  getCurrentSession,
  getRememberMePreference,
  setRememberMePreference,
} from './auth';
