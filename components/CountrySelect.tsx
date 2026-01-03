'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Country } from '@/lib/types/countries';
import { iso2ToFlagEmoji } from '@/lib/flagEmoji';

type CountrySelectProps = {
  value: string;
  onChange: (countryCode: string) => void;
  disabled?: boolean;
  error?: boolean;
  className?: string;
};

export default function CountrySelect({
  value,
  onChange,
  disabled = false,
  error = false,
  className = '',
}: CountrySelectProps) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCountries() {
      try {
        const { data, error: queryError } = await supabase
          .from('countries')
          .select('code, name, dial_code, currency_code')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (queryError) {
          console.error('Error fetching countries:', queryError);
          setFetchError(queryError.message);
          setLoading(false);
          return;
        }

        if (data && data.length > 0) {
          setCountries(data);
        } else {
          setFetchError('No countries available');
        }
      } catch (err) {
        console.error('Failed to fetch countries:', err);
        setFetchError('Failed to load countries');
      } finally {
        setLoading(false);
      }
    }

    fetchCountries();
  }, []);

  if (loading) {
    return (
      <div className="w-full px-4 py-3 border-2 border-gray-700 rounded-lg bg-gray-800/50 text-gray-400">
        Loading countries...
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="w-full px-4 py-3 border-2 border-red-500/50 rounded-lg bg-red-500/20 text-red-400 text-sm">
        Error: {fetchError}
      </div>
    );
  }

  if (countries.length === 0) {
    return (
      <div className="w-full px-4 py-3 border-2 border-yellow-500/50 rounded-lg bg-yellow-500/20 text-yellow-400 text-sm">
        No countries available
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={className || `w-full px-4 py-3 bg-gray-800/50 border-2 border-gray-700 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green focus:outline-none transition ${
        error
          ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/50'
          : ''
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${
        !value ? 'text-gray-500' : 'text-itutor-white'
      }`}
    >
      <option value="" className="bg-gray-900 text-gray-500">Select your country</option>
      {countries.map((country) => (
        <option key={country.code} value={country.code} className="bg-gray-900 text-itutor-white">
          {iso2ToFlagEmoji(country.code)} {country.name}
        </option>
      ))}
    </select>
  );
}

