import type { VirtualNode } from "./virtualNode";
import type { MessageCompiler, MissingParamMode, SyntaxExtension } from "./core/translate/syntax";
import type { TranslationCache as TranslationCacheClass } from "./core/TranslationCache";
import type { I18n } from "./core/i18n";
import type { I18nPlugin, PluginOptions } from "./plugins/types";

/**
 * Entry pushed onto the `window.__COMVI__` queue by every instance created
 * with `exposeGlobal` (discovery protocol v2 — see
 * `contracts/chrome-extension-proxy.json`).
 */
export interface ComviQueueEntry {
  /** Core library version that produced the entry */
  v: string;
  /** The exposed i18n instance */
  i: I18n;
}

/**
 * Hook object a consumer (e.g. the in-context editor) may swap in place of
 * the raw queue array after draining it. It must accept new entries via
 * `push` and support identity-based removal via `remove`.
 */
export interface ComviHook {
  push(entry: ComviQueueEntry): void;
  remove(entry: ComviQueueEntry): void;
}

/**
 * Global Comvi discovery queue exposed on window for browser extensions:
 * either the raw v2 entry array or a consumer-swapped hook object.
 */
export type ComviQueue = ComviQueueEntry[] | ComviHook;

declare global {
  interface Window {
    __COMVI__?: ComviQueue;
  }
}

/**
 * Available i18n events
 */
export type I18nEvent =
  | "initialized"
  | "destroyed"
  | "localeChanged"
  | "defaultNamespaceChanged"
  | "translationsCleared"
  | "loadingStateChanged"
  | "namespaceLoaded"
  | "missingKey"
  | "loadError"
  | "configChanged";

/**
 * Event data payloads for each event type
 */
export type I18nEventData = {
  initialized: void;
  destroyed: void;
  localeChanged: { from: string; to: string };
  defaultNamespaceChanged: { from: string; to: string };
  translationsCleared: { locale?: string; namespace?: string };
  loadingStateChanged: { isLoading: boolean; isInitializing: boolean };
  namespaceLoaded: { namespace: string; locale: string };
  missingKey: { key: string; locale: string; namespace: string };
  loadError: { locale: string; namespace: string; error: Error };
  /** Fired when runtime config changes: fallback locales, added translations, or activated namespaces */
  configChanged: {
    source: "fallbackLocale" | "translationsAdded" | "namespaceActivated" | "defaultParams";
  };
};

/**
 * Translation key schema interface
 * Extend this interface via declaration merging to add type-safe translation keys
 *
 * @example
 * ```typescript
 * declare module '@comvi/core' {
 *   interface TranslationKeys {
 *     'common.welcome': { name: string };
 *     'common.items': { count: number };
 *     'common.greeting': never; // No params required
 *   }
 * }
 * ```
 */
export interface TranslationKeys {
  // Empty by default - extended via declaration merging
}

/**
 * Check if TranslationKeys has been extended with actual keys
 * Used to provide permissive fallback when types are not generated
 */
export type HasTranslationKeys = keyof TranslationKeys extends never ? false : true;

/**
 * Permissive key type - only active when TranslationKeys is empty
 * When TranslationKeys has keys: never (disabled)
 * When TranslationKeys is empty: string (any key allowed)
 */
export type PermissiveKey = keyof TranslationKeys extends never ? string : never;

/**
 * Keys without namespace prefix (default namespace keys).
 * Filters out "ns:key" format keys so they don't appear in autocomplete for t(key).
 * Namespaced keys are accessible via t(key, { ns: 'namespace' }) instead.
 */
export type DefaultNsKeys = {
  [K in keyof TranslationKeys]: K extends `${string}:${string}` ? never : K;
}[keyof TranslationKeys];

/**
 * Extract all namespace prefixes from keys (e.g., "admin" from "admin:dashboard")
 */
export type ExtractNamespaces<K = keyof TranslationKeys> = K extends `${infer NS}:${string}`
  ? NS
  : never;

/**
 * All available namespaces derived from TranslationKeys
 */
export type Namespaces = ExtractNamespaces<keyof TranslationKeys>;

/**
 * Extract keys for a specific namespace (without the prefix)
 * e.g., NamespacedKeys<"admin"> = "dashboard" | "settings" | ...
 */
export type NamespacedKeys<NS extends string> = keyof TranslationKeys extends infer K
  ? K extends `${NS}:${infer Rest}`
    ? Rest
    : never
  : never;

/**
 * Get params type for a namespaced key
 * e.g., NamespacedKeyParams<"admin", "dashboard"> = TranslationKeys["admin:dashboard"]
 */
