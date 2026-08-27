/**
 * The three elicitation flows, as specified by the design prototype.
 *
 * Chips are seeded with the common CSEC cases. They are placeholders in the
 * literal sense: once the curriculum spine is populated and verified, subject
 * and topic chips should come from `subjects` and `syllabus_topics` rather than
 * from this file. The free-text fallback on every question is what makes that
 * swap safe to defer — nothing here can block a tutor.
 *
 * Defaults matter more than they look. They are what turn six questions into
 * three: the tutor is asked what only they can know, and everything else starts
 * from a sensible guess that the summary card labels as a guess.
 */

import type { ElicitationFlow } from '@/components/ai/AiElicitation';

export type AiFlowKey = 'lesson' | 'sheet' | 'quiz';

const LEVELS = ['Foundation', 'Standard', 'Extension'];

export const AI_FLOWS: Record<AiFlowKey, ElicitationFlow> = {
  lesson: {
    title: 'Plan a Lesson',
    questions: [
      {
        key: 'subject',
        prompt: 'Which subject are we planning?',
        chips: ['CSEC Mathematics', 'CSEC Physics', 'CSEC English A', 'CAPE Pure Maths'],
        freeform: 'Another subject…',
      },
      {
        key: 'who',
        prompt: "Who's it for?",
        chips: ['A single student', 'A class', 'A crash course group'],
        freeform: 'Name a student or class…',
      },
      {
        key: 'exam',
        prompt: 'And when do they sit it?',
        chips: ['CSEC June 2026', 'CSEC January 2027', 'No fixed date'],
        freeform: 'Pick another date…',
      },
    ],
    lead: "Here's what I'll build. Everything below is a starting point — change what's wrong.",
    summaryTitle: 'Plan summary',
    generateLabel: 'Generate plan',
    fields: [
      { id: 'subject', label: 'Subject', said: true },
      { id: 'who', label: 'Student or class', said: true },
      { id: 'exam', label: 'Exam date', said: true },
      { id: 'level', label: 'Current level', options: LEVELS },
      { id: 'perWeek', label: 'Sessions per week', options: ['1 per week', '2 per week', '3 per week'] },
      { id: 'length', label: 'Session length', options: ['45 minutes', '60 minutes', '90 minutes'] },
      { id: 'days', label: 'Preferred days' },
      { id: 'focus', label: 'Extra focus' },
    ],
    defaults: {
      perWeek: '2 per week',
      length: '60 minutes',
      days: 'Tuesday & Thursday',
      level: 'Standard',
      focus: '—',
    },
  },

  sheet: {
    title: 'Study Sheets',
    questions: [
      {
        key: 'subject',
        prompt: 'Which subject is the sheet for?',
        chips: ['CSEC Mathematics', 'CSEC Physics', 'CSEC Biology', 'CSEC English A'],
        freeform: 'Another subject…',
      },
      {
        key: 'topics',
        prompt: 'Which topic or topics?',
        chips: ['Trigonometry', 'Circle theorems', 'Quadratics', 'Probability'],
        freeform: 'Type a topic…',
      },
      {
        key: 'level',
        prompt: 'What level are they working at?',
        chips: LEVELS,
        freeform: 'Describe the group…',
      },
    ],
    lead: "Right. Here's the sheet I'd make — adjust anything before I write it.",
    summaryTitle: 'Sheet summary',
    generateLabel: 'Generate sheet',
    fields: [
      { id: 'subject', label: 'Subject', said: true },
      { id: 'topics', label: 'Topics', said: true },
      { id: 'level', label: 'Level', said: true, options: LEVELS },
      { id: 'pages', label: 'Length', options: ['1 page', '2 pages', '4 pages'] },
      { id: 'practice', label: 'Practice questions', options: ['Yes', 'No'] },
      { id: 'audience', label: 'Header line' },
    ],
    defaults: {
      pages: '2 pages',
      practice: 'Yes',
      balance: 'Balanced',
      audience: '—',
    },
  },

  quiz: {
    title: 'Create a Quiz',
    questions: [
      {
        key: 'subject',
        prompt: 'Which subject is the quiz for?',
        chips: ['CSEC Mathematics', 'CSEC Physics', 'CSEC Biology', 'CSEC English A'],
        freeform: 'Another subject…',
      },
      {
        key: 'topics',
        prompt: 'Which topic or topics?',
        chips: ['Trigonometry', 'Circle theorems', 'Quadratics', 'Probability'],
        freeform: 'Type a topic…',
      },
      {
        key: 'level',
        prompt: 'What level are they working at?',
        chips: LEVELS,
        freeform: 'Describe the group…',
      },
    ],
    lead: "Got it. Here's the quiz I'd set — change anything, then I'll write the questions.",
    summaryTitle: 'Quiz summary',
    generateLabel: 'Generate quiz',
    fields: [
      { id: 'subject', label: 'Subject', said: true },
      { id: 'topics', label: 'Topics', said: true },
      { id: 'level', label: 'Level', said: true, options: LEVELS },
      { id: 'count', label: 'Questions', options: ['5 questions', '10 questions', '20 questions'] },
      { id: 'qtype', label: 'Question type', options: ['Multiple choice', 'Written', 'Mixed'] },
      { id: 'limit', label: 'Time limit', options: ['No limit', '15 minutes', '25 minutes'] },
    ],
    defaults: {
      count: '10 questions',
      qtype: 'Mixed',
      limit: '25 minutes',
    },
  },
};

/** The one-line summary under each card, per the prototype. */
export const FLOW_FOOTERS: Record<AiFlowKey, (a: Record<string, string>) => string> = {
  lesson: (a) => `${a.perWeek ?? ''} · ${a.length ?? ''} · ${a.days ?? ''}`.replace(/^ · | · $/g, ''),
  sheet: (a) => `About ${a.pages ?? '2 pages'} · printable at A4 and Letter`,
  quiz: (a) => `${a.count ?? '10 questions'} · delivered as a Google Form`,
};

/** Maps a flow onto the ai_conversations.task_type vocabulary from 251. */
export const FLOW_TASK_TYPE: Record<AiFlowKey, 'LESSON_PLAN' | 'STUDY_SHEET' | 'QUIZ'> = {
  lesson: 'LESSON_PLAN',
  sheet: 'STUDY_SHEET',
  quiz: 'QUIZ',
};
