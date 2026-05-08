/**
 * EnvLoader - Auto-load `.env` for CLI commands
 *
 * Behavior contract:
 * - Walk up from cwd to find the nearest `.env`, stopping at the project root
 *   (the first directory that contains a `package.json`). This avoids picking
 *   up unrelated `.env` files in shared CI runners.
 * - Parse with `util.parseEnv` (Node ≥20.12) — no runtime dependency.
 * - Variables already set in `process.env` are NEVER overwritten. Real env
 *   always wins (CI safety): a `.env` cannot silently shadow `COMVI_API_KEY`
 *   exported by the build pipeline.
 * - Missing auto-discovered file → silent no-op.
 * - Explicit `--env-file <path>` that doesn't exist → caller decides (we
 *   surface `MissingEnvFileError` so the CLI handler can exit 4).
 * - Malformed file → warn on stderr, continue with current process.env.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { parseEnv } from "node:util";

export interface LoadEnvOptions {
  /** Working directory to start the walk-up from. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Explicit file path from `--env-file`. When set, auto-discovery is skipped. */
  explicitPath?: string;
  /** Disable loading entirely (`--no-env-file` or `COMVI_NO_ENV=1`). */
  disabled?: boolean;
}

export interface LoadEnvResult {
  /** Absolute path of the file that was loaded. */
  path: string;
  /** Number of variables actually injected (after non-overwrite filtering). */
  added: number;
  /** Number of variables skipped because they were already in process.env. */
  skipped: number;
}

export class MissingEnvFileError extends Error {
  constructor(public readonly path: string) {
    super(`--env-file points to a missing file: ${path}`);
    this.name = "MissingEnvFileError";
  }
}

const PROJECT_ROOT_MARKER = "package.json";
const ENV_FILENAME = ".env";

/**
 * Find the nearest `.env` file by walking up from `startDir`.
 *
 * Stops at:
 * - the directory that contains the file (success);
 * - the directory that contains `package.json` (project root — bound the walk);
 * - the filesystem root (no .env in this project tree).
 *
 * Returns the absolute path or `null`.
 */
export function findEnvFile(startDir: string): string | null {
  let dir = resolve(startDir);

  while (true) {
    const candidate = resolve(dir, ENV_FILENAME);
    if (fileExists(candidate)) return candidate;

    // If we just hit the project root without finding `.env`, stop —
    // do NOT cross into the parent of the project (CI shared dirs, $HOME).
    if (fileExists(resolve(dir, PROJECT_ROOT_MARKER))) return null;

    const parent = dirname(dir);
    if (parent === dir) return null; // filesystem root
    dir = parent;
  }
}

/**
 * Load and merge a `.env` into `process.env` with strict non-overwrite semantics.
 *
 * Returns `null` when:
 * - `disabled` is true,
 * - no file was discovered (and no `explicitPath` was given),
 * - the file exists but is empty or has no new variables to inject.
 *
 * Throws `MissingEnvFileError` only when `explicitPath` was provided and the
 * file does not exist — auto-discovery misses are silent by design.
 */
export function loadEnv(options: LoadEnvOptions = {}): LoadEnvResult | null {
  if (options.disabled) return null;

  const cwd = options.cwd ?? process.cwd();

  let path: string | null;
  if (options.explicitPath) {
    path = isAbsolute(options.explicitPath)
      ? options.explicitPath
      : resolve(cwd, options.explicitPath);
    if (!fileExists(path)) {
      throw new MissingEnvFileError(path);
    }
  } else {
    path = findEnvFile(cwd);
    if (!path) return null;
  }

  let parsed: NodeJS.Dict<string>;
  try {
    const content = readFileSync(path, "utf-8");
    parsed = parseEnv(content);
  } catch (error) {
    // Don't crash: a malformed .env shouldn't kill `comvi pull`. We log on
    // stderr so CI sees it, then continue with the current process.env.
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[comvi] warning: failed to parse ${path}: ${message}\n`);
    return null;
  }

  let added = 0;
  let skipped = 0;
  for (const [key, value] of Object.entries(parsed)) {
    if (value === undefined) continue;
    if (key in process.env) {
      skipped++;
      continue;
    }
    process.env[key] = value;
    added++;
  }

  if (added === 0 && skipped === 0) return null;
  return { path, added, skipped };
}

function fileExists(path: string): boolean {
  return existsSync(path);
}
