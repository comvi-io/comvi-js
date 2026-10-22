export { TypeGenerator } from "./core/TypeGenerator";
export { ApiClient, API_ENDPOINTS } from "./core/ApiClient";
export { TypeEmitter } from "./core/TypeEmitter";
export { ConfigLoader } from "./core/ConfigLoader";
export { TranslationSync } from "./core/TranslationSync";
export { CatalogCheck } from "./core/CatalogCheck";

export { FileSystemWriter, NodeFileSystem, InMemoryFileSystem } from "./core/FileSystemWriter";
export { ConsoleReporter, SilentReporter, CollectingReporter } from "./core/GenerationReporter";
export { createLogger, ConsoleLogger, SilentLogger, LogLevel } from "./utils/logger";
export { TypegenError, ErrorCodes, wrapError } from "./utils/errors";

export type {
  ComviConfig,
  GeneratorOptions,
  GenerationResult,
  CheckResult,
  SchemaParam,
  KeySchema,
  ProjectSchema,
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
  Logger,
  FileSystem,
  GenerationReporter,
  GenerationStats,
} from "./types";

export type { TypeEmitterOptions } from "./core/TypeEmitter";

export type {
  CatalogCheckOptions,
  CatalogCheckReport,
  CatalogCheckSourceReport,
  CatalogCheckLocaleReport,
  CatalogCheckSummary,
  CatalogCheckParamsFinding,
  CatalogCheckPluralFinding,
  CatalogCheckSelectFinding,
  CatalogCheckTagsFinding,
  CatalogCheckUnbalancedTagsFinding,
  CatalogCheckUnsupportedIcuFinding,
  PluralRuleType,
} from "./core/CatalogCheck";

export type {
  ApiClientOptions,
  FetchTranslationsOptions,
  NamespaceInfo,
  PushTranslationsOptions,
  PushProgress,
} from "./core/ApiClient";
