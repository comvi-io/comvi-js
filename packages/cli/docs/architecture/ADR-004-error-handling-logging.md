# ADR-004: Error Handling and Logging

**Status:** Accepted
**Date:** 2025-01-14
**Deciders:** Development Team
**Context:** Standardizing error handling and logging across the package

## Context and Problem Statement

The original implementation had inconsistent error handling and logging:

**Problems:**

1. **Duplicate error handling**: 6+ blocks of identical `try-catch` code
2. **Direct console usage**: Mixed `console.log`, `console.error`, `console.warn`
3. **No error codes**: Hard to programmatically handle errors
4. **No log levels**: Can't control verbosity (debug vs production)
5. **Poor error context**: Errors didn't preserve cause/stack trace
6. **Not testable**: Can't verify error messages or logs in tests

## Decision Drivers

- **Consistency**: Standardized error handling across codebase
- **DRY Principle**: Eliminate duplicate error handling code
- **Testability**: Ability to verify errors and logs in tests
- **Observability**: Configurable log levels for debugging
- **Error Context**: Preserve error chains and stack traces
- **User Experience**: Clear, actionable error messages

## Considered Options

### Option 1: Keep current implementation

- **Pros**: No changes needed
- **Cons**: Unmaintainable, untestable, inconsistent

### Option 2: Use third-party library (winston, pino, etc.)

- **Pros**: Feature-rich, battle-tested
- **Cons**: Heavy dependency, overkill for our needs

### Option 3: Custom error and logger abstractions ✅ **SELECTED**

- **Pros**: Lightweight, tailored to needs, zero dependencies
- **Cons**: Need to implement ourselves

## Decision Outcome

**Chosen option: Option 3 - Custom TypegenError and Logger abstractions**

### Components

#### 1. TypegenError Class

```typescript
export class TypegenError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "TypegenError";

    // Preserve stack trace
    if (cause && cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

export const ErrorCodes = {
  // Configuration errors
  CONFIG_NOT_FOUND: "CONFIG_NOT_FOUND",
  CONFIG_INVALID: "CONFIG_INVALID",
  CONFIG_WRITE_FAILED: "CONFIG_WRITE_FAILED",

  // Validation errors
  VALIDATION_FAILED: "VALIDATION_FAILED",
  INVALID_INPUT: "INVALID_INPUT",

  // API errors
  API_CONNECTION_FAILED: "API_CONNECTION_FAILED",
  API_FETCH_FAILED: "API_FETCH_FAILED",
  API_TIMEOUT: "API_TIMEOUT",

  // File system errors
  FS_READ_FAILED: "FS_READ_FAILED",
  FS_WRITE_FAILED: "FS_WRITE_FAILED",

  // Generation errors
  TYPE_GENERATION_FAILED: "TYPE_GENERATION_FAILED",
} as const;

export function wrapError(error: unknown, context: string, code: string): TypegenError {
  const cause = error instanceof Error ? error : undefined;
  const message = cause ? cause.message : String(error);
  return new TypegenError(`${context}: ${message}`, code, cause);
}
```

#### 2. Logger Abstraction

```typescript
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface Logger {
  error(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  info(message: string, context?: unknown): void;
  debug(message: string, context?: unknown): void;
  setLevel(level: LogLevel): void;
}

export class ConsoleLogger implements Logger {
  private level: LogLevel;

  constructor(level?: LogLevel) {
    this.level = level ?? this.getDefaultLevel();
  }

  private getDefaultLevel(): LogLevel {
    const envLevel = process.env.COMVI_LOG_LEVEL?.toLowerCase();
    switch (envLevel) {
      case "error":
        return LogLevel.ERROR;
      case "warn":
        return LogLevel.WARN;
      case "info":
        return LogLevel.INFO;
      case "debug":
        return LogLevel.DEBUG;
      default:
        return LogLevel.INFO;
    }
  }

  error(message: string, context?: unknown): void {
    if (this.level >= LogLevel.ERROR) {
      if (context !== undefined) {
        console.error(`[typegen] ✗ ${message}`, context);
      } else {
        console.error(`[typegen] ✗ ${message}`);
      }
    }
  }

  // ... warn, info, debug methods
}

export class SilentLogger implements Logger {
  error(): void {}
  warn(): void {}
  info(): void {}
  debug(): void {}
  setLevel(): void {}
}

export function createLogger(level?: LogLevel): Logger {
  if (process.env.NODE_ENV === "test") {
    return new SilentLogger();
  }
  return new ConsoleLogger(level);
}
```

## Consequences

### Positive

