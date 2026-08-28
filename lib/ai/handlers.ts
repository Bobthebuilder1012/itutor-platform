/**
 * Job handlers for the three generative flows.
 *
 * A handler takes a job's input and returns its output. It does not touch
 * `ai_jobs`, the ledger, or retry policy — `aiJobService` owns all of that, so
 * a new flow is a prompt and a schema rather than another copy of the failure
 * handling.
 *
 * Every call goes through `generateStructured` with a response schema. That is
 * not defensive style, it is the difference between output a renderer can trust
 * and prose that has to be parsed — and parsing prose fails in the worst way
 * available, by succeeding most of the time.
 *
 * The prompts are deliberately explicit that CSEC is a Caribbean syllabus. A
 * model left to its own devices writes British or American exam questions, and
 * a tutor in Trinidad notices immediately.
 */

import {
  generateStructured,
  type ResponseSchema,
  ProviderPermanentError,
} from '@/lib/ai/provider';
import { registerJobHandler, type AiJob } from '@/lib/services/aiJobService';

/**
 * Gemini validates against an OpenAPI subset: type/properties/items/required,
 * and it honours propertyOrdering for field order in the response.
 */
const STUDY_SHEET_SCHEMA: ResponseSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    subtitle: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['FORMULAE', 'WORKED_EXAMPLE', 'PRACTICE', 'CHECKLIST'],
          },
          items: { type: 'array', items: { type: 'string' } },
        },
        required: ['heading', 'kind', 'items'],
      },
    },
  },
  required: ['title', 'sections'],
};

const LESSON_PLAN_SCHEMA: ResponseSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          week: { type: 'integer' },
          topic: { type: 'string' },
          objective: { type: 'string' },
          homework: { type: 'string' },
          // Coral flag in the prototype's calendar. The model marks topics
          // candidates historically struggle with, which is a guess until the
          // subject reports land and it becomes evidence.
          weak_area: { type: 'boolean' },
        },
        required: ['index', 'week', 'topic', 'objective', 'weak_area'],
      },
    },
  },
  required: ['title', 'sessions'],
};

const QUIZ_SCHEMA: ResponseSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'integer' },
          prompt: { type: 'string' },
          type: { type: 'string', enum: ['MCQ', 'SHORT', 'EXTENDED'] },
          marks: { type: 'integer' },
          options: { type: 'array', items: { type: 'string' } },
          correct_answer: { type: 'string' },
          worked_solution: { type: 'string' },
        },
        required: ['number', 'prompt', 'type', 'marks'],
      },
    },
  },
  required: ['title', 'questions'],
};

/** Shared framing, so the three prompts do not drift apart on the basics. */
const HOUSE_STYLE = [
  'You are helping a Caribbean tutor prepare material for CXC examinations',
  '(CSEC and CAPE). Follow the CXC syllabus and its command words — Calculate,',
  'Determine, State, Explain, Show that. Use Caribbean contexts, names and',
  'currency (TTD, JMD, BBD) in worded questions, never British or American ones.',
  'Use metric units. Write plainly, as a teacher would, not as a textbook.',
].join(' ');

function answers(job: AiJob): Record<string, string> {
  const raw = (job.input_ref as { answers?: unknown }).answers;
  if (!raw || typeof raw !== 'object') {
    throw new ProviderPermanentError('Job input carried no answers to work from');
  }
  return raw as Record<string, string>;
}

/** "2 pages" -> 2. The elicitation stores display strings, not numbers. */
function firstNumber(value: string | undefined, fallback: number): number {
  const match = (value ?? '').match(/\d+/);
  return match ? Number(match[0]) : fallback;
}

registerJobHandler('STUDY_SHEET', async (job) => {
  const a = answers(job);
  const pages = firstNumber(a.pages, 2);

  const prompt = `${HOUSE_STYLE}

Write a revision study sheet.

Subject: ${a.subject ?? 'CSEC Mathematics'}
Topic(s): ${a.topics ?? 'as appropriate for the subject'}
Level: ${a.level ?? 'Standard'}
Length: about ${pages} printed A4 page(s)
Include practice questions: ${a.practice ?? 'Yes'}
${a.audience && a.audience !== '—' ? `Header line: ${a.audience}` : ''}

Structure it as sections in this order where they apply: key formulae, one or
two fully worked examples, practice questions, and a short "Before you hand
this in" checklist. Keep each item short enough to read on a printed page —
this gets photocopied and handed out, so favour brevity over completeness.
Size the content to ${pages} page(s); do not pad it to fill space.`;

  const result = await generateStructured<Record<string, unknown>>(
    prompt,
    STUDY_SHEET_SCHEMA,
    { temperature: 0.4 }
  );

  return {
    output: { kind: 'STUDY_SHEET', ...result.data },
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
});

registerJobHandler('LESSON_PLAN', async (job) => {
  const a = answers(job);
  const perWeek = firstNumber(a.perWeek, 2);

  const prompt = `${HOUSE_STYLE}

Build a week-by-week teaching plan running up to the exam.

Subject: ${a.subject ?? 'CSEC Mathematics'}
Student or class: ${a.who ?? 'a single student'}
Exam: ${a.exam ?? 'CSEC June'}
Current level: ${a.level ?? 'Standard'}
Sessions per week: ${perWeek}
Session length: ${a.length ?? '60 minutes'}
Preferred days: ${a.days ?? 'Tuesday & Thursday'}
${a.focus && a.focus !== '—' ? `Extra focus: ${a.focus}` : ''}

Order the topics for TEACHING, not in syllabus presentation order — a topic
must not appear before something it depends on. Number the sessions from 1 and
give each a week number, so ${perWeek} sessions share a week. Set weak_area
true only where candidates genuinely lose marks year after year, not on every
row. Leave room near the end for revision rather than new content.`;

  const result = await generateStructured<Record<string, unknown>>(
    prompt,
    LESSON_PLAN_SCHEMA,
    { temperature: 0.3 }
  );

  return {
    output: { kind: 'LESSON_PLAN', ...result.data },
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
});

registerJobHandler('QUIZ_GENERATE', async (job) => {
  const a = answers(job);
  const count = firstNumber(a.count, 10);

  const prompt = `${HOUSE_STYLE}

Write a quiz.

Subject: ${a.subject ?? 'CSEC Mathematics'}
Topic(s): ${a.topics ?? 'as appropriate for the subject'}
Level: ${a.level ?? 'Standard'}
Number of questions: ${count}
Question type: ${a.qtype ?? 'Mixed'}
Time limit: ${a.limit ?? '25 minutes'}

Number the questions from 1. Give every question a mark allocation that suits
its demand. For MCQ give exactly four options and name the correct one exactly
as it appears in the list. For written questions give a worked solution a tutor
can mark against. The whole paper should be sittable in ${a.limit ?? '25 minutes'}
— count the marks and be honest about it rather than writing more than fits.

These questions are your own work. Do not reproduce a real past-paper question.`;

  const result = await generateStructured<Record<string, unknown>>(prompt, QUIZ_SCHEMA, {
    temperature: 0.5,
  });

  return {
    output: { kind: 'QUIZ', ...result.data },
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
});

/**
 * Importing this module is what registers the handlers, so both the cron route
 * and the drain route must import it. Exported so that import is a deliberate
 * statement rather than something a formatter can drop as unused.
 */
export const AI_HANDLERS_REGISTERED = true;