export type NamespacedKeyParams<
  NS extends string,
  K extends string,
> = `${NS}:${K}` extends keyof TranslationKeys ? TranslationKeys[`${NS}:${K}`] : never;

export type TranslationParamValue =
  | TranslationResult
  | number
  | boolean
  | VirtualNode
  | TagCallback
  | null
  | undefined;

/** Non-nullish interpolation values that can act as instance-level defaults. */
export type DefaultTranslationParamValue = Exclude<TranslationParamValue, null | undefined>;

/**
 * Interpolation values merged under every translation call.
 * Routing and call-control options are intentionally excluded.
 */
export type DefaultTranslationParams = Record<string, DefaultTranslationParamValue> & {
  ns?: never;
  locale?: never;
  fallback?: never;
  raw?: never;
  tagInterpolation?: never;
};

/** @internal Required own properties represent constructor-level guarantees. */
type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

/** @internal Optional defaults cannot represent constructor guarantees. */
type OptionalKeys<T> = Exclude<keyof T, RequiredKeys<T>>;

/** @internal Union of generated parameter objects, excluding parameterless messages. */
type TranslationParamSchemas = {
  [K in keyof TranslationKeys]: [TranslationKeys[K]] extends [never] ? never : TranslationKeys[K];
}[keyof TranslationKeys];

/** @internal Generated value types compatible with a constructor default. */
type CompatibleSchemaValueUnion<K extends keyof D, D> = TranslationParamSchemas extends infer P
  ? P extends unknown
    ? K extends keyof P
      ? D[K] extends P[K]
        ? P[K]
        : never
      : never
    : never
  : never;

/** @internal Intersection across compatible schemas, preserving unions inside each schema. */
type CompatibleSchemaValueIntersection<K extends keyof D, D> = (
  TranslationParamSchemas extends infer P
    ? P extends unknown
      ? K extends keyof P
        ? D[K] extends P[K]
          ? (value: P[K]) => void
          : never
        : never
      : never
    : never
) extends (value: infer V) => void
  ? V
  : never;

/** @internal Primitive widening for defaults absent from generated schemas. */
type WidenDefaultValue<V> = V extends string
  ? string
  : V extends number
    ? number
    : V extends boolean
      ? boolean
      : V;

/** @internal Safe runtime replacement domain for a guaranteed default key. */
type ReplacementDefaultValue<K extends keyof D, D> = [CompatibleSchemaValueUnion<K, D>] extends [
  never,
]
  ? WidenDefaultValue<D[K]>
  : CompatibleSchemaValueIntersection<K, D>;

/** @internal Required constructor defaults and schema-compatible replacement types. */
type GuaranteedDefaults<D> = {
  -readonly [K in RequiredKeys<D>]-?: ReplacementDefaultValue<K, D>;
};

/** @internal Constructor-guaranteed default keys that are compatible with a message schema. */
type CompatibleDefaultKeys<P, D> = {
  [K in keyof P]-?: K extends RequiredKeys<D>
    ? K extends keyof D
      ? D[K] extends P[K]
        ? K
        : never
      : never
    : never;
}[keyof P];

/** @internal Parameters that still have to be provided by the call site. */
type MissingParams<P, D> = Omit<P, CompatibleDefaultKeys<P, D>>;

/** @internal Full call params, with constructor-guaranteed values available as overrides. */
type CallParams<P, D> = MissingParams<P, D> &
  Partial<Pick<P, CompatibleDefaultKeys<P, D>>> &
  TranslationParams;

/**
 * Helper type for conditional parameter validation
 * - If key requires params, params are required and typed
 * - If key has no params (never), params are optional
 */
export type ParamsArg<K extends keyof TranslationKeys, D extends DefaultTranslationParams = {}> = [
  TranslationKeys[K],
] extends [never]
  ? [params?: TranslationParams]
  : {} extends MissingParams<TranslationKeys[K], D>
    ? [params?: CallParams<TranslationKeys[K], D>]
    : [params: CallParams<TranslationKeys[K], D>];

/**
 * Helper type for namespaced key parameter validation
 */
export type NamespacedParamsArg<
  NS extends string,
  K extends string,
  D extends DefaultTranslationParams = {},
> =
  NamespacedKeyParams<NS, K> extends never
    ? [params: { ns: NS } & TranslationParams]
    : [params: { ns: NS } & CallParams<NamespacedKeyParams<NS, K>, D>];

