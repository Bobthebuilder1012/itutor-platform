'use client';

// =====================================================
// PAYOUT SETUP MODAL
// =====================================================
// Single, shared secure payout-setup experience. Used by:
//   - /tutor/get-listed  (post-signup requirements)
//   - /tutor/wallet      ("Manage bank account for payouts")
//
// Wraps the existing banking form + /api/tutor/payout-account
// logic. Do not fork this — both entry points must stay in sync.
// =====================================================

import { useEffect, useState } from 'react';
import { X, Lock, ArrowDownToLine, Loader2 } from 'lucide-react';

const TT_BANKS: Record<string, { swift: string; code: string; branches: string[] }> = {
  'Republic Bank': {
    swift: 'RBNKTTPX', code: '004',
    branches: [
      'Ellerslie Court – Maraval', 'Glencoe', 'Long Circular Mall – St. James',
      'Starlite – Diego Martin', 'West Mall – Westmoorings', 'Hilton Agency – POS',
      'Independence Square – POS', 'Park Street – POS', 'Tragarete Road – POS', 'Woodbrook',
      'Grand Bazaar – Valsayn', 'Shops of Arima Agency', 'Arima – Broadway',
      'Trincity', 'Valpark – Valsayn', 'Chaguanas – Centre City', 'Couva',
      'Sangre Grande', 'San Juan', 'St. Augustine', 'Tunapuna',
      'Gulf View – La Romaine', 'South Park – Tarouba', 'Atlantic Plaza Agency – Point Lisas',
      'Cipero Street – San Fernando', 'Fyzabad', 'Harris Promenade – San Fernando',
      'High Street – San Fernando', 'Marabella', 'Mayaro', 'Penal',
      'Princes Town', 'Point Fortin', 'Rio Claro', 'Siparia',
    ],
  },
  'First Citizens Bank': {
    swift: 'FCBLTTPS', code: '006',
    branches: [
      'Arima', 'Sangre Grande', 'Tunapuna',
      'MovieTowne Financial Centre – Invaders Bay',
      'Port of Spain – Independence Square', 'Port of Spain – Maraval',
      'One Woodbrook Place – Tragarete Rd', 'Park Street – POS',
      'West Vale Mall – Diego Martin', 'San Juan',
      'Chaguanas – Market Street', 'Montrose',
      'Couva', 'Gulf View Mall – La Romaine', 'Marabella', 'Penal',
      'Point Fortin', 'Point Lisas', 'Princes Town', 'San Fernando', 'Siparia',
      'Milford Road – Tobago', 'Scarborough – Tobago', 'Roxborough – Tobago',
    ],
  },
  'RBC Royal Bank': {
    swift: 'ROYCTTPS', code: '007',
    branches: [
      'Arima', 'Chaguanas – Royal Plaza', 'Chaguaramas', 'Couva',
      'Diego Martin – Starlite', 'Guayaguayare', 'La Romaine – Gulf City',
      'Maraval', 'Point Fortin', 'Point Lisas', 'Pointe-a-Pierre',
      'Port of Spain – Independence Square', 'Port of Spain – Park Street',
      'Princes Town', 'San Fernando – Carlton Centre', 'San Fernando – High Street',
      'San Juan', 'Sangre Grande', 'Siparia', 'St. Augustine',
      'St. James', 'Trincity', 'Westmoorings',
    ],
  },
  'Scotiabank': {
    swift: 'NOSCTTPS', code: '003',
    branches: [
      'Diego Martin', 'Maraval', 'Independence Square – POS', 'Scotia Centre – Park & Richmond',
      'Sangre Grande', 'Trincity', 'Tunapuna', 'Arima',
      'Couva', 'Price Plaza – Chaguanas', 'Chaguanas',
      'Marabella', 'Princes Town', 'San Fernando', 'Penal',
    ],
  },
  'ANSA Bank': {
    swift: 'ANBATTPS', code: '015',
    branches: [
      'Head Office – Maraval Road, POS', 'Westmoorings – The Falls',
      'San Fernando / La Romaine – Gulf City', 'Chaguanas – Endeavour Road',
    ],
  },
  'ANSA Merchant Bank': {
    swift: 'ANFMTTP1', code: '016',
    branches: ['Port of Spain – Head Office'],
  },
  'CIBC Caribbean Bank': {
    swift: 'CIBLTTPS', code: '019',
    branches: [
      'Maraval Finance Centre', 'Chaguanas Finance Centre',
      'Corporate & Investment Banking Centre – Chaguanas',
    ],
  },
  'Citibank': {
    swift: 'CITITTPS', code: '009',
    branches: ["Port of Spain – Queen's Park East"],
  },
  'JMMB Bank': {
    swift: 'JMMBTTPS', code: '020',
    branches: [
      'San Fernando – SouthPark', 'Woodbrook / Port of Spain',
      'Tunapuna', 'Chaguanas – DSM Plaza', 'Princes Town Mall',
    ],
  },
  'Agricultural Development Bank': {
    swift: 'ADEVTTP1', code: '017',
    branches: ['Port of Spain – Head Office', 'Couva', 'Sangre Grande', 'San Fernando', 'Scarborough – Tobago'],
  },
};