- ✅ **DRY**: Eliminated 6 duplicate error handling blocks
- ✅ **Consistent**: Standardized error format across package
- ✅ **Testable**: Can inject `SilentLogger` or `CollectingReporter` for tests
- ✅ **Debuggable**: `COMVI_LOG_LEVEL=debug` for verbose output
- ✅ **Programmatic**: Error codes enable programmatic handling
- ✅ **Context Preservation**: Error chains preserved with `cause`

### Negative

- ❌ **More code**: Added ~200 lines for error/logger utilities
- ❌ **Learning curve**: Team needs to use TypegenError instead of Error

### Mitigations

- **Helper function**: `wrapError()` makes it easy to wrap errors
- **Auto-silence in tests**: `createLogger()` returns `SilentLogger` in test env
- **Documentation**: Clear examples in code and README

## Usage Examples

### Error Handling

**Before:**

```typescript
try {
  const data = await fs.readFile(path);
  return JSON.parse(data);
} catch (error) {
  if (error instanceof Error) {
    console.error(`Failed to read config: ${error.message}`);
  }
  throw error;
}
```

**After:**

```typescript
try {
  const data = await this.fs.readFile(path, "utf-8");
  return JSON.parse(data);
} catch (error) {
  throw wrapError(error, "Failed to read config", ErrorCodes.FS_READ_FAILED);
}
```

### Logging

**Before:**

```typescript
console.log("[typegen] Fetching translations...");
console.log(`[typegen] ✓ Generated ${count} types`);
console.error(`[typegen] ✗ Failed: ${error.message}`);
```

**After:**

```typescript
this.logger.info("Fetching translations...");
this.logger.info(`✓ Generated ${count} types`);
this.logger.error(`✗ Failed: ${error.message}`);
```

### Testing

```typescript
it("should log errors", async () => {
  const reporter = new CollectingReporter();
  const generator = new TypeGenerator(options, { reporter });

  await generator.generate();

  const errorReport = reporter.reports.find((r) => r.type === "error");
  expect(errorReport).toBeDefined();
  expect(errorReport?.data).toBeInstanceOf(Error);
});
```

### Environment-based Log Levels

```bash
# Production (default INFO)
pnpm comvi-typegen generate

# Debug mode
COMVI_LOG_LEVEL=debug pnpm comvi-typegen generate

# Quiet mode
COMVI_LOG_LEVEL=error pnpm comvi-typegen generate

# Tests (automatic SILENT)
pnpm test
```

## Error Code Usage

### Programmatic Error Handling

```typescript
try {
  await generator.generate();
} catch (error) {
  if (error instanceof TypegenError) {
    switch (error.code) {
      case ErrorCodes.CONFIG_NOT_FOUND:
        console.log("Run 'comvi-typegen init' first");
        break;
      case ErrorCodes.API_CONNECTION_FAILED:
        console.log("Check your API key and network connection");
        break;
      case ErrorCodes.API_TIMEOUT:
        console.log("API request timed out, try again");
        break;
      default:
        console.error(error.message);
    }
  }
}
```

### Error Chain Preservation

```typescript
try {
  const data = await fetchFromAPI();
} catch (apiError) {
  // Original error: "Network timeout"
  throw wrapError(apiError, "Failed to fetch translations", ErrorCodes.API_FETCH_FAILED);
  // New error: "Failed to fetch translations: Network timeout"
  // Stack trace includes both errors
}
```

## Implementation Benefits

### Before (6 duplicate blocks)

```typescript
// In TypeGenerator
try {
  await fs.mkdir(dir);
} catch (error) {
  if (error instanceof Error) {
    console.error(`Failed to create directory: ${error.message}`);
  }
  throw error;
}

// In ApiClient
try {
  const response = await fetch(url);
} catch (error) {
  if (error instanceof Error) {
    console.error(`Failed to fetch: ${error.message}`);
  }
  throw error;
}

// ... 4 more identical blocks
```

### After (DRY)

```typescript
// Single reusable function
throw wrapError(error, "Failed to create directory", ErrorCodes.FS_WRITE_FAILED);
throw wrapError(error, "Failed to fetch", ErrorCodes.API_FETCH_FAILED);
```

**Result: 6 blocks → 1 function = 83% less code**

## Related Decisions

- [ADR-001: Dependency Injection and SOLID Principles](./ADR-001-dependency-injection.md)
- [ADR-003: Caching and Rate Limiting](./ADR-003-caching-rate-limiting.md)

## References

- [Error Handling Best Practices](https://www.joyent.com/node-js/production/design/errors)
- [Error Cause Proposal](https://github.com/tc39/proposal-error-cause)
- [Structured Logging](https://www.honeycomb.io/blog/structured-logging-and-your-team)
