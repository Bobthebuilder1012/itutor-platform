'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/lib/types/database';
import { User } from '@supabase/supabase-js';

const CACHE_KEY = 'itutor_profile_cache';

function readCache(): Profile | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function writeCache(profile: Profile | null) {
  try {
    if (profile) localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(CACHE_KEY);
  } catch { /* ignore */ }
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(() => {
    if (typeof window === 'undefined') return null;
    return readCache();
  });
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  async function fetchProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        writeCache(null);
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
        writeCache(ensured || null);
      } else {
        setProfile(data);
        writeCache(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch profile');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    hasFetched.current = false;
    await fetchProfile();
  }

  return { profile, user, loading, error, refresh };
}
