/**
 * @comvi/cli - CLI for Comvi i18n
 *
 * Features:
 * - Type generation from TMS
 * - Translation sync (pull/push)
 * - SSE-based real-time updates
 */

// Core classes
export { TypeGenerator } from "./core/TypeGenerator";
export { ApiClient, API_ENDPOINTS } from "./core/ApiClient";
export { TypeEmitter } from "./core/TypeEmitter";
export { ConfigLoader } from "./core/ConfigLoader";
export { TranslationSync } from "./core/TranslationSync";

// Infrastructure
export { FileSystemWriter, NodeFileSystem, InMemoryFileSystem } from "./core/FileSystemWriter";
export { ConsoleReporter, SilentReporter, CollectingReporter } from "./core/GenerationReporter";
export { createLogger, ConsoleLogger, SilentLogger, LogLevel } from "./utils/logger";
export { TypegenError, ErrorCodes, wrapError } from "./utils/errors";

// Type exports
export type {
  // Configuration
  ComviConfig,
  GeneratorOptions,
  GenerationResult,
  CheckResult,
  // Schema types (from backend)
  SchemaParam,
  KeySchema,
  ProjectSchema,
  // Translation types
  TranslationData,
  TranslationsResponse,
  ProjectInfo,
  PushResult,
  ForceMode,
  PushConfig,
  PullConfig,
  TranslationSyncOptions,
  PullResult,
  TranslationDiff,
  // Infrastructure types
  Logger,
  FileSystem,
  GenerationReporter,
  GenerationStats,
} from "./types";

// TypeEmitter options
export type { TypeEmitterOptions } from "./core/TypeEmitter";

// API Client types
export type {
  ApiClientOptions,
  FetchTranslationsOptions,
  PushTranslationsOptions,
  PushProgress,
} from "./core/ApiClient";
