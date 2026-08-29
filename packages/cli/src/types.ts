/**
 * Core types for @comvi/cli. The backend serves the schema from
 * `/v1/projects/:projectId/schema` and translations from `/v1/translations`;
 * SSE streams the full schema on every update.
 */

/** `number` is the type carried by plural counts. */
export interface SchemaParam {
  name: string;
  type: "string" | "number";
}

export interface KeySchema {
  params: SchemaParam[];
}

/** Keys are in `"namespace:key"` format, e.g. `"common:greeting"`. */
export interface ProjectSchema {
  keys: Record<string, KeySchema>;
}

/** `{ lang: { namespace: { key: value } } }`. */
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

/** Response from `/v1/project`. */
export interface ProjectInfo {
  id: number;
  organizationId: number;
  name: string;
  description: string | null;
  sourceLocale: string;
}

/** Result of the bulk import commit endpoint. */
export interface PushResult {
  created: number;
  updated: number;
  skipped: number;
}

export type ForceMode = "override" | "keep" | "ask" | "abort";

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
   * Local translations folder path
   * @default "./src/locales"
   */
  translationsPath?: string;

  /**
   * File template pattern for translation files
   * Placeholders: {languageTag}, {namespace}, {extension}
   * @default "{namespace}/{languageTag}.json"
   *
   * With the default template, the system default namespace is stored as
   * "{languageTag}.json" and non-default namespaces are stored as
   * "{namespace}/{languageTag}.json". Custom templates are interpreted
   * literally and do not apply root default-namespace handling.
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

  push?: PushConfig;

  pull?: PullConfig;
}

export interface GeneratorOptions {
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
}

export interface TranslationSyncOptions {
  translationsPath: string;
  fileTemplate: string;
  format: "json";
}

export interface GenerationResult {
  success: boolean;
  filePath?: string;
  keysGenerated?: number;
  error?: string;
  /** Time taken to generate, in milliseconds. */
  duration?: number;
}

/** Result of the CI-mode type check. */
export interface CheckResult {
  upToDate: boolean;
  /** Keys the generator produced. */
  keysGenerated?: number;
  /** Keys already in the file on disk, when it exists. */
  currentKeys?: number;
  filePath?: string;
}

export interface PullResult {
  locales: string[];
  namespaces: string[];
  filesWritten: number;
}

/** Prospective counts for a push: what a run WOULD create, update or delete,
 * and how many keys conflict. Contrast {@link PushResult}, which counts what a
 * run actually did. */
export interface TranslationDiff {
  created: number;
  updated: number;
  conflicts: number;
  deleted: number;
}

export type { Logger, LogLevel } from "./utils/logger";
export type { TypegenError } from "./utils/errors";
export type { FileSystem } from "./core/FileSystemWriter";
export type { GenerationReporter, GenerationStats } from "./core/GenerationReporter";
