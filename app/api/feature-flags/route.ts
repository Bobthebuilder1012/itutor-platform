import { NextResponse } from 'next/server';
import { isPaidClassesEnabled } from '@/lib/featureFlags/paidClasses';

export async function GET() {
  return NextResponse.json({
    paidClassesEnabled: isPaidClassesEnabled(),
  });
}

