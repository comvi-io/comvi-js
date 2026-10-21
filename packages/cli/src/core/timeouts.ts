import { ErrorCodes, TypegenError } from "../utils/errors";

/** Every read: project, namespaces, translations, schema. */
export const DEFAULT_TIMEOUT_MS = 30_000;
/**
 * The push commit. A first push of a large catalog runs well past 30 s on the
 * platform, and a client that gives up first reports a failure for a push
 * that then lands anyway.
 */
export const DEFAULT_COMMIT_TIMEOUT_MS = 300_000;

/** The largest delay `setTimeout` honours; a longer one fires after 1 ms. */
const MAX_TIMER_MS = 2_147_483_647;

export interface Timeouts {
  timeout?: number;
  commitTimeout?: number;
}

/**
 * `COMVI_TIMEOUT_MS` sets the read timeout and can only lengthen the commit:
 * raising it for a slow network must not cut a large push short.
 */
export function timeoutsFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Timeouts {
  const raw = env.COMVI_TIMEOUT_MS;
  if (raw === undefined) {
    return {};
  }

  const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_TIMER_MS) {
    throw new TypegenError(
      `Invalid COMVI_TIMEOUT_MS: ${JSON.stringify(raw)} — expected a whole number of milliseconds from 1 to ${MAX_TIMER_MS}`,
      ErrorCodes.CONFIG_INVALID,
    );
  }
  return { timeout: value, commitTimeout: Math.max(value, DEFAULT_COMMIT_TIMEOUT_MS) };
}
