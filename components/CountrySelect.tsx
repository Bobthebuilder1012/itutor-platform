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
};

export default function CountrySelect({
  value,
  onChange,
  disabled = false,
  error = false,
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
      <div className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
        Loading countries...
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="w-full px-4 py-3 border border-red-300 rounded-lg bg-red-50 text-red-600 text-sm">
        Error: {fetchError}
      </div>
    );
  }

  if (countries.length === 0) {
    return (
      <div className="w-full px-4 py-3 border border-yellow-300 rounded-lg bg-yellow-50 text-yellow-700 text-sm">
        No countries available
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition ${
        error
          ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
          : 'border-gray-300 focus:border-blue-500'
      } ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`}
    >
      <option value="">Select your country</option>
      {countries.map((country) => (
        <option key={country.code} value={country.code}>
          {iso2ToFlagEmoji(country.code)} {country.name}
        </option>
      ))}
    </select>
  );
}

