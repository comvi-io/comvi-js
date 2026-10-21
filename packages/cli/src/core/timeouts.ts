import { ErrorCodes, TypegenError } from "../utils/errors";

/** Every read: project, namespaces, translations, schema. */
export const DEFAULT_TIMEOUT_MS = 30_000;
/**
 * The push commit. A first push of a large catalog runs well past 30 s on the
 * platform, and a client that gives up first reports a failure for a push
 * that then lands anyway.
 */
export const DEFAULT_COMMIT_TIMEOUT_MS = 300_000;

export interface Timeouts {
  timeout?: number;
  commitTimeout?: number;
}

/** `COMVI_TIMEOUT_MS` replaces both budgets; unset leaves the defaults. */
export function timeoutsFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Timeouts {
  const raw = env.COMVI_TIMEOUT_MS;
  if (raw === undefined) {
    return {};
  }

  const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypegenError(
      `Invalid COMVI_TIMEOUT_MS: ${JSON.stringify(raw)} — expected a positive whole number of milliseconds`,
      ErrorCodes.CONFIG_INVALID,
    );
  }
  return { timeout: value, commitTimeout: value };
}