interface PayoutSetupModalProps {
  open: boolean;
  onClose: () => void;
  /** Fired after bank details are saved successfully. */
  onSaved?: () => void;
}

export default function PayoutSetupModal({ open, onClose, onSaved }: PayoutSetupModalProps) {
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [hasAccount, setHasAccount] = useState(false);
  const [verified, setVerified] = useState(false);
  const [payoutName, setPayoutName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [showAccountNumber, setShowAccountNumber] = useState(false);
  const [bankName, setBankName] = useState('');
  const [branch, setBranch] = useState('');
  const [accountType, setAccountType] = useState('chequing');

  // Load the tutor's current account each time the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingAccount(true);
    setError('');
    setMessage('');
    (async () => {
      try {
        const res = await fetch('/api/tutor/payout-account');
        const json = await res.json();
        if (cancelled) return;
        if (json.account) {
          setHasAccount(true);
          setVerified(!!json.account.verified_at);
          setPayoutName(json.account.payout_name ?? '');
          setAccountNumber(json.account.payout_account_identifier ?? '');
          setBankName(json.account.bank_name ?? '');
          setBranch(json.account.branch ?? '');
          setAccountType(json.account.account_type ?? 'chequing');
        }
      } catch {
        // non-fatal
      } finally {
        if (!cancelled) setLoadingAccount(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function save() {
    setSaving(true); setError(''); setMessage('');
    try {
      const res = await fetch('/api/tutor/payout-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payout_name: payoutName, payout_account_identifier: accountNumber, bank_name: bankName, branch, account_type: accountType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      setHasAccount(true);
      setVerified(false);
      setMessage('Bank details saved. Payouts will use this account.');
      onSaved?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-background shadow-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Payout setup"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-background px-6 pt-5 pb-4">
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Lock className="size-3" />
              <span className="text-xs font-light">Secured</span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-ink">Payout account</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-ink transition"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {loadingAccount ? (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" /> <span className="text-sm">Loading payout details…</span>
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-mint p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold flex items-center gap-1.5">
                  <ArrowDownToLine className="size-3.5" /> Payouts
                </div>
                <div className="font-semibold text-ink mt-1">
                  {hasAccount ? (verified ? 'Bank account verified ✓' : 'Bank account on file') : 'No payout method connected yet'}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  iTutor pays out tutor earnings via bulk bank transfer. Your earnings accumulate as you teach paid sessions and are released on the next payout cycle.
                </div>
              </div>

              {error && <div className="rounded-xl bg-coral/10 border border-coral/30 p-3 text-sm text-coral">{error}</div>}
              {message && <div className="rounded-xl bg-mint border border-brand/30 p-3 text-sm text-ink">{message}</div>}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-ink mb-1.5">Account holder name</label>
                  <input type="text" value={payoutName} onChange={(e) => setPayoutName(e.target.value)}
                    placeholder="As it appears on your bank statement"
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink mb-1.5">Bank</label>
                  <select value={bankName} onChange={(e) => { setBankName(e.target.value); setBranch(''); }}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                    <option value="">Select bank…</option>
                    {Object.keys(TT_BANKS).map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  {bankName && TT_BANKS[bankName] && (
                    <div className="mt-1.5 text-[11px] text-muted-foreground font-mono">
                      SWIFT: {TT_BANKS[bankName].swift} · Bank code: {TT_BANKS[bankName].code}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink mb-1.5">Branch</label>
                  <select value={branch} onChange={(e) => setBranch(e.target.value)}
                    disabled={!bankName || !TT_BANKS[bankName]}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60">
                    <option value="">{bankName ? 'Select branch…' : 'Select bank first…'}</option>
                    {(TT_BANKS[bankName]?.branches ?? []).map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink mb-1.5">Account number</label>
                  <div className="relative">
                    <input
                      type={showAccountNumber ? 'text' : 'password'}
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      inputMode="numeric"
                      className="w-full px-3 py-2.5 pr-10 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAccountNumber((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-ink transition-colors"
                      aria-label={showAccountNumber ? 'Hide account number' : 'Show account number'}
                    >
                      {showAccountNumber ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink mb-1.5">Account type</label>
                  <select value={accountType} onChange={(e) => setAccountType(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                    <option value="chequing">Chequing</option>
                    <option value="savings">Savings</option>
                  </select>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loadingAccount && (
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-background px-6 py-4">
            <button onClick={onClose}
              className="px-4 py-2 rounded-xl border border-border bg-background text-ink text-sm font-semibold hover:bg-muted">
              Close
            </button>
            <button onClick={save} disabled={saving}
              className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50">
              {saving ? 'Saving…' : hasAccount ? 'Update bank details' : 'Save bank details'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
