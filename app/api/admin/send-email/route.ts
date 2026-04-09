import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json({ sent: 0, failed: 0, message: 'All emails disabled' });
}
