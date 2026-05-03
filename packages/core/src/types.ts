import type { VirtualNode } from "./virtualNode";
import type { TranslationCache as TranslationCacheClass } from "./core/TranslationCache";
import type { I18n } from "./core/i18n";

/**
 * Global Comvi object exposed on window for browser extensions
 * Extensions can use this to detect and interact with Comvi instances
 */
export interface ComviGlobal {
  /** Library version */
  version: string;
  /** Map of all registered i18n instances */
  instances: Map<string, I18n>;
  /** Register an instance */
  register: (id: string, instance: I18n) => void;
  /** Unregister an instance */
  unregister: (id: string) => void;
  /** Get an instance by ID, or the first instance if no ID provided */
  get: (id?: string) => I18n | undefined;
  /** Optional callback when a new instance is registered (for extensions) */
  onInstanceRegistered?: (id: string, instance: I18n) => void;
}

declare global {
  interface Window {
    __COMVI__?: ComviGlobal;
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
  | "loadError";

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

/**
 * Helper type for conditional parameter validation
 * - If key requires params, params are required and typed
 * - If key has no params (never), params are optional
 */
export type ParamsArg<K extends keyof TranslationKeys> = TranslationKeys[K] extends never
  ? [params?: TranslationParams]
  : [params: TranslationKeys[K] & TranslationParams];

/**
 * Helper type for namespaced key parameter validation
 */
export type NamespacedParamsArg<NS extends string, K extends string> =
  NamespacedKeyParams<NS, K> extends never
    ? [params: { ns: NS } & TranslationParams]
    : [params: { ns: NS } & NamespacedKeyParams<NS, K> & TranslationParams];

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
  [key: string]:
    | TranslationResult
    | number
    | boolean
    | VirtualNode
    | TagCallback
    | null
    | undefined;
}

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
}

export interface I18nOptions {
  locale: string;
  defaultNs?: string;
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
   * Expose this instance on window.__COMVI__ for browser extensions.
   * Extensions like Comvi In-Context Editor can detect and interact with the instance.
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
    | "event";
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
 * @example File per namespace (common is default)
 * ```typescript
 * import type { InferKeys } from '@comvi/core'
 * import common from '../locales/en/common.json'
 * import admin from '../locales/en/admin.json'
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

/**
 * The I18nInstance interface defines the methods and properties that an I18n instance must implement.
 * It provides access to the current locale, translation cache, and methods for checking locale existence,
 * adding translations, and translating keys.
 */
export interface I18nInstance {
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
   * Reload translations from registered loader
   * @param locale - Optional locale to reload (defaults to current + fallbacks)
   * @param namespace - Optional namespace to reload (defaults to active namespaces)
   */
  reloadTranslations: (locale?: string, namespace?: string) => Promise<void>;

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
    ...params: NamespacedParamsArg<NS, K>
  ): string;

  /**
   * Raw structured translation result for tag interpolation renderers.
   */
  tRaw<NS extends Namespaces, K extends NamespacedKeys<NS>>(
    key: K,
    ...params: NamespacedParamsArg<NS, K>
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
  t<K extends DefaultNsKeys>(key: K, ...params: ParamsArg<K>): string;

  /**
   * Raw structured translation result for the current locale
   */
  tRaw<K extends DefaultNsKeys>(key: K, ...params: ParamsArg<K>): TranslationResult;

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

  /**
   * Report an error to the configured onError handler.
   * Use for custom error reporting in your app.
   */
  reportError: (error: unknown, context?: ErrorReportContext) => void;

  /**
   * Format a number using the current locale
   * @param value - The number to format
   * @param options - Intl.NumberFormat options
   */
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;

  /**
   * Format a date using the current locale
   * @param value - The date to format
   * @param options - Intl.DateTimeFormat options
   */
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;

  /**
   * Format a number as currency using the current locale
   * @param value - The number to format
   * @param currency - The ISO 4217 currency code (e.g., 'USD', 'EUR')
   * @param options - Additional Intl.NumberFormat options
   */
  formatCurrency: (value: number, currency: string, options?: Intl.NumberFormatOptions) => string;

  /**
   * Format a relative time ("2 hours ago", "in 3 days") using the current locale
   * @param value - The numeric value (negative for past, positive for future)
   * @param unit - The time unit (e.g., 'day', 'hour', 'minute')
   * @param options - Intl.RelativeTimeFormat options
   */
  formatRelativeTime: (
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions,
  ) => string;

  /**
   * Text direction for the current locale ("ltr" or "rtl").
   * Use for HTML `dir` attribute or CSS logical properties.
   */
  readonly dir: "ltr" | "rtl";
}
