'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { useProfile } from '@/lib/hooks/useProfile';

type VerificationRequest = {
  id: string;
  tutor_id: string;
  status: string;
  created_at: string;
  file_type: string;
  original_filename: string;
  document_url: string | null;
  tutor: {
    id: string;
    full_name: string;
    email: string;
    phone_number: string | null;
  };
  reviewer: {
    full_name: string;
  } | null;
  reviewer_reason: string | null;
  reviewed_at: string | null;
};

type VerifiedSubject = {
  id: string;
  exam_type: string;
  grade: number;
  year: number | null;
  session: string | null;
  subjects: {
    id: string;
    name: string;
  };
};

type Subject = {
  id: string;
  name: string;
  curriculum: string;
  level: string;
};

export default function VerificationDetailPage({ params }: { params: { requestId: string } }) {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [request, setRequest] = useState<VerificationRequest | null>(null);
  const [verifiedSubjects, setVerifiedSubjects] = useState<VerifiedSubject[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Form state for adding subjects
  const [subjectId, setSubjectId] = useState('');
  const [examType, setExamType] = useState<'CSEC' | 'CAPE'>('CSEC');
  const [grade, setGrade] = useState('');
  const [year, setYear] = useState('');
  const [session, setSession] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
  const [subjectDropdownOpen, setSubjectDropdownOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile || (!profile.is_reviewer && profile.role !== 'admin')) {
      router.push('/login');
      return;
    }
    fetchData();
  }, [profile, profileLoading, router, params.requestId]);

  async function fetchData() {
    setLoading(true);
    try {
      const [requestRes, subjectsRes] = await Promise.all([
        fetch(`/api/admin/verification/requests/${params.requestId}`),
        fetch('/api/subjects') // Assuming you have this endpoint
      ]);

      const requestData = await requestRes.json();
      setRequest(requestData.request);
      setVerifiedSubjects(requestData.verified_subjects || []);

      if (subjectsRes.ok) {
        const subjectsData = await subjectsRes.json();
        setAllSubjects(subjectsData.subjects || []);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectId || !grade) return;

    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/verification/requests/${params.requestId}/add-subject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_id: subjectId,
          exam_type: examType,
          grade: parseInt(grade),
          year: year ? parseInt(year) : null,
          session: session || null
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add subject');
      }

      // Reset form
      setSubjectId('');
      setSubjectSearchQuery('');
      setGrade('');
      setYear('');
      setSession('');

      // Refresh data
      await fetchData();
      alert('Subject added successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to add subject');
    } finally {
      setProcessing(false);
    }
  }

  const handleRemoveSubject = useCallback(
    async (verifiedSubjectId: string) => {
      if (!confirm('Remove this verified subject from the list?')) return;
      setRemovingId(verifiedSubjectId);
      try {
        const res = await fetch(
          `/api/admin/verification/requests/${params.requestId}/verified-subjects/${verifiedSubjectId}`,
          { method: 'DELETE' }
        );
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to remove');
        }
        setVerifiedSubjects((prev) => prev.filter((s) => s.id !== verifiedSubjectId));
      } catch (err: any) {
        alert(err.message || 'Failed to remove subject');
      } finally {
        setRemovingId(null);
      }
    },
    [params.requestId]
  );

  async function handleApprove() {
    if (verifiedSubjects.length === 0) {
      alert('Please add at least one verified subject before approving.');
      return;
    }

    if (!confirm('Are you sure you want to approve this verification request?')) {
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/verification/requests/${params.requestId}/approve`, {
        method: 'POST'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to approve');
      }

      alert('Verification approved successfully!');
      router.push('/reviewer/verification/queue');
    } catch (err: any) {
      alert(err.message || 'Failed to approve');
      setProcessing(false);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      alert('Please provide a reason for rejection.');
      return;
    }

    if (!confirm('Are you sure you want to reject this verification request?')) {
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch(`/api/admin/verification/requests/${params.requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reject');
      }

      alert('Verification rejected.');
      router.push('/reviewer/verification/queue');
    } catch (err: any) {
      alert(err.message || 'Failed to reject');
      setProcessing(false);
    }
  }

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  const displayName = profile.full_name || profile.email?.split('@')[0] || 'Reviewer';

  return (
    <DashboardLayout role={profile.role === 'admin' ? 'admin' : 'reviewer'} userName={displayName}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.push('/reviewer/verification/queue')}
            className="text-itutor-green hover:text-emerald-700 font-medium mb-4 flex items-center gap-2"
          >
            ← Back to Queue
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Review Verification Request</h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-itutor-green"></div>
          </div>
        ) : !request ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Request not found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Document & Tutor Info */}
            <div className="space-y-6">
              {/* Tutor Info */}
              <div className="bg-white border-2 border-gray-200 rounded-lg p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Tutor Information</h2>
                <dl className="space-y-2">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Name</dt>
                    <dd className="text-sm text-gray-900">{request.tutor.full_name}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Email</dt>
                    <dd className="text-sm text-gray-900">{request.tutor.email}</dd>
                  </div>
                  {request.tutor.phone_number && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Phone</dt>
                      <dd className="text-sm text-gray-900">{request.tutor.phone_number}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Submitted</dt>
                    <dd className="text-sm text-gray-900">{new Date(request.created_at).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Status</dt>
                    <dd>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        request.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                        request.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {request.status}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Document Viewer */}
              <div className="bg-white border-2 border-gray-200 rounded-lg p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Document</h2>
                {request.document_url ? (
                  <div className="border border-gray-300 rounded-lg overflow-hidden">
                    {request.file_type === 'pdf' ? (
                      <iframe
                        src={request.document_url}
                        className="w-full h-[600px]"
                        title="Verification Document"
                      />
                    ) : (
                      <img
                        src={request.document_url}
                        alt="Verification Document"
                        className="w-full h-auto"
                      />
                    )}
                  </div>
                ) : (
                  <p className="text-gray-600">Document not available</p>
                )}
                {request.document_url && (
                  <a
                    href={request.document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block text-itutor-green hover:text-emerald-700 font-medium"
                  >
                    Open in New Tab →
                  </a>
                )}
              </div>
            </div>

            {/* Right Column: Add Subjects & Actions */}
            <div className="space-y-6">
              {/* Add Subject Form */}
              {request.status !== 'APPROVED' && request.status !== 'REJECTED' && (
                <div className="bg-white border-2 border-gray-200 rounded-lg p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Add Verified Subject</h2>
                  <form onSubmit={handleAddSubject} className="space-y-4">
                    <div className="relative">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Subject *
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                        <input
                          type="text"
                          placeholder="Search subjects..."
                          value={subjectSearchQuery}
                          onChange={(e) => {
                            setSubjectSearchQuery(e.target.value);
                            setSubjectDropdownOpen(true);
                          }}
                          onFocus={() => setSubjectDropdownOpen(true)}
                          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
                        />
                      </div>
                      
                      {subjectDropdownOpen && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {allSubjects
                            .filter(s => s.curriculum === examType)
                            .filter(s => 
                              s.name.toLowerCase().includes(subjectSearchQuery.toLowerCase()) ||
                              s.level.toLowerCase().includes(subjectSearchQuery.toLowerCase())
                            )
                            .map((subject) => (
                              <button
                                key={subject.id}
                                type="button"
                                onClick={() => {
                                  setSubjectId(subject.id);
                                  setSubjectSearchQuery(subject.name);
                                  setSubjectDropdownOpen(false);
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors"
                              >
                                <div className="font-medium text-gray-900">{subject.name}</div>
                                <div className="text-sm text-gray-600">{subject.curriculum} • {subject.level}</div>
                              </button>
                            ))}
                          {allSubjects
                            .filter(s => s.curriculum === examType)
                            .filter(s => 
                              s.name.toLowerCase().includes(subjectSearchQuery.toLowerCase()) ||
                              s.level.toLowerCase().includes(subjectSearchQuery.toLowerCase())
                            ).length === 0 && (
                            <div className="px-4 py-3 text-sm text-gray-600">
                              No subjects found
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Exam Type *
                      </label>
                      <div className="flex gap-4">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            value="CSEC"
                            checked={examType === 'CSEC'}
                            onChange={(e) => {
                              setExamType('CSEC');
                              setSubjectId('');
                              setSubjectSearchQuery(''); // Reset subject when changing exam type
                            }}
                            className="mr-2"
                          />
                          CSEC
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            value="CAPE"
                            checked={examType === 'CAPE'}
                            onChange={(e) => {
                              setExamType('CAPE');
                              setSubjectId('');
                              setSubjectSearchQuery(''); // Reset subject when changing exam type
                            }}
                            className="mr-2"
                          />
                          CAPE
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Grade (1-9) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="9"
                        value={grade}
                        onChange={(e) => setGrade(e.target.value)}
                        required
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Year (optional)
                        </label>
                        <input
                          type="number"
                          min="2000"
                          max="2030"
                          value={year}
                          onChange={(e) => setYear(e.target.value)}
                          placeholder="2024"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Session (optional)
                        </label>
                        <input
                          type="text"
                          value={session}
                          onChange={(e) => setSession(e.target.value)}
                          placeholder="May/June"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={processing}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-semibold transition-colors disabled:opacity-50"
                    >
                      {processing ? 'Adding...' : 'Add Subject'}
                    </button>
                  </form>
                </div>
              )}

              {/* Verified Subjects List */}
              <div className="bg-white border-2 border-gray-200 rounded-lg p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  Verified Subjects ({verifiedSubjects.length})
                </h2>
                {verifiedSubjects.length === 0 ? (
                  <p className="text-gray-600 text-sm">No subjects added yet</p>
                ) : (
                  <div className="space-y-2">
                    {verifiedSubjects.map((subject) => (
                      <div key={subject.id} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-900">{subject.subjects.name}</p>
                            <p className="text-sm text-gray-600">
                              {subject.exam_type} • Grade {subject.grade}
                              {subject.year && ` • ${subject.year}`}
                              {subject.session && ` • ${subject.session}`}
                            </p>
                          </div>
                          {request.status !== 'APPROVED' && request.status !== 'REJECTED' && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSubject(subject.id)}
                              disabled={removingId === subject.id}
                              className="shrink-0 text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded text-sm font-medium transition-colors disabled:opacity-50"
                              title="Remove this verified subject"
                            >
                              {removingId === subject.id ? 'Removing...' : 'Remove'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              {request.status !== 'APPROVED' && request.status !== 'REJECTED' && (
                <div className="bg-white border-2 border-gray-200 rounded-lg p-6 space-y-4">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Actions</h2>
                  
                  <button
                    onClick={handleApprove}
                    disabled={processing || verifiedSubjects.length === 0}
                    className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Approve Verification
                  </button>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Rejection Reason
                    </label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                      placeholder="Explain why this verification is being rejected..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    />
                    <button
                      onClick={handleReject}
                      disabled={processing || !rejectReason.trim()}
                      className="w-full mt-2 bg-red-600 hover:bg-red-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Reject Verification
                    </button>
                  </div>
                </div>
              )}

              {/* Already Reviewed */}
              {(request.status === 'APPROVED' || request.status === 'REJECTED') && (
                <div className={`border-2 rounded-lg p-6 ${
                  request.status === 'APPROVED' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">
                    {request.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                  </h2>
                  <p className="text-sm text-gray-700 mb-2">
                    Reviewed on: {request.reviewed_at && new Date(request.reviewed_at).toLocaleString()}
                  </p>
                  {request.reviewer && (
                    <p className="text-sm text-gray-700 mb-2">
                      By: {request.reviewer.full_name}
                    </p>
                  )}
                  {request.reviewer_reason && (
                    <div className="mt-3 p-3 bg-white border rounded">
                      <p className="text-sm font-medium text-gray-900 mb-1">Reason:</p>
                      <p className="text-sm text-gray-700">{request.reviewer_reason}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

