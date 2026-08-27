/**
 * The single entry point to a model provider.
 *
 * Rule 6 in CLAUDE.md: nothing outside this file imports a model SDK, and
 * `grep -rn "@google/generative-ai"` over the repo must return exactly one
 * file — this one. That is not tidiness. v1 called Gemini directly from a
 * route handler, which meant the provider, the prompt, the retry policy and
 * the request lifecycle were all one tangle, and swapping any of them meant
 * touching a live endpoint.
 *
 * Rule 1 says no model call happens inside a request handler. This module does
 * not enforce that on its own — it cannot see who is calling it — so the
 * enforcement lives in the fact that only `lib/services/aiJobService.ts` calls
 * these functions, and that service only runs from the cron worker.
 *
 * ── Which provider ──────────────────────────────────────────────────────────
 * Gemini, because that is what the environment is provisioned for: the handoff
 * treats `GEMINI_API_KEY` as the outer boundary of the whole feature (Phase
 * 0.2 audits it down to a single `ai-lab` preview) and the v1 tool used it.
 * That is an assumption inherited from the handoff, not a comparison anybody
 * has run. The point of this file is that changing it is a change to one
 * module rather than to every caller.
 */

import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * A JSON Schema describing the shape the model must return.
 *
 * Structured output is mandatory for extraction (handoff 1.4: "a strict JSON
 * response schema (not free-form text)"). Free-form text that is then parsed
 * fails in the worst way available — it succeeds most of the time and produces
 * plausible nonsense the rest, and the failures do not look like failures.
 */
export type ResponseSchema = Record<string, unknown>;

export interface GenerateOptions {
  /** Overrides the default model for this call. */
  model?: string;
  /** 0 for extraction and marking, higher only where variety is the point. */
  temperature?: number;
  maxOutputTokens?: number;
  /** Prepended as the system instruction. */
  system?: string;
}

export interface ImageInput {
  /** Raw bytes. Already resized by lib/utils/imageOptimize.ts before upload. */
  data: Buffer | Uint8Array;
  mimeType: string;
}

/**
 * Every call returns its token counts, because `ai_jobs` records them and
 * `ai_credit_ledger` charges against them. A provider call whose cost is not
 * measurable is a provider call that cannot be metered — that is how v1 ended
 * up with a lifetime counter.
 */
export interface ProviderResult<T> {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** Thrown for conditions a retry will not fix. The worker fails the job. */
export class ProviderPermanentError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'ProviderPermanentError';
  }
}

/** Thrown for rate limits and transient faults. The worker backs off. */
export class ProviderTransientError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'ProviderTransientError';
  }
}

// ── Configuration ────────────────────────────────────────────────────────────

const DEFAULT_MODEL = process.env.AI_MODEL ?? 'gemini-2.0-flash';
const DEFAULT_VISION_MODEL = process.env.AI_VISION_MODEL ?? DEFAULT_MODEL;

/**
 * Absent key means the feature is off, not broken.
 *
 * The key's absence is the outer boundary of the feature and the flag is the
 * inner one. A deployment with no key should refuse to enqueue work with a
 * clear message rather than queue jobs that fail one by one at the worker.
 */
export function isAiProviderConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new ProviderPermanentError(
      'GEMINI_API_KEY is not set in this environment. iTutor AI is unavailable here by design.'
    );
  }
  return new GoogleGenerativeAI(key);
}

function getModel(name: string, schema: ResponseSchema, opts: GenerateOptions): GenerativeModel {
  return getClient().getGenerativeModel({
    model: name,
    systemInstruction: opts.system,
    generationConfig: {
      // Structured output. The provider validates against the schema, so a
      // malformed response is the provider's error rather than our parse bug.
      responseMimeType: 'application/json',
      responseSchema: schema as never,
      temperature: opts.temperature ?? 0,
      maxOutputTokens: opts.maxOutputTokens,
    },
  });
}

