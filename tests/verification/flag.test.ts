import { describe, expect, it } from 'vitest';
import { isVerificationV2Enabled } from '@/lib/featureFlags/verificationV2';
import { SANDBOX_WORKFLOW_ID, diditWorkflowId } from '@/lib/identity/diditConfig';

const STAGING = { VERCEL_ENV: 'preview', NODE_ENV: 'production' };
const PRODUCTION = { VERCEL_ENV: 'production', NODE_ENV: 'production' };

describe('the verification flag', () => {
  it('outside production it is ON by default (staging, preview, local, tests)', () => {
    expect(isVerificationV2Enabled({ ...STAGING })).toBe(true);
    expect(isVerificationV2Enabled({ VERCEL_ENV: 'development' })).toBe(true);
    expect(isVerificationV2Enabled({ NODE_ENV: 'development' })).toBe(true);
    expect(isVerificationV2Enabled({ NODE_ENV: 'test' })).toBe(true);
    expect(isVerificationV2Enabled({})).toBe(true);
  });

  it('outside production an explicit "false" turns it off, in any case and spacing', () => {
    for (const v of ['false', 'FALSE', ' False ']) {
      expect(isVerificationV2Enabled({ ...STAGING, VERIFICATION_V2_ENABLED: v })).toBe(false);
    }
  });

  it('outside production "true" and any other value (or blank) leave it on', () => {
    for (const v of ['true', 'TRUE', '', '0', 'no', 'off', 'whatever']) {
      expect(isVerificationV2Enabled({ ...STAGING, VERIFICATION_V2_ENABLED: v })).toBe(true);
    }
  });

  it('in production it is OFF unless explicitly "true"', () => {
    expect(isVerificationV2Enabled({ ...PRODUCTION })).toBe(false);
    for (const v of ['', 'false', '1', 'yes', 'on', 'enabled']) {
      expect(isVerificationV2Enabled({ ...PRODUCTION, VERIFICATION_V2_ENABLED: v })).toBe(false);
    }
    expect(isVerificationV2Enabled({ ...PRODUCTION, VERIFICATION_V2_ENABLED: 'true' })).toBe(true);
    expect(isVerificationV2Enabled({ ...PRODUCTION, VERIFICATION_V2_ENABLED: ' TRUE ' })).toBe(true);
  });

  it('self-hosted production (no VERCEL_ENV, NODE_ENV=production) is production too', () => {
    expect(isVerificationV2Enabled({ NODE_ENV: 'production' })).toBe(false);
    expect(isVerificationV2Enabled({ NODE_ENV: 'production', VERIFICATION_V2_ENABLED: 'true' })).toBe(true);
  });
});

describe('the Didit workflow id', () => {
  it('uses the configured one everywhere', () => {
    expect(diditWorkflowId({ ...STAGING, DIDIT_WORKFLOW_ID: ' abc ' })).toBe('abc');
    expect(diditWorkflowId({ ...PRODUCTION, DIDIT_WORKFLOW_ID: 'abc' })).toBe('abc');
  });
  it('falls back to the sandbox workflow outside production only', () => {
    expect(diditWorkflowId({ ...STAGING })).toBe(SANDBOX_WORKFLOW_ID);
    expect(diditWorkflowId({ NODE_ENV: 'development', DIDIT_WORKFLOW_ID: '  ' })).toBe(SANDBOX_WORKFLOW_ID);
    expect(diditWorkflowId({ ...PRODUCTION })).toBe('');
    expect(SANDBOX_WORKFLOW_ID).toBe('9bfa64cd-4fc0-446d-b971-4a9277bb4978');
  });
});
