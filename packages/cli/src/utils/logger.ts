/**
 * Log levels for controlling verbosity
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

/**
 * Logger interface for dependency injection
 */
export interface Logger {
  error(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  info(message: string, context?: unknown): void;
  debug(message: string, context?: unknown): void;
  setLevel(level: LogLevel): void;
}

/**
 * Console-based logger implementation
 */
export class ConsoleLogger implements Logger {
  private level: LogLevel;

  constructor(level?: LogLevel) {
    this.level = level ?? this.getDefaultLevel();
  }

  /**
   * Get log level from environment variable or default to INFO
   */
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

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  error(message: string, context?: unknown): void {
    if (this.level >= LogLevel.ERROR) {
      if (context) {
        console.error(`[comvi] ${message}`, context);
      } else {
        console.error(`[comvi] ${message}`);
      }
    }
  }

  warn(message: string, context?: unknown): void {
    if (this.level >= LogLevel.WARN) {
      if (context) {
        console.warn(`[comvi] ${message}`, context);
      } else {
        console.warn(`[comvi] ${message}`);
      }
    }
  }

  info(message: string, context?: unknown): void {
    if (this.level >= LogLevel.INFO) {
      if (context) {
        console.log(`[comvi] ${message}`, context);
      } else {
        console.log(`[comvi] ${message}`);
      }
    }
  }

  debug(message: string, context?: unknown): void {
    if (this.level >= LogLevel.DEBUG) {
      if (context) {
        console.log(`[comvi] ${message}`, context);
      } else {
        console.log(`[comvi] ${message}`);
      }
    }
  }
}

/**
 * Silent logger for testing or when logging should be disabled
 */
export class SilentLogger implements Logger {
  error(): void {}
  warn(): void {}
  info(): void {}
  debug(): void {}
  setLevel(): void {}
}

/**
 * Create a default logger instance
 */
export function createLogger(silent = false, level?: LogLevel): Logger {
  if (silent) {
    return new SilentLogger();
  }
  return new ConsoleLogger(level);
}
