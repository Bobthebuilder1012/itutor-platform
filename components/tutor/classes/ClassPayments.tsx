'use client';

/**
 * The class Payments screen: Online (card, through iTutor) and Cash (paid to
 * the tutor in person, tracked by the tutor). Separate tabs because the two
 * have different sources of truth — the gateway for one, the tutor's own marks
 * for the other — and a grid mixing them invites a tutor to "fix" a card month
 * they have no authority over.
 *
 * `?pay=cash` opens the Cash tab; the cash-request email links there.
 */

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Banknote, CreditCard } from 'lucide-react';
import PaymentsGrid from '@/components/tutor/classes/PaymentsGrid';
import CashPayments from '@/components/tutor/classes/CashPayments';

type PayTab = 'online' | 'cash';

export default function ClassPayments({ groupId, onRosterChange }: { groupId: string; onRosterChange?: () => void }) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<PayTab>(searchParams?.get('pay') === 'cash' ? 'cash' : 'online');

  const tabs: { key: PayTab; label: string; Icon: typeof CreditCard }[] = [
    { key: 'online', label: 'Online', Icon: CreditCard },
    { key: 'cash', label: 'Cash', Icon: Banknote },
  ];

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-border bg-card p-1">
        {tabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              tab === key ? 'bg-brand text-white' : 'text-muted-foreground hover:text-ink'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      {tab === 'online' ? (
        <PaymentsGrid groupId={groupId} />
      ) : (
        <CashPayments groupId={groupId} onRosterChange={onRosterChange} />
      )}
    </div>
  );
}
