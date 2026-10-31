import { describe, expect, it } from 'vitest';
import { identitySetupProblems } from '@/lib/identity/configStatus';

const FULL_DIDIT = { DIDIT_API_KEY: 'secret-key-value-1', DIDIT_WORKFLOW_ID: 'wf-value-2', DIDIT_WEBHOOK_SECRET: 'whsec-value-3' };

describe('identity setup problems (admin screen)', () => {
  it('nothing missing -> no problems', () => {
    expect(identitySetupProblems(FULL_DIDIT)).toEqual([]);
  });

  it('Didit is the first provider by default: a missing variable is reported by NAME', () => {
    const p = identitySetupProblems({ DIDIT_API_KEY: 'k', DIDIT_WORKFLOW_ID: 'w' });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ provider: 'didit', primary: true, missing: ['DIDIT_WEBHOOK_SECRET'] });
    expect(p[0].message).toContain('DIDIT_WEBHOOK_SECRET');
  });

  it('nothing set at all: the first provider lists all three names, the unused backups stay quiet', () => {
    const p = identitySetupProblems({});
    expect(p).toHaveLength(1);
    expect(p[0].missing).toEqual(['DIDIT_API_KEY', 'DIDIT_WORKFLOW_ID', 'DIDIT_WEBHOOK_SECRET']);
  });

  it('a backup is reported only when half set up', () => {
    const half = identitySetupProblems({ ...FULL_DIDIT, STRIPE_SECRET_KEY: 'sk_test_x' });
    expect(half).toEqual([expect.objectContaining({ provider: 'stripe', primary: false, missing: ['STRIPE_IDENTITY_WEBHOOK_SECRET'] })]);
    expect(identitySetupProblems({ ...FULL_DIDIT })).toEqual([]);
  });

  it('follows IDENTITY_PRIMARY_PROVIDER', () => {
    const p = identitySetupProblems({ ...FULL_DIDIT, IDENTITY_PRIMARY_PROVIDER: 'stripe' });
    expect(p).toEqual([expect.objectContaining({ provider: 'stripe', primary: true })]);
  });

  it('blank values count as missing, and no value ever appears in the output', () => {
    const env = { DIDIT_API_KEY: '   ', DIDIT_WORKFLOW_ID: 'workflow-visible?', DIDIT_WEBHOOK_SECRET: 'super-secret-xyz' };
    const out = JSON.stringify(identitySetupProblems(env));
    expect(out).toContain('DIDIT_API_KEY');
    expect(out).not.toContain('workflow-visible');
    expect(out).not.toContain('super-secret');
  });
});
