'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
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

type Mode = 'create' | 'link';

export default function AddChildPage() {
  const { profile, loading } = useProfile();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('create');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedInstitution, setSelectedInstitution] = useState<Institution | null>(null);
  const [formLevel, setFormLevel] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [linkEmail, setLinkEmail] = useState('');

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

  const resetMessages = () => setError(null);

  const handleCreateChild = async (event: React.FormEvent) => {
    event.preventDefault();
    resetMessages();

    if (!fullName.trim()) {
      setError('Please enter the child’s full name.');
      return;
    }

    if (!email.trim()) {
      setError('Please enter the child’s email address.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (!selectedInstitution) {
      setError('Please select a school.');
      return;
    }

    if (!formLevel) {
      setError('Please select a form level.');
      return;
    }

    if (selectedSubjects.length === 0) {
      setError('Please select at least one subject.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/parent/add-child', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        throw new Error(result?.error || 'Failed to add child');
      }

      router.push('/parent/dashboard');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to add child');
      setSubmitting(false);
    }
  };

  const handleLinkChild = async (event: React.FormEvent) => {
    event.preventDefault();
    resetMessages();

    if (!linkEmail.trim()) {
      setError('Please enter the student email address.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/parent/link-child', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: linkEmail }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to link child');
      }

      router.push('/parent/dashboard');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to link child');
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout role="parent" userName={profile.full_name}>
      <div className="px-4 py-6 sm:px-0">
        <div className="mx-auto max-w-3xl space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Manage Children</h1>
            <p className="mt-2 text-gray-600">
              Create a brand new child account or link a student account that already exists.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setMode('create');
                resetMessages();
              }}
              className={`rounded-2xl border p-5 text-left transition ${
                mode === 'create'
                  ? 'border-purple-600 bg-purple-50'
                  : 'border-gray-200 bg-white hover:border-purple-300'
              }`}
            >
              <h2 className="text-lg font-semibold text-gray-900">Create a New Child</h2>
              <p className="mt-2 text-sm text-gray-600">
                Set up a new student login and automatically link it to your parent account.
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('link');
                resetMessages();
              }}
              className={`rounded-2xl border p-5 text-left transition ${
                mode === 'link'
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-blue-300'
              }`}
            >
              <h2 className="text-lg font-semibold text-gray-900">Link an Existing Student</h2>
              <p className="mt-2 text-sm text-gray-600">
                Connect an already signed-up student account using their email address.
              </p>
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {error}
            </div>
          )}

          {mode === 'create' ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <form onSubmit={handleCreateChild} className="space-y-6">
                <div>
                  <label htmlFor="full_name" className="block text-sm font-medium text-gray-700">
                    Full Name
                  </label>
                  <input
                    id="full_name"
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    disabled={submitting}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={submitting}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={submitting}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                  />
                  <p className="mt-1 text-sm text-gray-500">Minimum 8 characters.</p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">School</label>
                  <InstitutionAutocomplete
                    selectedInstitution={selectedInstitution}
                    onChange={setSelectedInstitution}
                    filters={{ institution_level: 'secondary', country_code: 'TT' }}
                    disabled={submitting}
                    placeholder="Type to search schools..."
                    required
                  />
                </div>

                <div>
                  <label htmlFor="form_level" className="block text-sm font-medium text-gray-700">
                    Form Level
                  </label>
                  <select
                    id="form_level"
                    value={formLevel}
                    onChange={(event) => setFormLevel(event.target.value)}
                    disabled={submitting}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-purple-500 focus:ring-purple-500"
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
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Subjects of Study
                  </label>
                  <SubjectMultiSelect
                    selectedSubjects={selectedSubjects}
                    onChange={setSelectedSubjects}
                    disabled={submitting}
                    placeholder="Type to search subjects..."
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-700 transition hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-lg bg-purple-600 px-6 py-2 font-medium text-white transition hover:bg-purple-700 disabled:opacity-50"
                  >
                    {submitting ? 'Creating...' : 'Create Child Account'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <form onSubmit={handleLinkChild} className="space-y-6">
                <div>
                  <label htmlFor="link_email" className="block text-sm font-medium text-gray-700">
                    Student Email Address
                  </label>
                  <input
                    id="link_email"
                    type="email"
                    value={linkEmail}
                    onChange={(event) => setLinkEmail(event.target.value)}
                    disabled={submitting}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="student@example.com"
                  />
                  <p className="mt-2 text-sm text-gray-500">
                    The student must already have an iTutor account and be registered as a student.
                  </p>
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  Linking an existing student will switch their billing mode to parent-managed and
                  attach the account to your dashboard.
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-700 transition hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting ? 'Linking...' : 'Link Existing Student'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
