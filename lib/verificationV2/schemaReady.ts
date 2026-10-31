// "Verification setup is not finished on this environment."
//
// The verification tables and columns come from migrations 270 to 275. An environment that
// has the code but not the migrations (staging, before the SQL is run) must not show an
// error page or break existing tutor pages: every verification route answers 503 with this
// message and a code the screens recognise, and the public badge routes answer "nobody is
// verified". Nothing here needs the database.

import { NextResponse } from 'next/server';

import { SETUP_CODE, SETUP_MESSAGE } from './constants';

export { SETUP_CODE, SETUP_MESSAGE };

const CODES = new Set([
  '42P01', // undefined_table
  '42703', // undefined_column
  '42883', // undefined_function (a helper the migrations create)
  'PGRST200', // relationship not found in the schema cache
  'PGRST204', // column not found in the schema cache
  'PGRST205', // table not found in the schema cache
]);

const TEXT =
  /relation .* does not exist|could not find the table|could not find the .* column|column .* does not exist|schema cache|function .* does not exist/i;

/** True for a "table or column is missing" error from Postgres or PostgREST. */
export function isMissingSchemaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; message?: unknown };
  if (typeof e.code === 'string' && CODES.has(e.code)) return true;
  return typeof e.message === 'string' && TEXT.test(e.message);
}

/** The 503 to return for a missing-schema error, or null for any other error. */
export function schemaNotReady(err: unknown): NextResponse | null {
  if (!isMissingSchemaError(err)) return null;
  return NextResponse.json({ error: SETUP_MESSAGE, code: SETUP_CODE }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
