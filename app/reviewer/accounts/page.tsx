'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useProfile } from '@/lib/hooks/useProfile';

interface Account {
  id: string;
  role: string;
  full_name: string;
  email: string;
  phone_number: string;
  country: string;
  school: string;
  is_suspended: boolean;
  suspended_at: string | null;
  suspension_reason: string | null;
  created_at: string;
  rating_average: number | null;
  tutor_verification_status: string | null;
  parent_links?: Array<{
    parent: {
      id: string;
      full_name: string;
      email: string;
    } | null;
  }>;
}

export default function AccountsPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all');
  const [suspendedFilter, setSuspendedFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [schools, setSchools] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<Array<{id: string, name: string}>>([]);

  useEffect(() => {
    if (!profileLoading && !profile?.is_reviewer && profile?.role !== 'admin') {
      router.push('/');
    }
  }, [profile, profileLoading, router]);

  useEffect(() => {
    fetchAccounts();
  }, [roleFilter, suspendedFilter, searchQuery, schoolFilter, subjectFilter]);

  useEffect(() => {
    // Fetch list of schools and subjects for filters
    fetchFilterOptions();
  }, []);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (roleFilter !== 'all') params.append('role', roleFilter);
      if (suspendedFilter !== 'all') params.append('suspended', suspendedFilter);
      if (searchQuery) params.append('search', searchQuery);
      if (schoolFilter !== 'all') params.append('school', schoolFilter);
      if (subjectFilter !== 'all') params.append('subject', subjectFilter);

      const response = await fetch(`/api/admin/accounts?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setAccounts(data.accounts);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      // Fetch distinct schools
      const schoolsResponse = await fetch('/api/admin/filter-options?type=schools');
      if (schoolsResponse.ok) {
        const { schools: schoolsList } = await schoolsResponse.json();
        setSchools(schoolsList);
      }

      // Fetch subjects
      const subjectsResponse = await fetch('/api/admin/filter-options?type=subjects');
      if (subjectsResponse.ok) {
        const { subjects: subjectsList } = await subjectsResponse.json();
        setSubjects(subjectsList);
      }
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  };

  if (profileLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading...</div>;
  }

  if (!profile?.is_reviewer) {
    return null;
  }

  return (
    <DashboardLayout role={profile.role === 'admin' ? 'admin' : 'reviewer'} userName={profile.full_name || 'Admin'}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">User Account Management</h1>
          <p className="text-gray-600 mt-2">View and manage all user accounts</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-itutor-green"
              >
                <option value="all">All Roles</option>
                <option value="student">Students</option>
                <option value="parent">Parents</option>
                <option value="tutor">Tutors</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={suspendedFilter}
                onChange={(e) => setSuspendedFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-itutor-green"
              >
                <option value="all">All Accounts</option>
                <option value="false">Active</option>
                <option value="true">Suspended</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">School</label>
              <select
                value={schoolFilter}
                onChange={(e) => setSchoolFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-itutor-green"
              >
                <option value="all">All Schools</option>
                {schools.map((school) => (
                  <option key={school} value={school}>
                    {school}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Subject</label>
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-itutor-green"
              >
                <option value="all">All Subjects</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <input
                type="text"
                placeholder="Name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-itutor-green"
              />
            </div>
          </div>
        </div>

        {/* Accounts Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      Loading accounts...
                    </td>
                  </tr>
                ) : accounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      No accounts found
                    </td>
                  </tr>
                ) : (
                  accounts.map((account) => (
                    <tr key={account.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{account.full_name}</div>
                          {account.school && (
                            <div className="text-sm text-gray-500">{account.school}</div>
                          )}
                          {account.role === 'student' && account.parent_links && account.parent_links.length > 0 && account.parent_links[0]?.parent && (
                            <div className="text-xs text-blue-600 mt-1">
                              Parent: {account.parent_links[0].parent.full_name}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 capitalize">
                          {account.role}
                        </span>
                        {account.role === 'tutor' && account.tutor_verification_status === 'VERIFIED' && (
                          <span className="ml-2 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                            Verified
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{account.email}</div>
                        {account.phone_number && (
                          <div className="text-sm text-gray-500">{account.phone_number}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {account.is_suspended ? (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                            Suspended
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(account.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => router.push(`/reviewer/accounts/${account.id}`)}
                          className="text-itutor-green hover:text-emerald-600"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-sm text-gray-600">Total Accounts</div>
            <div className="text-2xl font-bold text-gray-900">{accounts.length}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-sm text-gray-600">Active</div>
            <div className="text-2xl font-bold text-green-600">
              {accounts.filter((a) => !a.is_suspended).length}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-sm text-gray-600">Suspended</div>
            <div className="text-2xl font-bold text-red-600">
              {accounts.filter((a) => a.is_suspended).length}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-sm text-gray-600">Verified Tutors</div>
            <div className="text-2xl font-bold text-blue-600">
              {accounts.filter((a) => a.role === 'tutor' && a.tutor_verification_status === 'VERIFIED').length}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

