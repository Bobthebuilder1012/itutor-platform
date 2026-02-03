'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types/database';
import { User } from '@supabase/supabase-js';

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    // Prevent multiple fetches
    if (hasFetched.current) return;
    hasFetched.current = true;

    async function fetchProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setLoading(false);
          return;
        }

        setUser(user);

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (error) throw error;

        if (!data) {
          await fetch('/api/profile/ensure', { method: 'POST' }).catch(() => {});
          const { data: ensured, error: ensuredError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
          if (ensuredError) throw ensuredError;
          setProfile(ensured || null);
        } else {
          setProfile(data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch profile');
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, []);

  return { profile, user, loading, error };
}
