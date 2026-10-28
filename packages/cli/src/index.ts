/**
 * The typegen Node API, the same `generate()`/`watch()` the `comvi typegen` command, the
 * Vite plugin, Next and Nuxt call (one output for the same catalogs).
 */
export { generate, watch } from "@comvi/typegen";
export type {
  From,
  GenerateMessage,
  GenerateOptions,
  GenerateResult,
  WatchOptions,
  Watcher,
  WireSchema,
  WireKey,
  WireParam,
  ParamKind,
} from "@comvi/typegen";
export { ApiClient, API_ENDPOINTS } from "./core/ApiClient";
export { ConfigLoader } from "./core/ConfigLoader";
export { TranslationSync } from "./core/TranslationSync";
export { CatalogCheck } from "./core/CatalogCheck";

export { createLogger, ConsoleLogger, SilentLogger, LogLevel } from "./utils/logger";
export { TypegenError, ErrorCodes, wrapError } from "./utils/errors";

export type {
  ComviConfig,
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
} from "./types";

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
  CatalogCheckSyntaxFinding,
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

export type {
  MtFillRequest,
  MtFillResponse,
  MtFillJob,
  MtFillPairs,
  MtJobStatus,
  MtJobError,
  MtErrorType,
} from "./core/translateApi";
