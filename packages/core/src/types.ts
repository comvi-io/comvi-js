import type { VirtualNode } from "./virtualNode";
import type { MessageCompiler, MissingParamMode, SyntaxExtension } from "./core/translate/syntax";
import type { TranslationCache as TranslationCacheClass } from "./core/TranslationCache";
import type { I18n } from "./core/i18n";
import type { I18nPlugin, PluginOptions } from "./plugins/types";

/**
 * Entry pushed onto the `window.__COMVI__` queue by instances carrying the
 * devtools discovery capability with `exposeGlobal` enabled (protocol v2 —
 * see `contracts/chrome-extension-proxy.json`).
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
  configChanged: {
    source: "fallbackLocale" | "translationsAdded" | "namespaceActivated" | "defaultParams";
  };
};

/**
 * Extend via declaration merging to add type-safe translation keys.
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
  // Deliberately empty — consumers extend it by declaration merging.
}

/** False when no keys were generated, which is what enables the permissive fallback. */
export type HasTranslationKeys = keyof TranslationKeys extends never ? false : true;

/** `string` while `TranslationKeys` is empty, `never` once keys exist. */
export type PermissiveKey = keyof TranslationKeys extends never ? string : never;

/**
 * Default-namespace keys. `"ns:key"` entries are filtered out so they do not
 * pollute `t(key)` autocomplete; reach them with `t(key, { ns })`.
 */
export type DefaultNsKeys = {
  [K in keyof TranslationKeys]: K extends `${string}:${string}` ? never : K;
}[keyof TranslationKeys];

/** `"admin"` from `"admin:dashboard"`. */
export type ExtractNamespaces<K = keyof TranslationKeys> = K extends `${infer NS}:${string}`
  ? NS
  : never;

export type Namespaces = ExtractNamespaces<keyof TranslationKeys>;

/** `NamespacedKeys<"admin">` is `"dashboard" | "settings" | …` — prefix stripped. */
export type NamespacedKeys<NS extends string> = keyof TranslationKeys extends infer K
  ? K extends `${NS}:${infer Rest}`
    ? Rest
    : never
  : never;

/** `NamespacedKeyParams<"admin", "dashboard">` is `TranslationKeys["admin:dashboard"]`. */
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

/** Params are required and typed when the key declares any, optional when it declares `never`. */
export type ParamsArg<K extends keyof TranslationKeys, D extends DefaultTranslationParams = {}> = [
  TranslationKeys[K],
] extends [never]
  ? [params?: TranslationParams]
  : {} extends MissingParams<TranslationKeys[K], D>
    ? [params?: CallParams<TranslationKeys[K], D>]
    : [params: CallParams<TranslationKeys[K], D>];

export type NamespacedParamsArg<
  NS extends string,
  K extends string,
  D extends DefaultTranslationParams = {},
> =
  NamespacedKeyParams<NS, K> extends never
    ? [params: { ns: NS } & TranslationParams]
    : [params: { ns: NS } & CallParams<NamespacedKeyParams<NS, K>, D>];

/**
 * The canonical call-signature set shared by every framework wrapper's `t` /
 * `tRaw`.
 *
 * @typeParam D - Instance-level default interpolation params.
 * @typeParam R - `string` for `t`, `TranslationResult` for `tRaw`.
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

export interface TagCallbackParams {
  /** Inner content of the tag, already processed. */
  children: TranslationResult;
  /** Tag name as written in the translation. */
  name: string;
}

export type TagCallback = (params: TagCallbackParams) => VirtualNode | string;

