import { NextResponse } from 'next/server';
import { PAID_CLASSES_DISABLED_MESSAGE } from './paidClasses';
import { AI_FEATURE_MAINTENANCE_MESSAGE } from './aiFeature';

export function paidClassesForbiddenResponse() {
  return NextResponse.json(
    { error: PAID_CLASSES_DISABLED_MESSAGE },
    { status: 403 }
  );
}

export function aiFeatureForbiddenResponse() {
  return NextResponse.json(
    { error: AI_FEATURE_MAINTENANCE_MESSAGE },
    { status: 403 }
  );
}

