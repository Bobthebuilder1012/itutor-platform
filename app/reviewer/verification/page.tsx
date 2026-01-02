'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { format } from 'date-fns';
import DashboardLayout from '@/components/DashboardLayout';
import { getDisplayName } from '@/lib/utils/displayName';
import SupportFormModal from '@/components/SupportFormModal';

interface VerificationRequest {
  id: string;
  tutor_id: string;
  status: string;
  file_type: string;
  original_filename: string;
  confidence_score: number | null;
  system_recommendation: string | null;
  system_reason: string | null;
  extracted_json: any;
  created_at: string;
  previewUrl: string | null;
  tutor: {
    full_name: string;
    display_name: string | null;
    email: string;
  };
}

export default function ReviewerVerificationPage() {
  const { profile, loading: profileLoading } = useProfile();
  const router = useRouter();
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('READY_FOR_REVIEW');
  const [showDecisionModal, setShowDecisionModal] = useState<{
    request: VerificationRequest;
    decision: 'APPROVE' | 'REJECT';
  } | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [showBulkModal, setShowBulkModal] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [bulkReason, setBulkReason] = useState('');
  const [showSupportForm, setShowSupportForm] = useState(false);

  useEffect(() => {
    if (profileLoading) return;

    if (!profile || !profile.is_reviewer) {
      router.push('/login');
      return;
    }

    fetchRequests();
  }, [profile, profileLoading, router, statusFilter]);

  async function fetchRequests() {
    try {
      setLoading(true);
      const response = await fetch(`/api/reviewer/verification-requests?status=${statusFilter}`);
      const data = await response.json();

      if (data.success) {
        setRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDecision(requestId: string, decision: 'APPROVE' | 'REJECT', reason?: string) {
    setProcessing(requestId);

    try {
      const response = await fetch(`/api/reviewer/verification-requests/${requestId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reviewer_reason: reason }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Failed to process decision');
        return;
      }

      alert(`Verification ${decision.toLowerCase()}ed successfully!`);
      setShowDecisionModal(null);
      setDecisionReason('');
      await fetchRequests();
    } catch (error: any) {
      console.error('Error processing decision:', error);
      alert(error.message || 'Failed to process decision');
    } finally {
      setProcessing(null);
    }
  }

  async function handleBulkDecision(decision: 'APPROVE' | 'REJECT') {
    const requestIds = Array.from(selectedRequests);

    if (requestIds.length === 0) {
      alert('Please select at least one request');
      return;
    }

    setProcessing('bulk');

    try {
      const response = await fetch('/api/reviewer/verification-requests/bulk-decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_ids: requestIds,
          decision,
          global_reviewer_reason: bulkReason || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Failed to process bulk decision');
        return;
      }

      alert(`Bulk ${decision.toLowerCase()} completed: ${data.results.processed} processed, ${data.results.failed} failed`);
      setShowBulkModal(null);
      setBulkReason('');
      setSelectedRequests(new Set());
      await fetchRequests();
    } catch (error: any) {
      console.error('Error processing bulk decision:', error);
      alert(error.message || 'Failed to process bulk decision');
    } finally {
      setProcessing(null);
    }
  }

  function toggleSelectRequest(id: string) {
    const newSelected = new Set(selectedRequests);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRequests(newSelected);
  }

  function selectAll() {
    setSelectedRequests(new Set(requests.map(r => r.id)));
  }

  function deselectAll() {
    setSelectedRequests(new Set());
  }

  if (profileLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  const getTutorName = (tutor: any) => tutor.display_name || tutor.full_name;
  const displayName = getDisplayName(profile);

  return (
    <DashboardLayout role="reviewer" userName={displayName}>
      <div className="space-y-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Tutor Verification Queue</h1>
          <p className="text-gray-600">Review and approve tutor verification requests</p>
          <p className="text-sm text-gray-500 mt-2">
            Need help?{' '}
            <button
              onClick={() => setShowSupportForm(true)}
              className="text-itutor-green hover:text-emerald-600 font-semibold underline"
            >
              Contact support
            </button>
          </p>
        </div>

        {/* Filters and Bulk Actions */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex gap-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
              >
                <option value="READY_FOR_REVIEW">Ready for Review</option>
                <option value="PROCESSING">Processing</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>

              {selectedRequests.size > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowBulkModal('APPROVE')}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition"
                  >
                    Approve Selected ({selectedRequests.size})
                  </button>
                  <button
                    onClick={() => setShowBulkModal('REJECT')}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition"
                  >
                    Reject Selected ({selectedRequests.size})
                  </button>
                  <button
                    onClick={deselectAll}
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition"
                  >
                    Clear Selection
                  </button>
                </div>
              )}
            </div>

            {requests.length > 0 && (
              <button
                onClick={selectAll}
                className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg font-medium hover:bg-gray-200 transition"
              >
                Select All
              </button>
            )}
          </div>
        </div>

        {/* Requests Table */}
        {requests.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <div className="text-6xl mb-4">📋</div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">No Requests Found</h3>
            <p className="text-gray-600">No verification requests with status "{statusFilter}"</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">Select</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">Tutor</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">Submitted</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">Confidence</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">System Rec.</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {requests.map((request) => (
                    <tr key={request.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedRequests.has(request.id)}
                          onChange={() => toggleSelectRequest(request.id)}
                          className="w-5 h-5 text-itutor-green rounded focus:ring-itutor-green"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-semibold text-gray-900">{getTutorName(request.tutor)}</div>
                          <div className="text-sm text-gray-600">{request.tutor.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {format(new Date(request.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-6 py-4">
                        {request.confidence_score ? (
                          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            request.confidence_score >= 80 ? 'bg-green-100 text-green-800' :
                            request.confidence_score >= 60 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {request.confidence_score}%
                          </span>
                        ) : (
                          <span className="text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {request.system_recommendation ? (
                          <div>
                            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                              request.system_recommendation === 'APPROVE' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {request.system_recommendation}
                            </span>
                            {request.system_reason && (
                              <p className="text-xs text-gray-600 mt-1">{request.system_reason}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">Processing...</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          {request.previewUrl && (
                            <a
                              href={request.previewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition"
                            >
                              View
                            </a>
                          )}
                          <button
                            onClick={() => setShowDecisionModal({ request, decision: 'APPROVE' })}
                            disabled={processing === request.id}
                            className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setShowDecisionModal({ request, decision: 'REJECT' })}
                            disabled={processing === request.id}
                            className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Decision Modal */}
        {showDecisionModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                {showDecisionModal.decision === 'APPROVE' ? 'Approve' : 'Reject'} Verification
              </h3>

              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-600 mb-2">Tutor:</p>
                <p className="font-semibold text-gray-900">{getTutorName(showDecisionModal.request.tutor)}</p>
                <p className="text-sm text-gray-600 mt-3 mb-2">System Recommendation:</p>
                <p className={`font-semibold ${
                  showDecisionModal.request.system_recommendation === 'APPROVE' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {showDecisionModal.request.system_recommendation}
                </p>
                {showDecisionModal.request.system_reason && (
                  <>
                    <p className="text-sm text-gray-600 mt-3 mb-2">System Reason:</p>
                    <p className="text-gray-700">{showDecisionModal.request.system_reason}</p>
                  </>
                )}
              </div>

              {/* Reason field - required when rejecting system-approved requests */}
              {showDecisionModal.decision === 'REJECT' && showDecisionModal.request.system_recommendation === 'APPROVE' ? (
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Reason <span className="text-red-600">*</span> (Required when rejecting system-approved request)
                  </label>
                  <textarea
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
                    placeholder="Explain why you're rejecting this verification..."
                  />
                </div>
              ) : (
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Reason <span className="text-gray-500">(Optional)</span>
                  </label>
                  <textarea
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
                    placeholder="Add any notes..."
                  />
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowDecisionModal(null);
                    setDecisionReason('');
                  }}
                  className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDecision(showDecisionModal.request.id, showDecisionModal.decision, decisionReason)}
                  disabled={
                    processing === showDecisionModal.request.id ||
                    (showDecisionModal.decision === 'REJECT' && 
                     showDecisionModal.request.system_recommendation === 'APPROVE' && 
                     !decisionReason.trim())
                  }
                  className={`px-6 py-3 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                    showDecisionModal.decision === 'APPROVE'
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  {processing === showDecisionModal.request.id ? 'Processing...' : `Confirm ${showDecisionModal.decision}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Decision Modal */}
        {showBulkModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                Bulk {showBulkModal === 'APPROVE' ? 'Approve' : 'Reject'}
              </h3>

              <p className="text-gray-700 mb-6">
                You are about to {showBulkModal.toLowerCase()} <strong>{selectedRequests.size}</strong> verification request(s).
              </p>

              {showBulkModal === 'REJECT' && (
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-900 mb-2">
                    Global Reason <span className="text-gray-500">(May be required)</span>
                  </label>
                  <textarea
                    value={bulkReason}
                    onChange={(e) => setBulkReason(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-itutor-green focus:border-itutor-green"
                    placeholder="Reason for bulk rejection (required if any requests were system-recommended for approval)..."
                  />
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowBulkModal(null);
                    setBulkReason('');
                  }}
                  className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-semibold hover:bg-gray-300 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleBulkDecision(showBulkModal)}
                  disabled={processing === 'bulk'}
                  className={`px-6 py-3 rounded-lg font-semibold transition disabled:opacity-50 ${
                    showBulkModal === 'APPROVE'
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  {processing === 'bulk' ? 'Processing...' : `Confirm Bulk ${showBulkModal}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Support Form Modal */}
        <SupportFormModal isOpen={showSupportForm} onClose={() => setShowSupportForm(false)} />
      </div>
    </DashboardLayout>
  );
}

