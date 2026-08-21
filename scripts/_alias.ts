/**
 * Resolves the `@/*` path alias for scripts run under plain `ts-node`.
 *
 * The alias is declared in tsconfig.json for the Next build, but ts-node's
 * runtime require() does not read `paths`. The usual fix is
 * `-r tsconfig-paths/register`, which additionally needs `baseUrl` (absent from
 * a Next tsconfig) and a TS_NODE_PROJECT env var — and setting an env var
 * portably would mean depending on cross-env, whose binary is not present in
 * this checkout (node_modules/.bin is empty).
 *
 * So this does the one thing that is actually needed, with no dependency and no
 * env var: map a leading `@/` to the repo root. Import it for its side effect
 * BEFORE anything that reaches aliased code:
 *
 *     import './_alias';
 *     import { thing } from '../lib/…';
 *
 * Scripts only. Nothing in app/ or lib/ should ever import this.
 */

import * as path from 'path';
import { createRequire } from 'module';

const REPO_ROOT = path.resolve(__dirname, '..');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Module = createRequire(__filename)('module') as {
  _resolveFilename(request: string, ...rest: unknown[]): string;
};

const originalResolve = Module._resolveFilename;

Module._resolveFilename = function patchedResolve(
  request: string,
  ...rest: unknown[]
): string {
  const rewritten = request.startsWith('@/')
    ? path.join(REPO_ROOT, request.slice(2))
    : request;
  return originalResolve.call(this, rewritten, ...rest);
};
