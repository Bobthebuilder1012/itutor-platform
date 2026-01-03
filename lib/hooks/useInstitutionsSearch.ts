import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';

export type Institution = {
  id: string;
  name: string;
  normalized_name: string;
  country_code: string;
  island: 'Trinidad' | 'Tobago';
  institution_level: 'secondary' | 'tertiary';
  institution_type: string;
  denomination: string | null;
  is_active: boolean;
};

export type InstitutionSearchFilters = {
  institution_level?: 'secondary' | 'tertiary';
  island?: 'Trinidad' | 'Tobago';
  institution_type?: string;
  country_code?: string;
};

export function useInstitutionsSearch(
  query: string,
  filters: InstitutionSearchFilters = {},
  debounceMs: number = 300
) {
  const [results, setResults] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchInstitutions = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Build the query
        let supabaseQuery = supabase
          .from('institutions')
          .select('*')
          .eq('is_active', true);

        // Apply filters
        if (filters.institution_level) {
          supabaseQuery = supabaseQuery.eq('institution_level', filters.institution_level);
        }
        if (filters.island) {
          supabaseQuery = supabaseQuery.eq('island', filters.island);
        }
        if (filters.institution_type) {
          supabaseQuery = supabaseQuery.eq('institution_type', filters.institution_type);
        }
        if (filters.country_code) {
          supabaseQuery = supabaseQuery.eq('country_code', filters.country_code);
        }

        // Search by name (case-insensitive)
        const normalizedQuery = searchQuery.toLowerCase();
        supabaseQuery = supabaseQuery.or(
          `name.ilike.%${searchQuery}%,normalized_name.ilike.%${normalizedQuery}%`
        );

        // Order and limit
        const { data, error: fetchError } = await supabaseQuery
          .order('name', { ascending: true })
          .limit(20);

        if (fetchError) {
          console.error('Error searching institutions:', fetchError);
          setError('Failed to search institutions');
          setResults([]);
        } else {
          setResults(data || []);
        }
      } catch (err) {
        console.error('Unexpected error searching institutions:', err);
        setError('An unexpected error occurred');
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  // Debounced search effect
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timeoutId = setTimeout(() => {
      searchInstitutions(query);
    }, debounceMs);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [query, searchInstitutions, debounceMs]);

  return { results, loading, error };
}










