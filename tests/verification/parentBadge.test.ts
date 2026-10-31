import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

// The badge pages are client components, so this is a source-level guard: each place a
// teacher is shown to a parent, student or visitor must render the shared badge row.
const src = (p: string) => readFileSync(path.resolve(__dirname, '../..', p), 'utf8');

describe('the verification badge is wired into every teacher page', () => {
  it.each([
    ['parent tutor profile', 'app/parent/tutors/[tutorId]/page.tsx', /<VerificationBadges tutorId=\{tutor\.id\}/],
    ['student tutor profile', 'app/student/tutors/[tutorId]/page.tsx', /<VerificationBadges tutorId=\{tutor\.id\}/],
    ['public tutor profile', 'app/tutors/[tutorId]/page.tsx', /<VerificationBadges/],
  ])('%s', (_name, file, pattern) => {
    const text = src(file);
    expect(text).toMatch(/from '@\/components\/verification\/VerificationBadges'/);
    expect(text).toMatch(pattern);
  });

  it('the parent page still has its existing layout pieces (message button, header)', () => {
    const text = src('app/parent/tutors/[tutorId]/page.tsx');
    expect(text).toContain('Message {first}');
    expect(text).toContain('BlurredBannerBackdrop');
  });
});
