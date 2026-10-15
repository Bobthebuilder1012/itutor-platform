import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { isTutorVerified, VERIFIED_STATUS } from '@/lib/verification/isVerified';

describe('isTutorVerified', () => {
  it('is true for the stored value', () => {
    expect(isTutorVerified('VERIFIED')).toBe(true);
  });

  it('is not defeated by case or whitespace', () => {
    expect(isTutorVerified('verified')).toBe(true);
    expect(isTutorVerified('Verified')).toBe(true);
    expect(isTutorVerified('  VERIFIED ')).toBe(true);
  });

  it('is false for every other status and for missing values', () => {
    for (const v of ['PENDING', 'PROCESSING', 'REJECTED', 'REVOKED', 'UNVERIFIED', '', 'NOT VERIFIED', null, undefined, 0, true, {}]) {
      expect(isTutorVerified(v)).toBe(false);
    }
  });

  it('exposes the exact uppercase value the database stores, for query filters', () => {
    // The CHECK constraint in migration 024 is uppercase. A lowercase filter
    // matches no rows.
    expect(VERIFIED_STATUS).toBe('VERIFIED');
  });
});

// Regression guard for the original bug: four places compared the profile
// status to lowercase 'verified', which never matches the stored 'VERIFIED'.
describe('no lowercase verified comparison on the profile status', () => {
  const root = path.resolve(__dirname, '../..');
  const bad = [
    /tutor_verification_status\s*\)?\s*={2,3}\s*['"]verified['"]/,
    /['"]tutor_verification_status['"]\s*,\s*['"]verified['"]/,
  ];

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (['node_modules', '.next', '.git', 'tests'].includes(name)) continue;
      const full = path.join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(full);
    }
    return out;
  }

  it('finds none in app, lib or components', () => {
    const offenders: string[] = [];
    for (const dir of ['app', 'lib', 'components']) {
      for (const file of walk(path.join(root, dir))) {
        const src = readFileSync(file, 'utf8');
        if (bad.some((re) => re.test(src))) offenders.push(path.relative(root, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
