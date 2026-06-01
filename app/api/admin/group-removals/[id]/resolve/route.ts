import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Group removals no longer have an admin-review resolution path. Tutors use
// the single removal flow, which issues the full monthly refund immediately
// and handles payout reversal or tutor deduction automatically.
export async function POST() {
  return NextResponse.json(
    { error: 'Group removal review has been retired. Use the standard removal flow.' },
    { status: 410 }
  );
}

