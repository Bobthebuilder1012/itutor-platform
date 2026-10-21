'use client';

// Type a student's email, press Enter, and you are logged in as them.
// The card hides itself unless the API says this admin is a superadmin — the
// check is cosmetic, the real gate is server-side on every call.

import { useEffect, useState } from 'react';

export default function EnterStudentAccountCard() {
  const [allowed, setAllowed] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/impersonate')
      .then((r) => (r.ok ? r.json() : { allowed: false }))
      .then((d) => setAllowed(Boolean(d?.allowed)))
      .catch(() => setAllowed(false));
  }, []);

  if (!allowed) return null;

  const handleEnter = async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Could not enter that account.');
        setBusy(false);
        return;
      }
      // Full page load: the session cookies are now the student's, and nothing
      // cached from the admin session should survive the transition.
      window.location.href = data?.redirectTo || '/student/dashboard';
    } catch (e: any) {
      setError(e?.message || 'Could not enter that account.');
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900">Enter a student account</h2>
      <p className="text-sm text-gray-500 mt-1">
        Signs you in as that student for real — not a preview. Anything you do is done as them,
        and every entry is written to the admin audit log.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 mt-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleEnter();
          }}
          placeholder="student@example.com"
          autoComplete="off"
          disabled={busy}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-itutor-green disabled:bg-gray-50"
        />
        <button
          onClick={handleEnter}
          disabled={busy || !email.trim()}
          className="px-5 py-2 rounded-lg bg-itutor-green text-white font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? 'Entering…' : 'Enter'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
    </div>
  );
}
