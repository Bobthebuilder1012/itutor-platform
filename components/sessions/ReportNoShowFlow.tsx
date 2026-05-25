'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Session } from '@/lib/types/sessions';
import { supabase } from '@/lib/supabase/client';
import { Lock, Upload, X, AlertTriangle } from 'lucide-react';

const NO_SHOW_WAIT_MINUTES = 15;
const NOSHOW_CLAIM_FILING_WINDOW_HOURS = 24;

type Props = {
  session: Session;
  userRole: 'student' | 'tutor';
  onSuccess: () => void;
};

type EvidenceFile = {
  path: string;
  original_name: string;
  size: number;
  type: string;
};

export default function ReportNoShowFlow({ session, userRole, onSuccess }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [canMark, setCanMark] = useState(false);
  const [minutesRemaining, setMinutesRemaining] = useState<number | null>(null);
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFile[]>([]);
  const [evidenceType, setEvidenceType] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function check() {
      const now = new Date();
      const start = new Date(session.scheduled_start_at);
      const waitDeadline = new Date(start.getTime() + NO_SHOW_WAIT_MINUTES * 60_000);
      const filingDeadline = new Date(start.getTime() + NOSHOW_CLAIM_FILING_WINDOW_HOURS * 3_600_000);
      const eligible =
        now >= waitDeadline &&
        now <= filingDeadline &&
        (session.status === 'SCHEDULED' || session.status === 'JOIN_OPEN');
      setCanMark(eligible);
      if (now < waitDeadline) {
        const ms = waitDeadline.getTime() - now.getTime();
        setMinutesRemaining(Math.ceil(ms / 60_000));
      } else {
        setMinutesRemaining(null);
      }
    }
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [session]);

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

      // Use the Supabase storage upload with the signed token.
      const { error: uploadErr } = await supabase.storage
        .from('noshow-evidence')
        .uploadToSignedUrl(urlData.path, urlData.token, file, {
          contentType: file.type,
        });
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
      const res = await fetch('/api/noshow-claims/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          evidenceType: evidenceType || null,
          evidenceFiles,
          writtenExplanation: explanation.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Failed to submit claim');
        return;
      }
      onSuccess();
      const basePath = userRole === 'tutor' ? '/tutor' : '/student';
      router.push(`${basePath}/disputes/${data.claim_id}/submitted`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit claim');
    } finally {
      setSubmitting(false);
    }
  }

  if (session.status !== 'SCHEDULED' && session.status !== 'JOIN_OPEN') {
    return null;
  }

  const buttonLabel = userRole === 'student' ? 'Report Tutor No-Show' : 'Report Student No-Show';
  const tooltipDisabled =
    minutesRemaining !== null
      ? `Available ${minutesRemaining} minute${minutesRemaining === 1 ? '' : 's'} after start.`
      : 'Currently unavailable.';

  return (
    <>
      <button
        onClick={() => canMark && setIsOpen(true)}
        disabled={!canMark}
        className={`px-6 py-3 font-bold rounded-xl shadow transition flex items-center gap-2 ${
          canMark
            ? 'bg-red-500 hover:bg-red-600 text-white cursor-pointer'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
        title={canMark ? 'File a no-show report' : tooltipDisabled}
      >
        {!canMark && <Lock className="w-4 h-4" />}
        <span>{buttonLabel}</span>
        {minutesRemaining !== null && <span className="text-xs">({minutesRemaining}m)</span>}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !submitting && setIsOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-gray-200 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-red-600 text-white px-6 py-4 rounded-t-2xl">
              <h3 className="text-lg font-bold">Report no-show</h3>
              <p className="text-sm opacity-90 mt-1">
                Step {step} of 2 — {step === 1 ? 'Eligibility and evidence' : 'Written explanation'}
              </p>
            </div>

            <div className="px-6 py-4 space-y-4">
              {step === 1 && (
                <>
                  <div className="rounded-xl border bg-gray-50 p-4 text-sm space-y-2">
                    <div className="font-semibold text-gray-900">Eligibility</div>
                    {[
                      { ok: true, t: '15-minute wait period has passed' },
                      { ok: true, t: 'Claim filed within 24 hours of session start' },
                      { ok: true, t: 'You used the in-app meeting link' },
                    ].map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-gray-700">
                        <span className="text-green-600 font-bold">✓</span>
                        <span>{c.t}</span>
                      </div>
                    ))}
                  </div>

                  <div>
                    <div className="font-semibold text-gray-900 mb-1">Upload evidence (recommended)</div>
                    <p className="text-xs text-gray-500 mb-2">
                      Strongest evidence is a meeting attendance report. A screenshot of the empty meeting room
                      with your device clock visible is also accepted. PNG, JPG or WEBP, max 5 MB each.
                    </p>
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
                  </div>

                  {evidenceFiles.length > 0 && (
                    <ul className="space-y-1">
                      {evidenceFiles.map((f, i) => (
                        <li key={i} className="flex items-center justify-between rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm">
                          <span className="truncate">{f.original_name}</span>
                          <button
                            type="button"
                            onClick={() => setEvidenceFiles((prev) => prev.filter((_, idx) => idx !== i))}
                            className="text-red-600 hover:text-red-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Evidence type</label>
                    <select
                      value={evidenceType}
                      onChange={(e) => setEvidenceType(e.target.value)}
                      className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select type…</option>
                      <option value="meeting_attendance_report">Meeting attendance report</option>
                      <option value="screenshot_empty_meeting">Screenshot of empty meeting</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div>
                    <div className="font-semibold text-gray-900 mb-1">Describe what happened</div>
                    <p className="text-xs text-gray-500 mb-2">
                      Be specific about times and what you observed. Minimum 20 characters.
                    </p>
                    <textarea
                      value={explanation}
                      onChange={(e) => setExplanation(e.target.value)}
                      rows={6}
                      placeholder="Example: I joined the meeting link at 5:58 PM, two minutes before start. I waited until 6:17 PM. The other party did not join. I took a screenshot at 6:15 PM showing my system clock."
                      className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 text-sm"
                    />
                    <div className="text-xs text-gray-400 mt-1 text-right">{explanation.trim().length}/20</div>
                  </div>

                  <div className="rounded-xl border bg-gray-50 p-4 text-sm space-y-2">
                    <div className="font-semibold text-gray-900">Before submitting</div>
                    <ul className="list-disc list-inside text-gray-700 space-y-1 text-xs">
                      <li>The other party will be notified and given 12 hours to respond with their evidence.</li>
                      <li>Our support team will review both accounts and any evidence provided.</li>
                      <li>If confirmed in your favour, you receive a full refund within 2–5 business days.</li>
                      <li>If evidence is inconclusive, both parties receive a neutral outcome.</li>
                    </ul>
                  </div>

                  <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <p>
                      Only submit this report if the other party genuinely did not attend. Repeated false claims
                      will result in account suspension or permanent ban.
                    </p>
                  </div>
                </>
              )}

              {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  {error}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex gap-2 justify-end rounded-b-2xl">
              {step === 1 ? (
                <>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
                  >
                    Continue to step 2
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setStep(1)}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={submitting || explanation.trim().length < 20}
                    onClick={() => void submit()}
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {submitting ? 'Submitting…' : 'Submit no-show report'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
