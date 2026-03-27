export function parseGraduationYear(raw: string): { ok: true; year: number } | { ok: false; error: string } {
  const y = parseInt(raw, 10);
  const current = new Date().getFullYear();
  if (!Number.isFinite(y) || String(y) !== raw.trim()) {
    return { ok: false, error: 'Graduation year must be a valid number.' };
  }
  if (y < 1950 || y > current + 10) {
    return { ok: false, error: `Graduation year must be between 1950 and ${current + 10}.` };
  }
  return { ok: true, year: y };
}

export function validateDegreeText(value: unknown, label: string, min = 2, max = 200): string | null {
  if (typeof value !== 'string') return `${label} is required.`;
  const t = value.trim();
  if (t.length < min) return `${label} must be at least ${min} characters.`;
  if (t.length > max) return `${label} is too long (max ${max}).`;
  return null;
}
