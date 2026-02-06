'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useProfile } from '@/lib/hooks/useProfile';

interface Session {
  id: string;
  session_date: string;
  duration_minutes: number;
  charge_amount_ttd: string;
  platform_fee_ttd: string;
  tutor_payout_ttd: string;
  status: string;
  payment_status: string;
  created_at: string;
  student: {
    id: string;
    full_name: string;
    email: string;
    school: string;
    country: string;
  } | null;
  tutor: {
    id: string;
    full_name: string;
    email: string;
  } | null;
  subject: {
    id: string;
    label: string;
  } | null;
}

interface Totals {
  revenue: string;
  transactionVolume: string;
  tutorPayouts: string;
  sessionCount: number;
}

export default function PaymentsPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [totals, setTotals] = useState<Totals>({
    revenue: '0.00',
    transactionVolume: '0.00',
    tutorPayouts: '0.00',
    sessionCount: 0,
  });
  const [schools, setSchools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [schoolFilter, setSchoolFilter] = useState('all');
  const [schoolSearchQuery, setSchoolSearchQuery] = useState('');
  const [showSchoolDropdown, setShowSchoolDropdown] = useState(false);
  const [filteredSchools, setFilteredSchools] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [tutorSearch, setTutorSearch] = useState('');

  useEffect(() => {
    if (!profileLoading && !profile?.is_reviewer && profile?.role !== 'admin') {
      router.push('/');
    }
  }, [profile, profileLoading, router]);

  useEffect(() => {
    fetchPayments();
  }, [schoolFilter, statusFilter, startDate, endDate, studentSearch, tutorSearch]);

  // Filter schools based on search query
  useEffect(() => {
    if (schoolSearchQuery.trim()) {
      const filtered = schools.filter(school =>
        school.toLowerCase().includes(schoolSearchQuery.toLowerCase())
      );
      setFilteredSchools(filtered);
    } else {
      setFilteredSchools(schools);
    }
  }, [schoolSearchQuery, schools]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (schoolFilter !== 'all') params.append('school', schoolFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (studentSearch) params.append('student', studentSearch);
      if (tutorSearch) params.append('tutor', tutorSearch);

      const response = await fetch(`/api/admin/payments?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions);
        setTotals(data.totals);
        setSchools(data.schools);
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const setQuickDateRange = (range: 'today' | 'week' | 'month' | 'all') => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    switch (range) {
      case 'today':
        setStartDate(todayStr);
        setEndDate(todayStr);
        break;
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);
        setStartDate(weekAgo.toISOString().split('T')[0]);
        setEndDate(todayStr);
        break;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(today.getMonth() - 1);
        setStartDate(monthAgo.toISOString().split('T')[0]);
        setEndDate(todayStr);
        break;
      case 'all':
        setStartDate('');
        setEndDate('');
        break;
    }
  };

  if (profileLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading...</div>;
  }

  if (!profile?.is_reviewer && profile?.role !== 'admin') {
    return null;
  }

  return (
    <DashboardLayout role={profile.role === 'admin' ? 'admin' : 'reviewer'} userName={profile.full_name || 'Admin'}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Payment & Revenue Management</h1>
          <p className="text-gray-600 mt-2">View and analyze all transactions and revenue</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="text-sm text-gray-600 mb-1">Platform Revenue</div>
            <div className="text-3xl font-bold text-itutor-green">
              ${totals.revenue}
            </div>
            <div className="text-xs text-gray-500 mt-1">Commission fees collected</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="text-sm text-gray-600 mb-1">Total Volume</div>
            <div className="text-3xl font-bold text-blue-600">
              ${totals.transactionVolume}
            </div>
            <div className="text-xs text-gray-500 mt-1">Total transaction value</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="text-sm text-gray-600 mb-1">Tutor Payouts</div>
            <div className="text-3xl font-bold text-purple-600">
              ${totals.tutorPayouts}
            </div>
            <div className="text-xs text-gray-500 mt-1">Paid to tutors</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="text-sm text-gray-600 mb-1">Sessions</div>
            <div className="text-3xl font-bold text-gray-900">
              {totals.sessionCount}
            </div>
            <div className="text-xs text-gray-500 mt-1">Completed sessions</div>
          </div>
        </div>

        {/* Quick Date Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm font-medium text-gray-700">Quick filters:</span>
            <button
              onClick={() => setQuickDateRange('today')}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Today
            </button>
            <button
              onClick={() => setQuickDateRange('week')}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setQuickDateRange('month')}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Last 30 Days
            </button>
            <button
              onClick={() => setQuickDateRange('all')}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              All Time
            </button>
          </div>

          {/* Detailed Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-2">School</label>
              
              {/* Selected School Display */}
              {schoolFilter !== 'all' ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="flex-1 text-sm text-gray-900">{schoolFilter}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSchoolFilter('all');
                      setSchoolSearchQuery('');
                    }}
                    className="p-1 hover:bg-blue-100 rounded-full transition"
                  >
                    <svg className="h-4 w-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="All schools"
                    value={schoolSearchQuery}
                    onChange={(e) => {
                      setSchoolSearchQuery(e.target.value);
                      if (e.target.value.trim()) {
                        setShowSchoolDropdown(true);
                      }
                    }}
                    onFocus={() => {
                      if (schoolSearchQuery.trim()) {
                        setShowSchoolDropdown(true);
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-itutor-green"
                  />

                  {/* Dropdown Results */}
                  {showSchoolDropdown && filteredSchools.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredSchools.map((school) => (
                        <button
                          key={school}
                          type="button"
                          onClick={() => {
                            setSchoolFilter(school);
                            setSchoolSearchQuery('');
                            setShowSchoolDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-blue-50 transition border-b border-gray-100 last:border-0"
                        >
                          <p className="text-sm text-gray-900">{school}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* No results message */}
                  {showSchoolDropdown && filteredSchools.length === 0 && schoolSearchQuery.trim() && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                      <p className="text-sm text-gray-500 text-center">No schools found</p>
                    </div>
                  )}
                </>
              )}

              {/* Click outside to close */}
              {showSchoolDropdown && (
                <div
                  className="fixed inset-0 z-0"
                  onClick={() => setShowSchoolDropdown(false)}
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-itutor-green"
              >
                <option value="all">All Statuses</option>
                <option value="COMPLETED">Completed</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-itutor-green"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-itutor-green"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search Student</label>
              <input
                type="text"
                placeholder="Name or email..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-itutor-green"
              />
            </div>
          </div>
        </div>

        {/* Payments Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Student
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tutor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subject
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Platform Fee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      Loading payments...
                    </td>
                  </tr>
                ) : sessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      No payments found
                    </td>
                  </tr>
                ) : (
                  sessions.map((session) => (
                    <tr key={session.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(session.session_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {session.student?.full_name || 'N/A'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {session.student?.school || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {session.tutor?.full_name || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {session.subject?.label || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        ${parseFloat(session.charge_amount_ttd).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-itutor-green">
                        ${parseFloat(session.platform_fee_ttd).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          session.status === 'COMPLETED' 
                            ? 'bg-green-100 text-green-800' 
                            : session.status === 'CONFIRMED'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {session.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

