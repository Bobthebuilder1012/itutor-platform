import { NextResponse } from 'next/server';
import { PAID_CLASSES_DISABLED_MESSAGE } from './paidClasses';
import { AI_FEATURE_MAINTENANCE_MESSAGE } from './aiFeature';
import { TEACHER_ACTIVATION_DISABLED_MESSAGE } from './teacherActivation';

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

export function teacherActivationForbiddenResponse() {
  return NextResponse.json(
    { error: TEACHER_ACTIVATION_DISABLED_MESSAGE },
    { status: 403 }
  );
}

