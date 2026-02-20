import { useState, useEffect, useCallback, useRef } from 'react';

export type Institution = {
  id: string;
  name: string;
  normalized_name?: string;
  country_code: string;
  island?: 'Trinidad' | 'Tobago';
  institution_level: string;
  institution_type: string;
  denomination?: string | null;
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
  _filters: InstitutionSearchFilters = {},
  debounceMs: number = 300
) {
  const [results, setResults] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const searchInstitutions = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ q: searchQuery.trim() });
      const res = await fetch(`/api/institutions/search?${params}`, {
        signal: abortRef.current.signal
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Failed to search institutions');
        setResults([]);
        return;
      }

      setResults(Array.isArray(json.institutions) ? json.institutions : []);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setLoading(false);
        return;
      }
      console.error('Error searching institutions:', err);
      setError('Failed to load schools. Please try again.');
      setResults([]);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, []);

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
      abortRef.current?.abort();
    };
  }, [query, searchInstitutions, debounceMs]);

  return { results, loading, error };
}
















