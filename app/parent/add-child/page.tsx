'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import InstitutionAutocomplete from '@/components/InstitutionAutocomplete';
import SubjectMultiSelect from '@/components/SubjectMultiSelect';
import { Institution } from '@/lib/hooks/useInstitutionsSearch';

const FORM_LEVELS = [
  'Form 1',
  'Form 2',
  'Form 3',
  'Form 4',
  'Form 5',
  'Lower 6',
  'Upper 6',
];

export default function AddChild() {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedInstitution, setSelectedInstitution] = useState<Institution | null>(null);
  const [formLevel, setFormLevel] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (profile.role !== 'parent') {
    router.push('/login');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Validation
    if (!fullName.trim()) {
      setError('Please enter full name.');
      setSubmitting(false);
      return;
    }

    if (!email.trim()) {
      setError('Please enter email address.');
      setSubmitting(false);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      setSubmitting(false);
      return;
    }

    if (!selectedInstitution) {
      setError('Please select a school.');
      setSubmitting(false);
      return;
    }

    if (!formLevel) {
      setError('Please select a form level.');
      setSubmitting(false);
      return;
    }

    if (selectedSubjects.length === 0) {
      setError('Please select at least one subject.');
      setSubmitting(false);
      return;
    }

    try {
      console.log('📤 Sending request to create child...');

      // Call our API route to create the child server-side
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session found. Please log in again.');
      }

      const response = await fetch('/api/parent/add-child', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email,
          password,
          fullName,
          institutionId: selectedInstitution.id,
          institutionName: selectedInstitution.name,
          formLevel,
          subjects: selectedSubjects,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to add child');
      }

      console.log('✅ Child added successfully:', result.childId);

      // Success! Redirect to dashboard
      router.push('/parent/dashboard');
    } catch (err) {
      console.error('❌ Error adding child:', err);
      setError(err instanceof Error ? err.message : 'Failed to add child. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout role="parent" userName={profile.full_name}>
      <div className="px-4 py-6 sm:px-0">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Add Child</h1>

          <div className="bg-white shadow rounded-lg p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="full_name" className="block text-sm font-medium text-gray-700">
                  Full Name *
                </label>
                <input
                  type="text"
                  id="full_name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border"
                  disabled={submitting}
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email Address *
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border"
                  disabled={submitting}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password *
                </label>
                <input
                  type="password"
                  id="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border"
                  disabled={submitting}
                />
                <p className="mt-1 text-sm text-gray-500">
                  Minimum 8 characters
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  School *
                </label>
                <InstitutionAutocomplete
                  selectedInstitution={selectedInstitution}
                  onChange={setSelectedInstitution}
                  filters={{ institution_level: 'secondary', country_code: 'TT' }}
                  disabled={submitting}
                  placeholder="Type to search (e.g. Queen's, Presentation)..."
                  required
                />
              </div>

              <div>
                <label htmlFor="form_level" className="block text-sm font-medium text-gray-700">
                  Form Level *
                </label>
                <select
                  id="form_level"
                  required
                  value={formLevel}
                  onChange={(e) => setFormLevel(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2 border"
                  disabled={submitting}
                >
                  <option value="">Select form level</option>
                  {FORM_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subjects of Study *
                </label>
                <p className="text-sm text-gray-500 mb-3">
                  Select the subjects your child is studying
                </p>
                <SubjectMultiSelect
                  selectedSubjects={selectedSubjects}
                  onChange={setSelectedSubjects}
                  disabled={submitting}
                  placeholder="Type to search subjects..."
                />
              </div>

              <div className="flex items-center justify-between pt-4">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-md font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Add Child'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
