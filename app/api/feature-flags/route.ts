import { NextResponse } from 'next/server';
import { isPaidClassesEnabled } from '@/lib/featureFlags/paidClasses';
import { isParentAccountsEnabled } from '@/lib/featureFlags/parentAccounts';
import { isFinderEnabled } from '@/lib/featureFlags/finder';
import { isPhysicalClassesEnabled } from '@/lib/featureFlags/physicalClasses';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    paidClassesEnabled: isPaidClassesEnabled(),
    parentAccountsEnabled: isParentAccountsEnabled(),
    physicalClassesEnabled: isPhysicalClassesEnabled(),
    // Only the master switch is exposed. FINDER_GATE_MODE stays server-side
    // deliberately: it decides whether the interstitial is FORCED, and a
    // browser that can read it is a browser that can be used to work out how
    // to avoid it. Client code only ever needs to know whether to render a
    // Finder entry point at all.
    finderEnabled: isFinderEnabled(),
  });
}