/**
 * Provider errors arrive as opaque strings. Sorting them into "try again" and
 * "do not try again" is the difference between a queue that drains and a queue
 * that burns credit retrying a malformed prompt sixteen times.
 */
function classify(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const transient = /\b(429|500|502|503|504)\b|rate.?limit|overloaded|timeout|ETIMEDOUT|ECONNRESET/i;

  if (transient.test(message)) {
    throw new ProviderTransientError(message, error);
  }
  throw new ProviderPermanentError(message, error);
}

function countTokens(response: {
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}): { inputTokens: number; outputTokens: number } {
  return {
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

function parseOrThrow<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    // The schema was supposed to prevent this. If it happens the response is
    // unusable, and retrying the same prompt will not help.
    throw new ProviderPermanentError(
      `Provider returned unparseable JSON despite a response schema: ${text.slice(0, 200)}`,
      error
    );
  }
}

// ── The two entry points ─────────────────────────────────────────────────────

/**
 * Generate structured data from a text prompt.
 *
 * Used by lesson planning, quiz generation and study sheets. The schema is not
 * optional: every caller in this codebase knows the shape it wants back, and
 * saying so is what makes the output renderable rather than merely readable.
 */
export async function generateStructured<T>(
  prompt: string,
  schema: ResponseSchema,
  opts: GenerateOptions = {}
): Promise<ProviderResult<T>> {
  const modelName = opts.model ?? DEFAULT_MODEL;

  try {
    const result = await getModel(modelName, schema, opts).generateContent(prompt);
    const { inputTokens, outputTokens } = countTokens(result.response);

    return {
      data: parseOrThrow<T>(result.response.text()),
      model: modelName,
      inputTokens,
      outputTokens,
    };
  } catch (error) {
    if (error instanceof ProviderPermanentError || error instanceof ProviderTransientError) {
      throw error;
    }
    classify(error);
  }
}

/**
 * Extract structured data from one or more images.
 *
 * Used by syllabus/subject-report ingestion and by Mark Papers. Images arrive
 * already optimised — see lib/utils/imageOptimize.ts, which resizes on the
 * client before upload. Sending a 6MB phone photograph here would cost tokens
 * proportional to its size for no gain in legibility.
 */
export async function extractFromImage<T>(
  images: ImageInput[],
  prompt: string,
  schema: ResponseSchema,
  opts: GenerateOptions = {}
): Promise<ProviderResult<T>> {
  if (images.length === 0) {
    throw new ProviderPermanentError('extractFromImage called with no images');
  }

  const modelName = opts.model ?? DEFAULT_VISION_MODEL;

  const parts = [
    { text: prompt },
    ...images.map((image) => ({
      inlineData: {
        data: Buffer.from(image.data).toString('base64'),
        mimeType: image.mimeType,
      },
    })),
  ];

  try {
    const result = await getModel(modelName, schema, opts).generateContent(parts);
    const { inputTokens, outputTokens } = countTokens(result.response);

    return {
      data: parseOrThrow<T>(result.response.text()),
      model: modelName,
      inputTokens,
      outputTokens,
    };
  } catch (error) {
    if (error instanceof ProviderPermanentError || error instanceof ProviderTransientError) {
      throw error;
    }
    classify(error);
  }
}

/**
 * What a job cost, in cents.
 *
 * Rates are env-configurable because they change without warning and a
 * hardcoded rate silently becomes a lie. Returning 0 when unset is deliberate:
 * an unknown rate should not invent a charge.
 */
export function estimateCostCents(inputTokens: number, outputTokens: number): number {
  const inputRate = Number(process.env.AI_INPUT_COST_PER_MTOK_CENTS ?? 0);
  const outputRate = Number(process.env.AI_OUTPUT_COST_PER_MTOK_CENTS ?? 0);

  const cents = (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;
  return Math.round(cents * 1000) / 1000;
}
