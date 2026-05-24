'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { AlertTriangle, Clock, Upload, X } from 'lucide-react';

const NOSHOW_RESPONSE_WINDOW_HOURS = 12;

type Props = {
  claimId: string;
  rolePath: '/tutor' | '/student';
};

type EvidenceFile = {
  path: string;
  original_name: string;
  size: number;
  type: string;
};

export default function DisputeResponseView({ claimId, rolePath }: Props) {
  const router = useRouter();
  const [claim, setClaim] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [response, setResponse] = useState('');
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('noshow_claims')
        .select(
          'id, status, response_deadline, claimant_role, written_explanation, evidence_files, evidence_type, defendant_response, defendant_responded_at, admin_verdict, admin_decided_at, admin_notes, session_id, created_at'
        )
        .eq('id', claimId)
        .maybeSingle();
      setClaim(data);
      setLoading(false);
    })();
  }, [claimId]);

  async function handleUpload(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      const urlRes = await fetch('/api/noshow-claims/evidence-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData?.error || 'Failed to get upload URL');

      const { error: uploadErr } = await supabase.storage
        .from('noshow-evidence')
        .uploadToSignedUrl(urlData.path, urlData.token, file, { contentType: file.type });
      if (uploadErr) throw uploadErr;

      setEvidenceFiles((prev) => [
        ...prev,
        { path: urlData.path, original_name: file.name, size: file.size, type: file.type },
      ]);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/noshow-claims/${claimId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response: response.trim(),
          evidenceFiles,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Failed to submit response');
        return;
      }
      router.push(`${rolePath}/bookings`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-10 text-center text-gray-500">Loading…</div>;
  if (!claim) return <div className="p-10 text-center text-red-600">Dispute not found.</div>;

  const expired = new Date(claim.response_deadline).getTime() < Date.now();
  const isAwaiting = claim.status === 'awaiting_response';
  const hoursLeft = Math.max(
    0,
    Math.round((new Date(claim.response_deadline).getTime() - Date.now()) / 3_600_000)
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-red-600 text-white px-6 py-5">
          <h1 className="text-xl font-bold">No-show claim against you</h1>
          <p className="text-sm opacity-90 mt-1">
            {claim.claimant_role === 'student' ? 'A student' : 'A tutor'} has filed a no-show claim. You have{' '}
            {NOSHOW_RESPONSE_WINDOW_HOURS} hours to respond before it auto-escalates to admin.
          </p>
        </div>

        <div className="p-6 space-y-5">
          {isAwaiting && (
            <div className={`rounded-xl border-2 p-3 text-sm flex items-center gap-2 ${expired ? 'border-red-300 bg-red-50 text-red-800' : hoursLeft < 3 ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-blue-300 bg-blue-50 text-blue-800'}`}>
              <Clock className="w-4 h-4" />
              {expired ? 'Response window expired.' : `${hoursLeft} hour${hoursLeft === 1 ? '' : 's'} remaining to respond.`}
            </div>
          )}

          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">Their account</div>
            <div className="rounded-xl border bg-gray-50 p-4 text-sm whitespace-pre-wrap">
              {claim.written_explanation}
            </div>
          </div>

          {Array.isArray(claim.evidence_files) && claim.evidence_files.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">Their evidence</div>
              <ul className="text-xs space-y-1">
                {claim.evidence_files.map((f: any, i: number) => (
                  <li key={i} className="rounded-lg bg-gray-100 px-3 py-2 truncate">
                    {f.original_name || f.path}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!isAwaiting && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600">
              You've already submitted your response{claim.defendant_responded_at ? ` on ${new Date(claim.defendant_responded_at).toLocaleString()}` : ''}. Admin review is in progress.
            </div>
          )}

          {isAwaiting && !expired && (
            <>
              <div>
                <div className="font-semibold text-gray-900 mb-1">Your response</div>
                <p className="text-xs text-gray-500 mb-2">
                  Provide a clear, factual account. Minimum 20 characters.
                </p>
                <textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  rows={6}
                  className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 text-sm"
                  placeholder="Describe what happened from your perspective. Include exact times and what you observed."
                />
                <div className="text-xs text-gray-400 mt-1 text-right">{response.trim().length}/20</div>
              </div>

              <div>
                <div className="font-semibold text-gray-900 mb-1">Counter-evidence (optional)</div>
                <label className="block border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUpload(f);
                      e.target.value = '';
                    }}
                  />
                  <Upload className="w-5 h-5 mx-auto text-gray-500 mb-1" />
                  <div className="text-sm font-semibold text-gray-700">
                    {uploading ? 'Uploading…' : 'Click to upload a screenshot'}
                  </div>
                  <div className="text-xs text-gray-500">PNG, JPG, or WEBP — max 5 MB</div>
                </label>
                {uploadError && <p className="text-xs text-red-600 mt-2">{uploadError}</p>}

                {evidenceFiles.length > 0 && (
                  <ul className="space-y-1 mt-2">
                    {evidenceFiles.map((f, i) => (
                      <li key={i} className="flex items-center justify-between rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm">
                        <span className="truncate">{f.original_name}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setEvidenceFiles((prev) => prev.filter((_, idx) => idx !== i))
                          }
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  Failing to respond before the deadline weighs against you in admin review. Provide your
                  account and any evidence you have to support it.
                </p>
              </div>

              {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  {error}
                </div>
              )}

              <button
                type="button"
                disabled={submitting || response.trim().length < 20}
                onClick={() => void submit()}
                className="w-full px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit response'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