export interface TranslationParams {
  ns?: string;
  locale?: string;
  /** Used when the key is missing — after the locale chain and the `onMissingKey` callback. */
  fallback?: string;
  /** Post-processors that support it (the in-context editor) skip this call. */
  raw?: boolean;
  /**
   * Merged over the instance-level `tagInterpolation` for this call only:
   * `extensions` UNION with the instance-level ones, other fields override.
   * The ordering-proof channel `<T>` / `prepareTranslation` use to activate tag
   * syntax without ambient registration. Reserved key — NOT an interpolation
   * value.
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

export interface TagInterpolationOptions {
  /**
   * Tags rendered as real HTML elements without requiring a handler.
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
  /** Called when `strict: "warn"` and a tag has no handler; route it through `reportError`. */
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
   * - `"drop"`: the placeholder renders as an empty string
   *
   * A `null` param always renders as an empty string in both modes
   * (explicit erasure).
   * @default "literal"
   */
  missingParam?: MissingParamMode;
  /**
   * Namespaces to load during initialization. Omitted, only the default
   * namespace loads; pass `[]` to skip initial loading entirely.
   */
  ns?: string[];
  translation?: Record<string, Record<string, TranslationValue>>;
  /** Tried in order when a key is missing in the active locale. */
  fallbackLocale?: string | string[];
  /** Applied to every translation result. */
  postProcess?: PostProcessFn;
  /** Invoked when a key is missing, AFTER the fallback chain; a returned value overrides the key. */
  onMissingKey?: (info: MissingKeyInfo) => TranslationResult | void;
  strict?: "dev" | "off";
  /** Plugins read it back off `i18n.apiKey` to authenticate with backend services. */
  apiKey?: string;
  /**
   * Whether the in-context editor may collect anonymous translation context
   * (translation keys, on-screen layout hints, screen groups) and send it to
   * the project's own Comvi backend to improve translation suggestions.
   *
   * ON by default. Setting `false` here, in the app's i18n setup, is the single
   * developer-level opt-out, and it is honored even when the editor is enabled
   * through the Chrome extension.
   * @default true
   */
  collectContext?: boolean;
  /**
   * Discovery option for composed compatibility hosts (the CDN/UMD host and
   * `@comvi/next`'s composed preset). The base `@comvi/core` host accepts this
   * shared option shape but does not install discovery; base-host users compose
   * `devtools({ exposeGlobal })` or call `attachDevtools`.
   * @default true when the devtools capability is installed in a browser
   */
  exposeGlobal?: boolean;
  /**
   * Discovery identifier for composed compatibility hosts. Auto-generated
   * when the devtools capability is installed and no value is provided. On a
   * base host, pass it to `devtools({ instanceId })` or `attachDevtools`.
   */
  instanceId?: string;
  /** Enables `<tag>content</tag>` syntax in translation strings. */
  tagInterpolation?: TagInterpolationOptions;
  /**
   * Read by plugins to pick behaviour (API vs CDN loading). Auto-detected when
   * omitted: true under `import.meta.env.DEV` or `NODE_ENV !== "production"`.
   */
  devMode?: boolean;
  /**
   * Called for plugin and plugin-cleanup failures, init failures, translation
   * render errors (missing tag handlers under `strict: "warn"` included),
   * namespace-load failures, post-processor failures and event-listener
   * failures.
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
 *
 * `defaultParams` is REQUIRED for exactly one shape of `D`: one whose keys are
 * statically known and all required, because those keys are what the instance
 * then guarantees to `t()` and to `setDefaultParams()`. The two arms around it
 * carry no guarantees and so require nothing —
 *
 *  - `keyof D extends never` — the default `{}`, no defaults at all;
 *  - `string extends keyof D` — an INDEX SIGNATURE, which promises no
 *    particular key. This is also the arm every CONTEXTUAL position lands on
 *    (`ReturnType<typeof createI18n>`, `ConstructorParameters<typeof I18n>[0]`,
 *    a wrapper's `Pick<I18nOptions<D>, "defaultParams">`), where `D` is
 *    instantiated with its own constraint. It exists to keep an index-signature
 *    `D` out of the `never` arm below — `OptionalKeys<Record<string, V>>` is
 *    `string`, not `never` — and NOT to demand the option.
 */
export type I18nOptions<D extends DefaultTranslationParams = {}> = I18nBaseOptions &
  (keyof D extends never
    ? { defaultParams?: D }
    : string extends keyof D
      ? { defaultParams?: D }
      : [OptionalKeys<D>] extends [never]
        ? { defaultParams: D }
        : never);

export interface ErrorReportContext {
  source:
    | "plugin"
    | "plugin-cleanup"
    | "init"
    | "translation"
    | "namespace-load"
    | "post-processor"
    | "event"
    | "setLocale"
    | "compile";
  /** Plugin name (when source is plugin or plugin-cleanup) */
  pluginName?: string;
  /** Tag name or component (when source is translation) */
  tagName?: string;
  /** Translation key (when source is namespace-load, post-processor, compile) */
  key?: string;
  /** Locale (when source is namespace-load, compile) */
  locale?: string;
  /** Namespace (when source is namespace-load, compile) */
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

/** `{ a: { b: "val" } }` → `"a.b"`. Non-recursive: five levels deep at most. */
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
 * Parameter types are NOT inferred from translation values — every key gets
 * `never` params (so params are optional). Use the CLI `generate-types`
 * command for full parameter typing.
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
 * in every graph, the pure `@comvi/core` entry included.
 *
 * Capability APIs live in `I18nLoaderApi` / `I18nPluginHostApi` below and
 * arrive from the `@comvi/core/loader` and `@comvi/core/plugins` subpaths. The
 * ROOT entry is this surface and nothing more. Note that `I18nInstance`
 * describes a COMPOSED host, not this one.
 */
export interface I18nCoreInstance<D extends DefaultTranslationParams = {}> {
  get locale(): string;
  set locale(value: string);

  get apiKey(): string | undefined;

  /**
   * `false` means the site opted out; `undefined` means the default (on). Read
   * by the in-context editor. See {@link I18nBaseOptions.collectContext}.
   */
  get collectContext(): boolean | undefined;

  /** Read by plugins to pick behaviour (API vs CDN loading). */
  get devMode(): boolean;

  get translationCache(): TranslationCache;

  get isLoading(): boolean;

  /** True only for the duration of `init()`. */
  get isInitializing(): boolean;

  /** True once `init()` has completed successfully. */
  get isInitialized(): boolean;

  hasLocale: (locale: string, namespace?: string) => boolean;