/**
 * Generic typed translation function — the canonical call-signature set shared
 * by the framework wrappers' `t` / `tRaw` (replaces the per-wrapper overload blocks).
 *
 * @typeParam D - Instance-level default interpolation params.
 * @typeParam R - Return type: `string` for `t`, `TranslationResult` for `tRaw`.
 */
export interface TranslateFn<D extends DefaultTranslationParams = {}, R = string> {
  /** Namespaced keys (explicit `ns` in params). */
  <NS extends Namespaces, K extends NamespacedKeys<NS>>(
    key: K,
    ...params: NamespacedParamsArg<NS, K, D>
  ): R;
  /** Typed keys from the default namespace. */
  <K extends DefaultNsKeys>(key: K, ...params: ParamsArg<K, D>): R;
  /** Permissive overload — only active when `TranslationKeys` is empty. */
  (key: PermissiveKey, params?: TranslationParams): R;
}

/**
 * Tag callback params passed to tag handlers
 */
export interface TagCallbackParams {
  /** Inner content of the tag (already processed) */
  children: TranslationResult;
  /** Tag name as it appears in the translation */
  name: string;
}

/**
 * Tag handler function type
 */
export type TagCallback = (params: TagCallbackParams) => VirtualNode | string;

export interface TranslationParams {
  ns?: string;
  locale?: string;
  /** Fallback text to return if translation key is missing (after checking locale chain and onMissingKey callback) */
  fallback?: string;
  /** When true, post-processors that support it (e.g., IncontextEditor) will skip their processing for this call */
  raw?: boolean;
  /**
   * Per-call tag interpolation options, merged over the instance-level
   * `tagInterpolation` constructor option for this call only (per-call
   * `extensions` UNION with instance-level ones; other fields override).
   * This is the ordering-proof channel `<T>` / `prepareTranslation` use to
   * activate tag syntax without ambient registration. Reserved key — not an
   * interpolation value.
   */
  tagInterpolation?: TagInterpolationOptions;
  [key: string]: TranslationParamValue | TagInterpolationOptions;
}

/** Runtime replacement accepted by an instance with constructor-guaranteed defaults. */
export type SetDefaultParamsArg<D extends DefaultTranslationParams = {}> = keyof D extends never
  ? DefaultTranslationParams | undefined
  : [keyof GuaranteedDefaults<D>] extends [never]
    ? DefaultTranslationParams | undefined
    : DefaultTranslationParams & GuaranteedDefaults<D>;

/** Shallow snapshot returned for an instance's current defaults. */
export type DefaultParamsSnapshot<D extends DefaultTranslationParams = {}> = keyof D extends never
  ? Readonly<DefaultTranslationParams> | undefined
  : [keyof GuaranteedDefaults<D>] extends [never]
    ? Readonly<DefaultTranslationParams> | undefined
    : Readonly<DefaultTranslationParams & GuaranteedDefaults<D>>;

export type PostProcessFn = (
  result: TranslationResult,
  key: string,
  ns: string,
  params: TranslationParams,
) => TranslationResult;

export interface MissingKeyInfo {
  key: string;
  locale: string;
  namespace: string;
}

/**
 * Configuration options for tag interpolation feature
 */
export interface TagInterpolationOptions {
  /**
   * Whitelist of HTML tags that are rendered as-is without requiring handlers.
   * These tags will be rendered as actual HTML elements.
   * @default []
   * @example ['strong', 'em', 'br', 'b', 'i', 'p', 'span']
   */
  basicHtmlTags?: string[];
  /**
   * Strict mode for tag handling:
   * - false: Silently fall back to inner text when no handler (production default)
   * - "warn": Call onTagWarning or console.warn + fall back to inner text (development)
   * - true: Throw error when tag has no handler (testing/CI)
   * @default false
   */
  strict?: boolean | "warn";
  /**
   * Called when strict="warn" and a tag has no handler.
   * Use to route through reportError for consistent error pipeline.
   */
  onTagWarning?: (tagName: string) => void;
  /**
   * Per-call syntax extensions. The effective extension set at parse time is
   * ambient ∪ per-call, so passing `tagSyntaxExtension` (from
   * `@comvi/core/tags`) here activates tag parsing for these calls only —
   * independent of import order and bundler side-effect handling. This is the
   * channel `<T>` / `prepareTranslation` use.
   */
  extensions?: readonly SyntaxExtension[];
}

