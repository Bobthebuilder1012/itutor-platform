export const LEVEL_LABELS: Record<string, string> = {
  SEA:    'SEA (10–11)',
  FORM_1: 'Form 1 (11–12)',
  FORM_2: 'Form 2 (12–13)',
  FORM_3: 'Form 3 (13–14)',
  FORM_4: 'Form 4 (14–15)',
  FORM_5: 'Form 5 (15–16)',
  CAPE:   'CAPE (16–18)',
};

export function formatLevel(value: string | null | undefined): string {
  if (!value) return '—';
  return LEVEL_LABELS[value] ?? value;
}
