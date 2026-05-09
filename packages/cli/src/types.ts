/**
 * Core types for @comvi/cli
 *
 * Architecture:
 * - Backend provides schema via /v1/projects/:projectId/schema
 * - Backend provides translations via /v1/translations
 * - SSE streams full schema on updates
 * - CLI generates types and syncs translations
 */

// ============================================
// Schema types (from backend API)
// ============================================

/**
 * Parameter schema from backend
 * Only two types: string and number (for plurals)
 */
export interface SchemaParam {
  name: string;
  type: "string" | "number";
}

/**
 * Key schema from backend
 */
export interface KeySchema {
  params: SchemaParam[];
}

/**
 * Full project schema from backend
 * Keys are in format "namespace:key" (e.g., "common:greeting")
 */
export interface ProjectSchema {
  keys: Record<string, KeySchema>;
}

// ============================================
// Translation types
// ============================================

/**
 * Translation data structure
 * { lang: { namespace: { key: value } } }
 */
export type TranslationData = Record<string, Record<string, Record<string, string>>>;

/**
 * Response returned by the CLI ApiClient after normalizing /v1/translations
 * into the local file sync shape.
 */
export interface TranslationsResponse {
  locales: string[];
  namespaces: string[];
  translations: TranslationData;
}

/**
 * Raw response from /v1/translations.
 * Backend groups translations by namespace first:
 * { locales, namespaces: { [namespace]: { [locale]: { [key]: value } } } }
 */
export interface ApiTranslationsResponse {
  locales: string[];
  namespaces: Record<string, Record<string, Record<string, string>>>;
}

/**
 * Response from /v1/project endpoint
 */
export interface ProjectInfo {
  id: number;
  organizationId: number;
  name: string;
  description: string | null;
  sourceLocale: string;
}

/**
 * Push result from the bulk import commit endpoint
 */
export interface PushResult {
  created: number;
  updated: number;
  skipped: number;
}

/**
 * Force mode for push conflicts
 */
export type ForceMode = "override" | "keep" | "ask" | "abort";

// ============================================
// Configuration types
// ============================================

/**
 * Push-specific configuration
 */
export interface PushConfig {
  /**
   * How to handle conflicts
   * - override: local overwrites TMS
   * - keep: TMS values preserved
   * - ask: prompt once for conflict handling in an interactive terminal
   * - abort: stop on first conflict
   * @default "ask"
   */
  forceMode?: ForceMode;
}

/**
 * Pull-specific configuration
 */
export interface PullConfig {
  /**
   * Clear translations directory before pull
   * @default false
   */
  emptyDir?: boolean;
}

/**
 * Configuration file structure (.comvirc.json)
 *
 * Note: apiKey should be set via COMVI_API_KEY environment variable
 * for security reasons (to avoid committing secrets to version control).
 */
export interface ComviConfig {
  /**
   * API key for TMS authentication.
   * Project is determined by the API key.
   *
   * RECOMMENDED: Set via COMVI_API_KEY environment variable instead of config file.
   * If both are set, environment variable takes precedence.
   */
  apiKey?: string;

  /**
   * Base URL for the TMS API
   * @default "https://api.comvi.io"
   */
  apiBaseUrl?: string;

  /**
   * Output path for generated types
   * @default "src/types/i18n.d.ts"
   */
  outputPath?: string;

  /**
   * Make all params required (true) or optional (false)
   * @default true
   */
  strictParams?: boolean;

  /**
   * Default namespace name. Keys from this namespace will be generated
   * without the namespace prefix for cleaner autocomplete.
   * @default "default"
   */
  defaultNsName?: string;

  /**
   * Local translations folder path
   * @default "./src/locales"
   */
  translationsPath?: string;

  /**
   * File template pattern for translation files
   * Placeholders: {languageTag}, {namespace}, {extension}
   * @default "{languageTag}/{namespace}.json"
   */
  fileTemplate?: string;

  /**
   * File format for translations
   * @default "json"
   */
  format?: "json";

  /**
   * Restrict pull/push to this list of namespaces.
   * Omit to operate on all namespaces in the project.
   * CLI flag --ns fully overrides this value (no merge).
   */
  namespaces?: string[];

  /**
   * Restrict pull/push to this list of locales (BCP 47 tags like "en", "uk-UA").
   * Omit to operate on all locales in the project.
   * CLI flag --locale fully overrides this value (no merge).
   */
  locales?: string[];

  /**
   * Push-specific configuration
   */
  push?: PushConfig;

  /**
   * Pull-specific configuration
   */
  pull?: PullConfig;
}

/**
 * Configuration options for the type generator
 */
export interface GeneratorOptions {
  /**
   * API key for authenticating with the Translation Management System
   */
  apiKey: string;

  /**
   * Base URL for the TMS API
   * @example "https://api.comvi.io"
   */
  apiBaseUrl: string;

  /**
   * Output path for generated type definitions
   * @default "src/types/i18n.d.ts"
   */
  outputPath: string;

  /**
   * Make all params required (true) or optional (false)
   * @default true
   */
  strictParams?: boolean;

  /**
   * Default namespace name. Keys from this namespace will be generated
   * without the namespace prefix for cleaner autocomplete.
   * @default "default"
   */
  defaultNsName?: string;
}

/**
 * Options for TranslationSync
 */
export interface TranslationSyncOptions {
  /**
   * Local translations folder path
   */
  translationsPath: string;

  /**
   * File template pattern
   */
  fileTemplate: string;

  /**
   * File format
   */
  format: "json";
}

// ============================================
// Result types
// ============================================

/**
 * Result of type generation
 */
export interface GenerationResult {
  /**
   * Whether generation was successful
   */
  success: boolean;

  /**
   * Path to the generated file
   */
  filePath?: string;

  /**
   * Number of keys generated
   */
  keysGenerated?: number;

  /**
   * Error message if generation failed
   */
  error?: string;

  /**
   * Time taken to generate (in ms)
   */
  duration?: number;
}

/**
 * Result of type check (CI mode)
 */
export interface CheckResult {
  /**
   * Whether types are up to date
   */
  upToDate: boolean;

  /**
   * Number of keys in generated types
   */
  keysGenerated?: number;

  /**
   * Number of keys in current file (if exists)
   */
  currentKeys?: number;

  /**
   * Path to the types file
   */
  filePath?: string;
}

/**
 * Result of pull operation
 */
export interface PullResult {
  /**
   * Locales that were pulled
   */
  locales: string[];

  /**
   * Namespaces that were pulled
   */
  namespaces: string[];

  /**
   * Number of files written
   */
  filesWritten: number;
}

/**
 * Diff result for comparing translations
 */
export interface TranslationDiff {
  /**
   * Number of new keys to create
   */
  created: number;

  /**
   * Number of translations to update
   */
  updated: number;

  /**
   * Number of conflicting keys
   */
  conflicts: number;

  /**
   * Number of keys to delete
   */
  deleted: number;
}

// ============================================
// Re-exports
// ============================================

export type { Logger, LogLevel } from "./utils/logger";
export type { TypegenError } from "./utils/errors";
export type { FileSystem } from "./core/FileSystemWriter";
export type { GenerationReporter, GenerationStats } from "./core/GenerationReporter";