export interface I18nBaseOptions {
  locale: string;
  defaultNs?: string;
  /**
   * Message compiler for this instance. Defaults to the simple
   * text + `{param}` compiler; pass `icuCompiler` from `@comvi/core/icu`
   * for inline ICU catalogs, or install it pre-ingestion with `.with(icu())`.
   */
  compiler?: MessageCompiler;
  /**
   * How to render a placeholder whose parameter is absent or `undefined`:
   * - `"literal"` (default): the placeholder renders as itself, e.g. `{name}`
   *   (ICU-aligned; one dev warning per (template, param) pair)
   * - `"drop"`: the placeholder renders as an empty string (pre-0.5 behavior)
   *
   * A `null` param always renders as an empty string in both modes
   * (explicit erasure).
   * @default "literal"
   */
  missingParam?: MissingParamMode;
  /**
   * Namespaces to load during initialization
   * If not specified, only the default namespace will be loaded
   * To skip initial namespace loading, pass an empty array: []
   */
  ns?: string[];
  translation?: Record<string, Record<string, TranslationValue>>;
  /** Single or chain of fallback locales to try when a key is missing in the active locale */
  fallbackLocale?: string | string[];
  /** Optional post-processing applied to every translation result */
  postProcess?: PostProcessFn;
  /** Optional hook invoked when a key is missing (after fallbacks). Return string/parts to override default. */
  onMissingKey?: (info: MissingKeyInfo) => TranslationResult | void;
  /** Optional strict diagnostics mode */
  strict?: "dev" | "off";
  /**
   * API key for translation management services.
   * Plugins can access this via i18n.apiKey to authenticate with backend services.
   */
  apiKey?: string;
  /**
   * Whether the in-context editor may collect anonymous translation context
   * (translation keys, on-screen layout hints, screen groups) and send it to
   * the project's own Comvi backend to improve translation suggestions.
   *
   * Collection is ON by default — the in-context editor (including the Chrome
   * extension) exists primarily to gather this context. Set to `false` here,
   * in your app's i18n setup, to opt out; it is the single developer-level
   * control and is honored even when the editor is enabled via the extension.
   * @default true
   */
  collectContext?: boolean;
  /**
   * Expose this instance on the window.__COMVI__ discovery queue for browser
   * extensions. Extensions like Comvi In-Context Editor drain the queue (or
   * swap in a hook) to detect and interact with instances.
   * @default true (in browser environments)
   */
  exposeGlobal?: boolean;
  /**
   * Unique identifier for this instance when using multiple i18n instances.
   * Auto-generated if not provided.
   */
  instanceId?: string;
  /**
   * Configuration for XML-like tag interpolation in translations.
   * Allows using `<tag>content</tag>` syntax in translation strings.
   */
  tagInterpolation?: TagInterpolationOptions;
  /**
   * Development mode flag.
   * Plugins use this to determine behavior (e.g., API vs CDN loading).
   * Auto-detected if not provided: true when import.meta.env.DEV or NODE_ENV !== 'production'
   */
  devMode?: boolean;
  /**
   * Global error handler for errors.
   * Called for: plugin failures, plugin-cleanup failures, init failures, translation render errors
   * (including missing tag handlers when strict="warn"), namespace-load failures, post-processor
   * failures, and event-listener failures.
   * Use to report to Sentry, DataDog, or other monitoring.
   *
   * @example
   * ```typescript
   * createI18n({
   *   locale: 'en',
   *   onError: (error, ctx) => Sentry.captureException(error, { extra: ctx }),
   * });
   * ```
   */
  onError?: (error: Error, context?: ErrorReportContext) => void;
}

/**
 * Core instance options. Constructor defaults are interpolation values only;
 * call-level routing controls (`locale`, `ns`, `fallback`, `raw`) stay explicit.
 */
export type I18nOptions<D extends DefaultTranslationParams = {}> = I18nBaseOptions &
  (keyof D extends never
    ? { defaultParams?: D }
    : string extends keyof D
      ? { defaultParams: D }
      : [OptionalKeys<D>] extends [never]
        ? { defaultParams: D }
        : never);

/**
 * Context for error reporting - helps identify error source
 */
export interface ErrorReportContext {
  /** Where the error originated */
  source:
    | "plugin"
    | "plugin-cleanup"
    | "init"
    | "translation"
    | "namespace-load"
    | "post-processor"
    | "event"
    | "setLocale";
  /** Plugin name (when source is plugin or plugin-cleanup) */
  pluginName?: string;
  /** Tag name or component (when source is translation) */
  tagName?: string;
  /** Translation key (when source is namespace-load, post-processor) */
  key?: string;
  /** Locale (when source is namespace-load) */
  locale?: string;
  /** Namespace (when source is namespace-load) */
  namespace?: string;
  /** Event name (when source is event) */
  event?: I18nEvent;
}

