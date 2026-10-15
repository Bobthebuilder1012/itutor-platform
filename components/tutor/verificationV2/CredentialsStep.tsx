'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import {
  MAX_PROOF_BYTES,
  PROOF_BUCKET,
  PROOF_TYPES,
  type CredentialDto,
  type CredentialKind,
  type VerificationV2StateDto,
} from '@/lib/verificationV2/constants';
import { Card, ErrorBanner, PrimaryButton, SecondaryButton, readError } from './ui';

interface Props {
  state: VerificationV2StateDto;
  onChange: () => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}

const INPUT =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#199356] focus:outline-none focus:ring-1 focus:ring-[#199356]';

function describe(c: CredentialDto): string {
  if (c.kind === 'DEGREE') {
    return `${c.degree}${c.field ? `, ${c.field}` : ''} · ${c.school} · ${c.graduationYear}`;
  }
  return `${c.kind} ${c.subject} · Grade ${c.grade} · ${c.examYear}`;
}

export default function CredentialsStep({ state, onChange, onBack, onNext }: Props) {
  const [kind, setKind] = useState<CredentialKind>('CSEC');
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [examYear, setExamYear] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [school, setSchool] = useState('');
  const [degree, setDegree] = useState('');
  const [field, setField] = useState('');
  const [graduationYear, setGraduationYear] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickFile(f: File | null) {
    setError(null);
    if (!f) return setFile(null);
    if (!PROOF_TYPES[f.type]) {
      setError('Proof files must be PDF, JPG or PNG');
      return setFile(null);
    }
    if (f.size > MAX_PROOF_BYTES) {
      setError('Proof files can be at most 10MB');
      return setFile(null);
    }
    setFile(f);
  }

  function reset() {
    setSubject('');
    setGrade('');
    setExamYear('');
    setProofUrl('');
    setSchool('');
    setDegree('');
    setField('');
    setGraduationYear('');
    setFile(null);
    setFileKey((k) => k + 1);
  }

  async function add() {
    setBusy(true);
    setError(null);
    try {
      let proofPath: string | null = null;
      if (file) {
        const prep = await fetch('/api/tutor/verification-v2/credentials/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType: file.type, size: file.size }),
        });
        if (!prep.ok) throw new Error(await readError(prep, 'Could not prepare the upload'));
        const { path, token } = await prep.json();
        const up = await supabase.storage
          .from(PROOF_BUCKET)
          .uploadToSignedUrl(path, token, file, { contentType: file.type });
        if (up.error) throw new Error('The file could not be uploaded. Please try again.');
        proofPath = path;
      }

      const res = await fetch('/api/tutor/verification-v2/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          subject,
          grade,
          examYear,
          school,
          degree,
          field,
          graduationYear,
          proofUrl: kind === 'DEGREE' ? undefined : proofUrl,
          proofPath,
          proofFilename: file?.name,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not save the credential'));
      reset();
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/tutor/verification-v2/credentials?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) setError(await readError(res, 'Could not remove the credential'));
    await onChange();
  }

  return (
    <Card>
      <h2 className="text-xl font-bold">Your qualifications</h2>
      <p className="mb-5 mt-1 text-sm text-gray-600">
        Add at least one. These are shown to students and parents once you are verified.
      </p>

      {state.credentials.length > 0 && (
        <ul className="mb-6 divide-y divide-gray-200 rounded-lg border border-gray-200">
          {state.credentials.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{describe(c)}</p>
                <p className="text-xs text-gray-500">
                  {c.hasProofFile ? `Proof file: ${c.proofFilename ?? 'uploaded'}` : 'Proof link added'}
                </p>
              </div>
              {state.editable && (
                <button onClick={() => remove(c.id)} className="text-xs font-semibold text-red-600 hover:underline">
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {state.editable && (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex gap-2">
            {(['CSEC', 'CAPE', 'DEGREE'] as CredentialKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k);
                  setError(null);
                }}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                  kind === k ? 'bg-[#199356] text-white' : 'border border-gray-300 bg-white text-gray-700'
                }`}
              >
                {k === 'DEGREE' ? 'Degree' : k}
              </button>
            ))}
          </div>

          {kind === 'DEGREE' ? (
            <>
              <input className={INPUT} placeholder="School or university" value={school} onChange={(e) => setSchool(e.target.value)} maxLength={150} />
              <input className={INPUT} placeholder="Degree (e.g. BSc)" value={degree} onChange={(e) => setDegree(e.target.value)} maxLength={150} />
              <input className={INPUT} placeholder="Field of study (optional)" value={field} onChange={(e) => setField(e.target.value)} maxLength={150} />
              <input className={INPUT} placeholder="Graduation year" inputMode="numeric" value={graduationYear} onChange={(e) => setGraduationYear(e.target.value)} maxLength={4} />
            </>
          ) : (
            <>
              <input className={INPUT} placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={100} />
              <div className="grid grid-cols-2 gap-3">
                <input className={INPUT} placeholder="Grade (e.g. I)" value={grade} onChange={(e) => setGrade(e.target.value)} maxLength={20} />
                <input className={INPUT} placeholder="Year" inputMode="numeric" value={examYear} onChange={(e) => setExamYear(e.target.value)} maxLength={4} />
              </div>
              <input className={INPUT} placeholder="Proof link (optional if you upload a file)" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} maxLength={500} />
            </>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Proof file {kind === 'DEGREE' ? '(required)' : '(optional if you gave a link)'} · PDF, JPG or PNG, up to 10MB
            </label>
            <input
              key={fileKey}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-700"
            />
          </div>

          <ErrorBanner message={error} />
          <PrimaryButton onClick={add} busy={busy}>
            Add qualification
          </PrimaryButton>
        </div>
      )}

      {!state.editable && <ErrorBanner message={error} />}

      <div className="mt-6 flex gap-3">
        <SecondaryButton onClick={onBack}>Back</SecondaryButton>
        <PrimaryButton onClick={onNext} disabled={state.credentials.length === 0}>
          Continue
        </PrimaryButton>
      </div>
    </Card>
  );
}
