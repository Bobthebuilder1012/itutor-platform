// =====================================================
// PROFANITY FLAGGING — soft auto-report on comment create
// =====================================================

import leoProfanity from 'leo-profanity';

leoProfanity.loadDictionary();

export function isProfane(text: string): boolean {
  try {
    return leoProfanity.check(text);
  } catch {
    return false;
  }
}