/** @internal Check if a type is a plain object (not a primitive) */
type IsObject<T> =
  T extends Record<string, unknown>
    ? T extends string | number | boolean | null | undefined
      ? false
      : true
    : false;

/** @internal Flatten leaf keys at a given depth */
type L1<T, P extends string> = { [K in keyof T & string]: `${P}${K}` }[keyof T & string];

type L2<T, P extends string> = {
  [K in keyof T & string]: IsObject<T[K]> extends true
    ? T[K] extends infer V extends Record<string, unknown>
      ? L1<V, `${P}${K}.`>
      : `${P}${K}`
    : `${P}${K}`;
}[keyof T & string];

type L3<T, P extends string> = {
  [K in keyof T & string]: IsObject<T[K]> extends true
    ? T[K] extends infer V extends Record<string, unknown>
      ? L2<V, `${P}${K}.`>
      : `${P}${K}`
    : `${P}${K}`;
}[keyof T & string];

type L4<T, P extends string> = {
  [K in keyof T & string]: IsObject<T[K]> extends true
    ? T[K] extends infer V extends Record<string, unknown>
      ? L3<V, `${P}${K}.`>
      : `${P}${K}`
    : `${P}${K}`;
}[keyof T & string];

/**
 * Flatten a nested object type to dot-notation keys (non-recursive, up to 5 levels).
 * { a: { b: "val" } } → "a.b"
 */
type FlattenKeys<T extends Record<string, unknown>> = {
  [K in keyof T & string]: IsObject<T[K]> extends true
    ? T[K] extends infer V extends Record<string, unknown>
      ? L4<V, `${K}.`>
      : K
    : K;
}[keyof T & string];

/** @internal Add "NS:" prefix, but skip if NS matches DefaultNS */
type AddPrefix<
  K extends string,
  NS extends string | undefined,
  DefaultNS extends string | undefined,
> = NS extends string ? (NS extends DefaultNS ? K : `${NS}:${K}`) : K;

/**
 * Infer translation keys from a JSON locale object.
 *
 * - Without namespace: `InferKeys<typeof json>` → `'key'`
 * - With namespace: `InferKeys<typeof json, 'admin'>` → `'admin:key'`
 * - Default namespace is not prefixed: `InferKeys<typeof json, 'common', 'common'>` → `'key'`
 *
 * @example Single file per locale
 * ```typescript
 * import type { InferKeys } from '@comvi/core'
 * import en from '../locales/en.json'
 * import admin from '../locales/admin/en.json'
 *
 * declare module '@comvi/core' {
 *   interface TranslationKeys extends
 *     InferKeys<typeof en>,
 *     InferKeys<typeof admin, 'admin'> {}
 * }
 * ```
 *
 * @example Root default namespace plus namespace folders
 * ```typescript
 * import type { InferKeys } from '@comvi/core'
 * import common from '../locales/en.json'
 * import admin from '../locales/admin/en.json'
 *
 * type DefaultNS = 'common'
 *
 * declare module '@comvi/core' {
 *   interface TranslationKeys extends
 *     InferKeys<typeof common, 'common', DefaultNS>,
 *     InferKeys<typeof admin, 'admin', DefaultNS> {}
 * }
 * ```
 *
 * Note: Parameter types are not inferred from translation values.
 * All keys have `never` params (params optional). For full parameter
 * typing, use the CLI `generate-types` command.
 */
export type InferKeys<
  T extends Record<string, unknown>,
  NS extends string | undefined = undefined,
  DefaultNS extends string | undefined = undefined,
> = {
  [K in FlattenKeys<T> as AddPrefix<K, NS, DefaultNS>]: never;
};

export type TranslationValue = string | { [key: string]: TranslationValue };

export type FlattenedTranslations = Record<string, string>;

export type TranslationCache = TranslationCacheClass;

export type TranslationResult = string | Array<string | VirtualNode>;

/** Result of a loader call: a (possibly nested) translation object. */
export type LoaderResult = Record<string, TranslationValue>;

/** Async translation loader: resolves the translations for one locale+namespace. */
export type LoaderFn = (locale: string, namespace: string) => Promise<LoaderResult>;

