import { NextResponse } from 'next/server';
import { isPaidClassesEnabled } from '@/lib/featureFlags/paidClasses';
import { isParentAccountsEnabled } from '@/lib/featureFlags/parentAccounts';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    paidClassesEnabled: isPaidClassesEnabled(),
    parentAccountsEnabled: isParentAccountsEnabled(),
  });
}

