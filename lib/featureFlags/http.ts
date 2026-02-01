import { NextResponse } from 'next/server';
import { PAID_CLASSES_DISABLED_MESSAGE } from './paidClasses';

export function paidClassesForbiddenResponse() {
  return NextResponse.json(
    { error: PAID_CLASSES_DISABLED_MESSAGE },
    { status: 403 }
  );
}

