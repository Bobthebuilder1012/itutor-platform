/**
 * Routes a sentence a tutor typed to a flow, and pulls the parameters out of it.
 *
 * The point is the extraction, not the routing. Matching "plan" to Plan a Lesson
 * is easy and nearly worthless — the tutor would still be asked the three
 * questions they just answered in prose, which is exactly the complaint. What
 * earns the round trip is turning "plan me a lesson for Form 5 CSEC maths, exam
 * June 2026" into a summary card with subject, level and exam date already
 * filled and nothing left to ask.
 *
 * Anything that is not a task goes to CHAT. That is not a failure case: "why did
 * Kareem lose marks on question 4" is a real thing to type into a chat box, and
 * routing it to a flow would be worse than answering it.
 */

import { generateStructured, type ResponseSchema } from '@/lib/ai/provider';

export type ClassifiedFlow = 'lesson' | 'sheet' | 'quiz' | 'marking' | 'chat';

export interface Classification {
  flow: ClassifiedFlow;
  /** 0..1. Low confidence falls back to chat rather than guessing a flow. */
  confidence: number;
  answers: Record<string, string>;
}

const SCHEMA: ResponseSchema = {
  type: 'object',
  properties: {
    flow: { type: 'string', enum: ['lesson', 'sheet', 'quiz', 'marking', 'chat'] },
    confidence: { type: 'number' },
    // Only the fields the sentence actually supplies. The elicitation summary
    // card fills the rest from its own defaults and labels them AI-suggested,
    // so inventing values here would launder a guess into something that looks
    // like the tutor said it.
    subject: { type: 'string' },
    topics: { type: 'string' },
    level: { type: 'string', enum: ['Foundation', 'Standard', 'Extension'] },
    who: { type: 'string' },
    exam: { type: 'string' },
    count: { type: 'string' },
    pages: { type: 'string' },
  },
  required: ['flow', 'confidence'],
};

const PROMPT_HEAD = `You route what a Caribbean tutor types into one of iTutor's tools, and extract
whatever parameters the sentence already contains.

Flows:
  lesson  — a teaching schedule or term plan running to an exam
  sheet   — a printable revision or study sheet
  quiz    — a set of questions for students to answer
  marking — marking student scripts or papers
  chat    — a question, or anything that is not a request to produce one of the above

Rules:
- Pick chat when the tutor is ASKING something rather than requesting an artifact.
  "Why did Kareem lose marks?" is chat. "Make me a quiz on bearings" is quiz.
- Extract a field ONLY if the sentence supplies it. Never guess. An omitted
  field is filled downstream from defaults and shown to the tutor as a
  suggestion; a guessed one would be shown as something they said.
- Subjects are CXC: "CSEC Mathematics", "CAPE Pure Maths", "CSEC Physics".
  Normalise "form 5 maths" to "CSEC Mathematics".
- confidence is your certainty about the FLOW, 0 to 1. Below 0.6 use chat.

Tutor typed:
`;

/**
 * Classify a sentence. Never throws for routing purposes — a provider failure
 * degrades to chat, which is the safe direction: the tutor still gets an
 * answer instead of an error, and chat can handle anything.
 */
export async function classifyComposerText(text: string): Promise<Classification> {
  try {
    const result = await generateStructured<
      { flow: ClassifiedFlow; confidence: number } & Record<string, string>
    >(`${PROMPT_HEAD}${JSON.stringify(text)}`, SCHEMA, { temperature: 0 });

    const { flow, confidence, ...rest } = result.data;

    // Pull only the elicitation keys through, so a stray field the model
    // invents cannot end up seeded into a summary card.
    const allowed = ['subject', 'topics', 'level', 'who', 'exam', 'count', 'pages'];
    const answers: Record<string, string> = {};
    for (const key of allowed) {
      const value = rest[key];
      if (typeof value === 'string' && value.trim()) answers[key] = value.trim();
    }

    const sure = typeof confidence === 'number' ? confidence : 0;
    if (sure < 0.6) return { flow: 'chat', confidence: sure, answers: {} };

    return { flow, confidence: sure, answers };
  } catch {
    return { flow: 'chat', confidence: 0, answers: {} };
  }
}
