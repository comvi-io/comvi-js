export class TypegenError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "TypegenError";

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TypegenError);
    }
  }
}

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
} as const;

/** Passes a `TypegenError` through unchanged, so nested catch blocks do not
 * re-wrap and lose the original code. */
export function wrapError(error: unknown, context: string, code: string): TypegenError {
  if (error instanceof TypegenError) {
    return error;
  }

  const cause = error instanceof Error ? error : undefined;
  const message = cause ? cause.message : String(error);

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