/**
 * The always-present instance surface: everything the base `I18n` class keeps
 * in every graph, including the pure `@comvi/core` entry.
 *
 * Capability APIs live in `I18nLoaderApi` / `I18nPluginHostApi` below and
 * arrive from the `@comvi/core/loader` and `@comvi/core/plugins` subpaths. The
 * ROOT entry is this surface and nothing more; the internal composite (which
 * the CDN global ships) and `@comvi/next`'s composed host recompose all three
 * (see `I18nPluginHost`). `I18nInstance` re-picks exactly the members the
 * pre-split root exposed (pinned by the exact-keys type test), so it describes
 * a COMPOSED host, not the base one.
 */
export interface I18nCoreInstance<D extends DefaultTranslationParams = {}> {
  /**
   * The current locale
   * @returns The current locale (getter)
   * @param value - The locale string to set (setter)
   */
  get locale(): string;
  set locale(value: string);

  /**
   * API key for translation management services.
   * Plugins can use this to authenticate with backend services.
   */
  get apiKey(): string | undefined;

  /**
   * Context-collection preference (see I18nOptions.collectContext).
   * `false` means the site opted out; `undefined` means the default (on).
   * The in-context editor reads this to decide whether to collect context.
   */
  get collectContext(): boolean | undefined;

  /**
   * Development mode flag.
   * Plugins use this to determine behavior (e.g., API vs CDN loading).
   */
  get devMode(): boolean;

  /**
   * Get the translations for all languages
   * @returns The translations for all languages (readonly)
   */
  get translationCache(): TranslationCache;

  /**
   * Flag indicating if translations are currently being loaded
   */
  get isLoading(): boolean;

  /**
   * Flag indicating if Comvi i18n is currently initializing (only true during init())
   */
  get isInitializing(): boolean;

  /**
   * Flag indicating if Comvi i18n has been initialized (init() completed successfully)
   */
  get isInitialized(): boolean;

  /**
   * Check if a locale exists in the cache
   * @param locale - The locale to check
   * @param namespace? - The namespace to check (optional)
   * @returns True if the locale exists, false otherwise
   */
  hasLocale: (locale: string, namespace?: string) => boolean;

  /**
   * Add translations to the cache
   * @param translations - The translations to add
   */
  addTranslations: (translations: Record<string, Record<string, TranslationValue>>) => void;

  /**
   * Get the translations for the given locale
   * @param locale - The locale to get the translations for
   * @param namespace - The namespace to get the translations for
   * @returns The translations for the given locale
   */
  getTranslations: (locale?: string, namespace?: string) => FlattenedTranslations;

  /**
   * Clear translations from cache
   * @param locale - Optional locale to clear (if not provided, clears all)
   * @param namespace - Optional namespace to clear (if not provided, clears all)
   */
  clearTranslations: (locale?: string, namespace?: string) => void;

  /**
   * Translate a namespaced key
   * When ns is provided, suggests keys without the namespace prefix
   *
   * @example
   * ```typescript
   * t('dashboard', { ns: 'admin' }); // ✅ Suggests 'dashboard', 'settings', etc.
   * t('unknown', { ns: 'admin' }); // ❌ Compile error
   * ```
   */
  t<NS extends Namespaces, K extends NamespacedKeys<NS>>(
    key: K,
    ...params: NamespacedParamsArg<NS, K, D>
  ): string;

  /**
   * Raw structured translation result for tag interpolation renderers.
   */
  tRaw<NS extends Namespaces, K extends NamespacedKeys<NS>>(
    key: K,
    ...params: NamespacedParamsArg<NS, K, D>
  ): TranslationResult;

  /**
   * Translate a key to the current locale
   * @param key - The translation key (must be defined in TranslationKeys interface)
   * @param params - The parameters to pass to the translation
   * @returns The translated value
   *
   * @example
   * ```typescript
   * // With typed keys
   * t('common.welcome', { name: 'Alice' }); // ✅ Typed params
   * t('common.greeting'); // ✅ No params needed
   * t('unknown.key'); // ❌ Compile error
   *
   * // Dynamic keys require type assertion
   * t(`errors.${code}` as keyof TranslationKeys);
   * ```
   */
  t<K extends DefaultNsKeys>(key: K, ...params: ParamsArg<K, D>): string;

  /**
   * Raw structured translation result for the current locale
   */
  tRaw<K extends DefaultNsKeys>(key: K, ...params: ParamsArg<K, D>): TranslationResult;

  /**
   * Permissive overload - only active when TranslationKeys is empty
   * Allows any string key when types are not generated
   */
  t(key: PermissiveKey, params?: TranslationParams): string;

  /**
   * Raw permissive overload - only active when TranslationKeys is empty
   */
  tRaw(key: PermissiveKey, params?: TranslationParams): TranslationResult;