  addTranslations: (translations: Record<string, Record<string, TranslationValue>>) => void;

  getTranslations: (locale?: string, namespace?: string) => FlattenedTranslations;

  /** An omitted `locale` or `namespace` clears all of them. */
  clearTranslations: (locale?: string, namespace?: string) => void;

  /**
   * Translate a namespaced key; with `ns` given, autocomplete offers keys
   * WITHOUT the namespace prefix.
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
   * Translate a key in the current locale. The key must exist in
   * `TranslationKeys` once types have been generated.
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

  /** Permissive overload — only active when `TranslationKeys` is empty. */
  t(key: PermissiveKey, params?: TranslationParams): string;

  /**
   * Raw permissive overload - only active when TranslationKeys is empty
   */
  tRaw(key: PermissiveKey, params?: TranslationParams): TranslationResult;

  /** `locale` and `namespace` default to the instance's current ones. */
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

  /** @returns Unsubscribe function. */
  on<E extends I18nEvent>(event: E, callback: (data: I18nEventData[E]) => void): () => void;

  /** Report through the configured `onError` handler. */
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
   * form (function OR import map) exists only on the composite and on
   * `@comvi/next`'s published composed host.
   */
  registerLoader: (loader: LoaderFn) => void;

  getLoader: () => LoaderFn | undefined;

  /**
   * An omitted `locale` reloads the current one plus its fallbacks; an omitted
   * `namespace` reloads every active namespace.
   */
  reloadTranslations: (locale?: string, namespace?: string) => Promise<void>;

  /**
   * Activate a namespace and load it for the current locale.
   *
   * Activation only matters when something loads namespaces, so it belongs to
   * the loader capability. Base hosts activate implicitly — `addTranslations`
   * self-activates the namespaces it carries.
   */
  addActiveNamespace: (namespace: string) => Promise<void>;

  /** Activate several namespaces and load them for the current locale. */
  addActiveNamespaces: (namespaces: string[]) => Promise<void>;

  /**
   * Subscribe to load failures. Lives here because only the loader capability
   * can emit `loadError`.
   * @returns Cleanup function that removes the callback.
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
  /** Chainable. MUST be called before `init()`, which drains the queue once. */
  use(plugin: I18nPlugin, options?: PluginOptions): this;

  /** `init()` consults it after the plugins have run. */
  registerLocaleDetector: (detector: () => string | Promise<string>) => void;

  getLanguageDetector: () => (() => string | Promise<string>) | undefined;

  /**
   * The callback may return a value to use as the fallback.
   * @returns Cleanup function that removes the callback.
   */
  onMissingKey: (
    callback: (key: string, locale: string, namespace: string) => TranslationResult | void,
  ) => () => void;

  /** Post-processors are chained in registration order (FIFO). */
  registerPostProcessor: (fn: PostProcessFn) => void;

  /**
   * Store plugin-specific data that persists for the life of the instance.
   *
   * @example
   * ```typescript
   * i18n.setPluginData('fetchLoader', { cdnUniqueId, projectId });
   * ```
   */
  setPluginData: (key: string, data: unknown) => void;

  /** @returns The stored data, or `undefined` when the key was never set. */
  getPluginData: <T = unknown>(key: string) => T | undefined;
}

/**
 * Lifecycle, namespace inspection and instance identity: public members of the
 * base class that the declarative `I18nInstance` contract does not list.
 *
 * They live here rather than in `I18nCoreInstance` because `I18nInstance` is
 * recomposed from that interface and must keep an exactly unchanged member set.
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
 * Structurally EXACTLY what `class I18n` declares it implements, so a bare
 * `@comvi/core` instance satisfies it with no capability attached.
 * Loader/plugin members are deliberately absent: wrappers acquire those through
 * their own capability hooks, which verify presence once and throw
 * {@link missingCapability} when the host has none.
 */
export type WrapperI18nHost<D extends DefaultTranslationParams = {}> = I18nCoreInstance<D> &
  I18nCoreExtraApi;

/**
 * The instance surface a plugin may rely on. A plugin that calls loader APIs on
 * a base host needs `attachLoader` to have run first.
 */
export type I18nPluginHost<D extends DefaultTranslationParams = {}> = I18nCoreInstance<D> &
  I18nCoreExtraApi &
  I18nLoaderApi &
  I18nPluginHostApi;

/**
 * A COMPOSED host's shape. Only `reloadTranslations`, `setPluginData` and
 * `getPluginData` of the capability APIs belong to it, so they are re-picked
 * one by one — inheriting the whole capability interfaces would silently widen
 * this exported type.
 *
 * A base `@comvi/core` host satisfies `I18nCoreInstance`, NOT this: it becomes
 * assignable only once the loader and plugin capabilities are composed on.
 */
export interface I18nInstance<D extends DefaultTranslationParams = {}>
  extends
    I18nCoreInstance<D>,
    Pick<I18nLoaderApi, "reloadTranslations">,
    Pick<I18nPluginHostApi, "setPluginData" | "getPluginData"> {}
