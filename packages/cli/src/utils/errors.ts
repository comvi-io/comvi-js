/**
 * Custom error class for typegen-specific errors with error codes
 */
export class TypegenError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "TypegenError";

    // Maintain stack trace for debugging
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TypegenError);
    }
  }
}

/**
 * Error codes for different failure scenarios
 */
export const ErrorCodes = {
  // API errors
  API_CONNECTION_FAILED: "API_CONNECTION_FAILED",
  API_AUTH_FAILED: "API_AUTH_FAILED",
  API_FETCH_FAILED: "API_FETCH_FAILED",
  API_TIMEOUT: "API_TIMEOUT",
  API_INVALID_RESPONSE: "API_INVALID_RESPONSE",

  // File system errors
  FS_WRITE_FAILED: "FS_WRITE_FAILED",
  FS_READ_FAILED: "FS_READ_FAILED",
  FS_MKDIR_FAILED: "FS_MKDIR_FAILED",

  // Configuration errors
  CONFIG_NOT_FOUND: "CONFIG_NOT_FOUND",
  CONFIG_INVALID: "CONFIG_INVALID",
  CONFIG_MISSING_FIELD: "CONFIG_MISSING_FIELD",
  CONFIG_WRITE_FAILED: "CONFIG_WRITE_FAILED",

  // Generation errors
  GENERATION_FAILED: "GENERATION_FAILED",
  NO_TRANSLATIONS: "NO_TRANSLATIONS",

  // Validation errors
  VALIDATION_FAILED: "VALIDATION_FAILED",
  INVALID_INPUT: "INVALID_INPUT",
} as const;

/**
 * Utility function to wrap unknown errors with context and error code
 * This eliminates the need for duplicated error handling in catch blocks
 */
export function wrapError(error: unknown, context: string, code: string): TypegenError {
  // If it's already a TypegenError, just re-throw
  if (error instanceof TypegenError) {
    return error;
  }

  // Extract error message from various error types
  const cause = error instanceof Error ? error : undefined;
  const message = cause ? cause.message : String(error);

  return new TypegenError(`${context}: ${message}`, code, cause);
}

/**
 * Check if error is a TypegenError with specific code
 */
export function isTypegenError(error: unknown, code?: string): error is TypegenError {
  if (!(error instanceof TypegenError)) {
    return false;
  }

  if (code) {
    return error.code === code;
  }

  return true;
}