  /**
   * Check if a translation key exists
   * @param key - The key to check
   * @param locale - The locale to check (optional, defaults to current locale)
   * @param namespace - The namespace to check (optional, defaults to current namespace)
   * @returns True if the key exists, false otherwise
   */
  hasTranslation: (
    key: string,
    locale?: string,
    namespace?: string,
    checkFallbacks?: boolean,
  ) => boolean;

  /** Update fallback locales at runtime */
  setFallbackLocale: (fallback: string | string[]) => void;

  /**
   * Replace the instance-level default translation params at runtime.
   * Emits `configChanged` (source: "defaultParams") so framework bindings re-render.
   */
  setDefaultParams: (params: SetDefaultParamsArg<D>) => void;

  /** Current defaults as a new shallow snapshot; nested values retain their identity. */
  readonly defaultParams: DefaultParamsSnapshot<D>;

  /** Monotonic revision for runtime configuration updates. */
  readonly configRevision: number;

  /** Update default namespace at runtime */
  setDefaultNamespace: (namespace: string) => void;

  /**
   * Subscribe to a specific i18n event
   * @param event - Event name to subscribe to
   * @param callback - Event handler function
   * @returns Unsubscribe function
   */
  on<E extends I18nEvent>(event: E, callback: (data: I18nEventData[E]) => void): () => void;

  /**
   * Report an error to the configured onError handler.
   * Use for custom error reporting in your app.
   */
  reportError: (error: unknown, context?: ErrorReportContext) => void;
}

/**
 * Async-loading capability — `@comvi/core/loader`, composed on with
 * `.with(loader())` / `attachLoader`. Absent from the base root by module
 * graph; the internal composite and `@comvi/next`'s composed host carry it on
 * their class surface.
 */
export interface I18nLoaderApi {
  /**
   * Register a translation loader function.
   *
   * This signature takes a loader FUNCTION. For a static import map use the
   * configured installer `loader(map)`, or wrap it yourself with
   * `createImportMapLoader` — both from `@comvi/core/loader`. The two-overload
   * form (function OR import map) survives only on the internal composite the
   * CDN global ships and on `@comvi/next`'s published composed host.
   */
  registerLoader: (loader: LoaderFn) => void;

  /** Get the registered loader function */
  getLoader: () => LoaderFn | undefined;

  /**
   * Reload translations from registered loader
   * @param locale - Optional locale to reload (defaults to current + fallbacks)
   * @param namespace - Optional namespace to reload (defaults to active namespaces)
   */
  reloadTranslations: (locale?: string, namespace?: string) => Promise<void>;

  /**
   * Activate a namespace and load it for the current locale.
   *
   * Activation only matters when something loads namespaces, so it belongs to
   * the loader capability (contingency C1). Base hosts activate
   * implicitly — `addTranslations` self-activates the namespaces it carries.
   */
  addActiveNamespace: (namespace: string) => Promise<void>;

  /** Activate several namespaces and load them for the current locale. */
  addActiveNamespaces: (namespaces: string[]) => Promise<void>;

  /**
   * Subscribe to load failures (contingency C2 — only the loader capability
   * can emit `loadError`).
   * @returns Cleanup function to remove the callback
   */
  onLoadError: (callback: (locale: string, namespace: string, error: Error) => void) => () => void;
}

/**
 * Plugin-host capability — `@comvi/core/plugins`, composed on with
 * `.with(plugins())` / `attachPlugins`. Absent from the base root by module
 * graph. Constructor *options* (`postProcess`, `onMissingKey`) stay universal;
 * only the runtime registration APIs are a capability.
 */
export interface I18nPluginHostApi {
  /**
   * Register a plugin (chainable)
   * @param plugin - The plugin to register
   * @param options - Plugin options (required, timeout, onError)
   */
  use(plugin: I18nPlugin, options?: PluginOptions): this;

  /**
   * Register a locale detector function.
   * Used by plugins to provide automatic locale detection.
   */
  registerLocaleDetector: (detector: () => string | Promise<string>) => void;

  /** Get the registered locale detector function */
  getLanguageDetector: () => (() => string | Promise<string>) | undefined;

  /**
   * Register a callback for missing translation keys
   * @param callback - Function called when a key is missing. Can return a value to use as fallback.
   * @returns Cleanup function to remove the callback
   */
  onMissingKey: (
    callback: (key: string, locale: string, namespace: string) => TranslationResult | void,
  ) => () => void;

