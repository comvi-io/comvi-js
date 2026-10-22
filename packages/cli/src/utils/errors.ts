export class TypegenError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error,
    /** Structured context, e.g. the platform's `{ status, code, message, meta }` error body. */
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "TypegenError";

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TypegenError);
    }
  }
}

/**
 * One exit-code scheme for every command, so CI can act on the code alone.
 *
 * - 0: done.
 * - 1: the command ran and found a problem: a conflict under `abort`, outdated
 *   types under `typegen --check`; also a local failure that fits no other
 *   code, such as a file that cannot be written.
 * - 2: the platform was unreachable, timed out, answered 5xx or 429, or sent
 *   something that is not the expected response. Retrying may help.
 * - 3: the API key was rejected, or it may not do this.
 * - 4: invalid input: configuration, flags, local files, or a request the
 *   platform refused as invalid.
 */
export const EXIT_FAILURE = 1;
export const EXIT_UNAVAILABLE = 2;
export const EXIT_ACCESS = 3;
export const EXIT_VALIDATION = 4;

export const ErrorCodes = {
  API_CONNECTION_FAILED: "API_CONNECTION_FAILED",
  API_AUTH_FAILED: "API_AUTH_FAILED",
  API_FETCH_FAILED: "API_FETCH_FAILED",
  API_TIMEOUT: "API_TIMEOUT",
  API_INVALID_RESPONSE: "API_INVALID_RESPONSE",

  FS_WRITE_FAILED: "FS_WRITE_FAILED",
  FS_READ_FAILED: "FS_READ_FAILED",
  FS_MKDIR_FAILED: "FS_MKDIR_FAILED",

  CONFIG_NOT_FOUND: "CONFIG_NOT_FOUND",
  CONFIG_INVALID: "CONFIG_INVALID",
  CONFIG_MISSING_FIELD: "CONFIG_MISSING_FIELD",
  CONFIG_WRITE_FAILED: "CONFIG_WRITE_FAILED",

  GENERATION_FAILED: "GENERATION_FAILED",
  NO_TRANSLATIONS: "NO_TRANSLATIONS",

  VALIDATION_FAILED: "VALIDATION_FAILED",
  INVALID_INPUT: "INVALID_INPUT",

  CONFLICT: "CONFLICT",
} as const;

/** Passes a `TypegenError` through unchanged, so nested catch blocks do not
 * re-wrap and lose the original code. */
export function wrapError(error: unknown, context: string, code: string): TypegenError {
  if (error instanceof TypegenError) {
    return error;
  }

  const cause = error instanceof Error ? error : undefined;
  // fetch reports every network failure as "fetch failed"; the reason it
  // failed (ECONNREFUSED, a DNS miss, a TLS error) sits on its cause.
  const inner = (cause as { cause?: unknown } | undefined)?.cause as
    | (Error & { code?: string })
    | undefined;
  // A dual-stack refusal is an AggregateError with an empty message and a code.
  const reason = inner?.message || inner?.code;
  const message = cause ? (reason ? `${cause.message} (${reason})` : cause.message) : String(error);

  return new TypegenError(`${context}: ${message}`, code, cause);
}

export function isTypegenError(error: unknown, code?: string): error is TypegenError {
  if (!(error instanceof TypegenError)) {
    return false;
  }

  if (code) {
    return error.code === code;
  }

  return true;
}

/** Statuses after which the same request may succeed. */
const TRANSIENT_STATUSES = new Set([408, 409, 425, 429]);

/** The exit code for an error that ended a command; see `EXIT_*`. */
export function exitCodeFor(error: unknown): number {
  if (!(error instanceof TypegenError)) {
    return EXIT_FAILURE;
  }

  switch (error.code) {
    case ErrorCodes.API_AUTH_FAILED:
      return EXIT_ACCESS;
    case ErrorCodes.API_CONNECTION_FAILED:
    case ErrorCodes.API_TIMEOUT:
    case ErrorCodes.API_INVALID_RESPONSE:
      return EXIT_UNAVAILABLE;
    case ErrorCodes.API_FETCH_FAILED: {
      const status = error.details?.status;
      if (typeof status !== "number" || status >= 500 || TRANSIENT_STATUSES.has(status)) {
        return EXIT_UNAVAILABLE;
      }
      const code = error.details?.code;
      if (code === "LIMIT_EXCEEDED") return EXIT_VALIDATION;
      if (status === 401 || status === 403) return EXIT_ACCESS;
      // A missing project is the key's; any other 404 is a wrong apiBaseUrl.
      if (status === 404) return code === "PROJECT_NOT_FOUND" ? EXIT_ACCESS : EXIT_VALIDATION;
      return EXIT_VALIDATION;
    }
    case ErrorCodes.CONFIG_NOT_FOUND:
    case ErrorCodes.CONFIG_INVALID:
    case ErrorCodes.CONFIG_MISSING_FIELD:
    case ErrorCodes.VALIDATION_FAILED:
    case ErrorCodes.INVALID_INPUT:
    case ErrorCodes.FS_READ_FAILED:
      return EXIT_VALIDATION;
    default:
      return EXIT_FAILURE;
  }
}