  /**
   * Register a post-processor function.
   * Post-processors are chained in the order they are registered (FIFO).
   */
  registerPostProcessor: (fn: PostProcessFn) => void;

  /**
   * Store plugin-specific data on the i18n instance.
   * This allows plugins to store configuration that persists with the instance.
   *
   * @param key - Unique key for the plugin data (e.g., 'fetchLoader')
   * @param data - The data to store
   *
   * @example
   * ```typescript
   * // In FetchLoader plugin
   * i18n.setPluginData('fetchLoader', { cdnUniqueId, projectId });
   * ```
   */
  setPluginData: (key: string, data: unknown) => void;

  /**
   * Retrieve plugin-specific data from the i18n instance.
   *
   * @param key - The key used when storing the data
   * @returns The stored data or undefined if not found
   *
   * @example
   * ```typescript
   * // In loadTranslations
   * const config = i18n.getPluginData('fetchLoader');
   * ```
   */
  getPluginData: <T = unknown>(key: string) => T | undefined;
}

/**
 * Public members the base `I18n` class has always had but the declarative
 * `I18nInstance` contract never listed: lifecycle, namespace inspection and
 * instance identity.
 *
 * They are named here rather than folded into `I18nCoreInstance` because
 * `I18nInstance` is recomposed from that interface and must keep an exactly
 * unchanged member set. The plugin host, in contrast, has always been the
 * whole class — so it composes these in too, and plugins keep compiling.
 */
export interface I18nCoreExtraApi {
  /** Stable id under which the instance is exposed on `window.__COMVI__`. */
  readonly instanceId: string | undefined;

  /** Initialize: run plugins, detect the locale, load the initial namespaces. */
  init(): Promise<this>;

  /** Tear down: plugin cleanups, event unsubscription, cache + state reset. */
  destroy: () => Promise<void>;

  /** Set the locale and wait for the active namespaces to load. */
  setLocaleAsync: (value: string) => Promise<void>;

  /** The current default namespace. */
  getDefaultNamespace: () => string;

  /** The active namespaces (read-only snapshot). */
  getActiveNamespaces: () => string[];

  /** The resolved fallback-locale chain (read-only snapshot). */
  getFallbackLocales: () => string[];

  /** Every locale code that currently has translations cached. */
  getLoadedLocales: () => string[];
}

/**
 * The instance surface a framework wrapper (react/solid/svelte/vue/next/nuxt)
 * requires of its host: reactive translation + lifecycle, and nothing else.
 *
 * Structurally this is EXACTLY what `class I18n` declares it implements
 * (`core/i18n.ts`: `implements I18nCoreInstance<D>, I18nCoreExtraApi`), so a
 * bare `@comvi/core` instance satisfies it without any capability
 * attached. Loader/plugin members are deliberately absent: wrappers acquire
 * those through their own capability hooks, which verify presence once and
 * throw {@link missingCapability} when the host has none.
 */
export type WrapperI18nHost<D extends DefaultTranslationParams = {}> = I18nCoreInstance<D> &
  I18nCoreExtraApi;

/**
 * The instance surface a plugin may rely on: the composed full capability set
 * a composed host exposes. Plugins that call loader APIs on a base host
 * need `attachLoader` to have run first (see the README's one-entry section).
 */
export type I18nPluginHost<D extends DefaultTranslationParams = {}> = I18nCoreInstance<D> &
  I18nCoreExtraApi &
  I18nLoaderApi &
  I18nPluginHostApi;

/**
 * The I18nInstance interface defines the methods and properties that an I18n instance must implement.
 * It provides access to the current locale, translation cache, and methods for checking locale existence,
 * adding translations, and translating keys.
 *
 * Recomposed from the split above with an EXACTLY unchanged member set: only
 * `reloadTranslations`, `setPluginData` and `getPluginData` of the capability
 * APIs were ever part of it, so they are re-picked one by one instead of
 * inheriting the whole capability interfaces (which would silently widen the
 * exported type). Pinned by `Equal<keyof I18nInstance, PreSplitKeySnapshot>`.
 *
 * NOTE: this is a COMPOSED host's shape. A base `@comvi/core` host satisfies
 * `I18nCoreInstance`, not this — it is assignable only once the loader and
 * plugin capabilities are composed on.
 */
export interface I18nInstance<D extends DefaultTranslationParams = {}>
  extends
    I18nCoreInstance<D>,
    Pick<I18nLoaderApi, "reloadTranslations">,
    Pick<I18nPluginHostApi, "setPluginData" | "getPluginData"> {}
