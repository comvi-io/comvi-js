import type { VirtualNode } from "./virtualNode";
import type { MessageCompiler, MissingParamMode, SyntaxExtension } from "./core/translate/syntax";
import type { MessagesCache as MessagesCacheClass } from "./core/MessagesCache";
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
  | "messagesCleared"
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
  messagesCleared: { locale?: string; namespace?: string };
  loadingStateChanged: { isLoading: boolean; isInitializing: boolean };
  namespaceLoaded: { namespace: string; locale: string };
  missingKey: { key: string; locale: string; namespace: string };
  loadError: { locale: string; namespace: string; error: Error };
  configChanged: {
    source:
      | "fallbackLocale"
      | "messagesAdded"
      | "namespaceActivated"
      | "namespaceDeactivated"
      | "defaultParams";
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

/**
 * Params for a bare key with an explicit `ns`: `t("dashboard", { ns: "admin" })`.
 *
 * Public vocabulary, kept for the apps and generated files that name it. The
 * call signatures no longer route through it — {@link ArgsFor} computes the
 * same tuple from the key alone, which is what lets there be ONE signature.
 */
export type NamespacedParamsArg<
  NS extends string,
  K extends string,
  D extends DefaultTranslationParams = {},
> =
  NamespacedKeyParams<NS, K> extends never
    ? [params: { ns: NS } & TranslationParams]
    : [params: { ns: NS } & CallParams<NamespacedKeyParams<NS, K>, D>];

/** @internal Registry entries written with a `"ns:key"` prefix. */
type QualifiedKeys = Extract<keyof TranslationKeys, `${string}:${string}`>;

/**
 * Every key `t()` accepts, as ONE union: the default namespace's keys, the
 * bare keys of the namespace in scope, and — while `TranslationKeys` is empty
 * — any `string`, because `PermissiveKey` widens the whole union.
 *
 * One union in one call signature is what makes a typo report TS2345 naming
 * the known keys, instead of TS2769 followed by the failure of every overload.
 *
 * "In scope" is TWO things, and `N` is why a bare key of another namespace
 * reports the key rather than the arity. A bare key is valid only alongside
 * the namespace that declares it — `useI18n("admin")` supplies it, and so does
 * an explicit `{ ns: "shop" }`. `NS` is the bound one, known from the call
 * site's type; `N` is the one the params name, INFERRED from `{ ns }` at the
 * call site (see {@link ArgsFor}, whose explicit-namespace branch puts `N` in
 * an inference position). So `useI18n("admin").t("checkout")` sees a union
 * WITHOUT `checkout` and is rejected on the key, naming admin's keys, while
 * `t("checkout", { ns: "shop" })` sees one with it and compiles. Admitting
 * every namespace's bare keys unconditionally is what made the first of those
 * report "Expected 2 arguments, but got 1" — true, but it points at the
 * params when the reader's mistake was the key.
 *
 * Every call signature spells the union out as `{ [P in AcceptedKey<NS, N>]: P
 * }[AcceptedKey<NS, N>]` rather than naming this type, and the indirection is
 * load-bearing: a diagnostic prints the type ALIAS a constraint was written
 * with, so `AcceptedKey` in the constraint makes TypeScript say "not
 * assignable to parameter of type 'AcceptedKey'", which names nothing.
 * Indexing a mapped type rebuilds the union and drops the alias, so the real
 * keys are what a reader sees. It only works written inline — naming the
 * expansion re-hides it — which is why the idiom is repeated at each
 * signature instead of being factored out.
 *
 * @typeParam NS - The namespace a wrapper's `useI18n(ns)` bound, or `undefined`.
 * @typeParam N - The namespace the call's own `{ ns }` names, inferred.
 */
export type AcceptedKey<NS extends string | undefined = undefined, N extends Namespaces = never> =
  | PermissiveKey
  | DefaultNsKeys
  | NamespacedKeys<NS & string>
  | NamespacedKeys<N>;

/**
 * @internal The key union as a call signature must SPELL it, not name it.
 *
 * Two separate mechanics meet here. The `{ [P in …]: P }[…]` rebuild strips
 * the type alias so a diagnostic prints real keys (see {@link AcceptedKey}),
 * and it only works inline. But the rebuild cannot contain `N`: `N` is
 * unresolved while a SIGNATURE is compared to another signature — the `I18n`
 * class against `I18nCoreInstance`, a host against `AnyI18nHost` — and a
 * mapped type over an unresolved parameter does not reduce, so neither side
 * relates and the class stops implementing its own interface.
 *
 * So the N-free part goes through the rebuild (and prints), and
 * `NamespacedKeys<N>` is unioned OUTSIDE it (and stays an alias, which costs
 * nothing: `N` is `never` in every diagnostic that matters, and `never`
 * vanishes from a union).
 */
/**
 * The keys the CORE surface accepts: everything a wrapper accepts, plus the
 * fully-qualified `"ns:key"` spelling. A wrapper's `t` takes only
 * {@link AcceptedKey}.
 *
 * The `null` no-op is NOT part of it. `null` lives on the `I18n` CLASS alone,
 * which is where it always has, and it has to stay off this interface: `null`
 * is assignable to `string` in NEITHER direction, so a `null` in the key union
 * stops `WrapperI18nHost` satisfying the plain `(key: string, …)` shapes the
 * wrappers' internals pass it to — solid's `<T>` hands the host to
 * `prepareTranslation`, and that broke the moment `null` reached the interface.
 */
export type AcceptedCoreKey<N extends Namespaces = never> =
  | AcceptedKey<undefined, N>
  | QualifiedKeys;

/**
 * @internal The qualified key a bound namespace makes a BARE key mean:
 * `useI18n("admin")` turns `t("dashboard")` into `"admin:dashboard"`.
 */
type BoundKeyOf<K, NS extends string | undefined> = [K] extends [string]
  ? NS extends Namespaces
    ? `${NS}:${K}` extends keyof TranslationKeys
      ? `${NS}:${K}`
      : never
    : never
  : never;

/**
 * @internal WHICH of the four ways a key is reachable applies. Deliberately
 * free of `D`.
 *
 * The route has to be decided without the default-params type, because the
 * host is compared bivariantly across different `D`s (see {@link AnyI18nHost}):
 * with `D` inside the `extends` checks, `ArgsFor<K, NS, {}>` and `ArgsFor<K,
 * NS, D>` have different check types, TypeScript can relate neither direction,
 * and passing a `createI18n({ defaultParams })` instance to a provider stops
 * compiling. Keep `D` in the RESULT only.
 *
 * The order costs one thing, named here rather than left to be discovered: a
 * key the DEFAULT namespace and another namespace both declare takes the
 * "default" route, so `t("greeting", { ns: "shop" })` types its params from
 * the default `greeting` while resolving `shop:greeting` at runtime. Routing
 * on the key alone is what keeps the dispatch free of `D`, and the two
 * schemas agreeing is the app's job.
 */
type KeyRoute<K, NS extends string | undefined> = [K] extends [never]
  ? // `t(key as never, params)` is the documented escape hatch for a key that
    // is a RUNTIME string — every wrapper's `<T>` uses it, because a component
    // prop cannot be a literal type. Without this branch `never` distributes
    // to `never`, the params slot becomes uninhabited, and each of those call
    // sites fails.
    "loose"
  : K extends null | undefined
    ? "loose"
    : K extends string
      ? [BoundKeyOf<K, NS>] extends [never]
        ? K extends DefaultNsKeys
          ? "default"
          : K extends QualifiedKeys
            ? "qualified"
            : "explicit-ns"
        : "bound"
      : "loose";

/**
 * @internal One key, one argument list — and deliberately NOT a union of them.
 *
 * When several same-length tuples are unioned, TypeScript stops reporting a
 * forgotten params object as TS2554 "Expected 2 arguments, but got 1" and
 * instead prints `Argument of type '[]' is not assignable to …` followed by
 * every constituent. One tuple per key keeps the arity message.
 *
 * The precedence in {@link KeyRoute} is deliberate too: the namespace
 * `useI18n(ns)` bound wins, because that is the namespace the call site is
 * written in; then the key's own spelling (a bare default-namespace key, or the
 * qualified `"ns:key"` form); then the bare key of some other namespace, which
 * has to name that namespace in `ns`.
 */
/**
 * @internal True when `K` is a union of more than one member.
 *
 * A union key has to fall back to loose params, and the reason is the ERROR
 * path. When the key argument violates its constraint, TypeScript instantiates
 * `K` to that constraint — a union of every accepted key — and re-checks the
 * call. If the argument list for a union built a union of tuples, the minimum
 * arity would come from the strictest constituent, TypeScript would report
 * "Expected 2 arguments, but got 1" FIRST (arity is checked before argument
 * assignability), and the unknown key would never be mentioned. Loose params
 * on a union keep the arity satisfied so the KEY error is what surfaces.
 *
 * A genuine union key from user code — `t(cond ? "a" : "b", …)` — therefore
 * gets loose params too, and that accepts MORE than the overload set did: at
 * 48cf293 a union key fell through to the permissive overload and reported
 * "not assignable to parameter of type 'null'", so
 * `t(cond ? "greeting" : "farewell")` was REJECTED and now compiles with the
 * required params dropped.
 *
 * The trade is deliberate, and it is a trade rather than an oversight.
 * Checking a union key needs the arms' params intersected, which puts a second
 * `{ ns }` inference site on the sibling branch; `N` then falls back to its
 * constraint and `t("dashboard", { ns: "shop" })` stops being checked against
 * `shop`'s keys — measured, and a silent wrong-namespace accept is worse than
 * an unchecked union key. Recorded in docs/design/limitations.md.
 */
type IsUnion<T, U = T> = T extends U ? ([U] extends [T] ? false : true) : false;

type ArgsForKey<
  K,
  NS extends string | undefined,
  D extends DefaultTranslationParams,
  N extends Namespaces,
> =
  IsUnion<K> extends true
    ? [params?: TranslationParams]
    : KeyRoute<K, NS> extends "bound"
      ? ParamsArg<BoundKeyOf<K, NS> & keyof TranslationKeys, D>
      : KeyRoute<K, NS> extends "default"
        ? ParamsArg<K & DefaultNsKeys & keyof TranslationKeys, D>
        : KeyRoute<K, NS> extends "qualified"
          ? ParamsArg<K & QualifiedKeys & keyof TranslationKeys, D>
          : KeyRoute<K, NS> extends "explicit-ns"
            ? ExplicitNsArgs<K, D, N>
            : [params?: TranslationParams];

/**
 * @internal A bare namespaced key, which has to name its namespace in `ns`.
 *
 * `{ ns: N }` with `N` naked is the INFERENCE SITE that lets
 * {@link AcceptedKey} know which namespace the call site meant. TypeScript
 * resolves {@link KeyRoute} from the key alone, reaches this branch, and infers
 * `N` from the params — which is then what widens the key union, so the two
 * halves of the call agree. A runtime `ns` infers `string`, and the params fall
 * back to loose, exactly as the old `NamespacedParamsArg` did.
 */
type ExplicitNsArgs<K, D extends DefaultTranslationParams, N extends Namespaces> = [K] extends [
  string,
]
  ? [
      params: { ns: N } & ([NamespacedKeyParams<N, K>] extends [never]
        ? TranslationParams
        : CallParams<NamespacedKeyParams<N, K>, D>),
    ]
  : never;

/**
 * The argument list that follows `key`, dispatched on the key itself — the
 * half of {@link TranslateFn} that used to be three overloads.
 *
 * With `TranslationKeys` empty every key is permissive and params stay loose,
 * which is the untyped-project path and must not change.
 *
 * @typeParam K - The key literal the call site passed.
 * @typeParam NS - The namespace a wrapper's `useI18n(ns)` bound, or `undefined`.
 * @typeParam D - Instance-level default interpolation params.
 * @typeParam N - The namespace this call's `{ ns }` names; INFERRED from the
 *   params, and fed back into {@link AcceptedKey} so a bare key and the
 *   namespace that declares it are checked together.
 */
export type ArgsFor<
  K extends string | null,
  NS extends string | undefined = undefined,
  D extends DefaultTranslationParams = {},
  N extends Namespaces = never,
> = [PermissiveKey] extends [never] ? ArgsForKey<K, NS, D, N> : [params?: TranslationParams];

/**
 * The canonical call signature shared by every framework wrapper's `t` /
 * `tRaw`.
 *
 * ONE signature on purpose. Three overloads made every wrong call report
 * TS2769 "No overload matches this call" followed by the failure of each
 * overload, burying the one useful line; with a single signature TypeScript
 * reports the actual problem — an unknown key, a missing argument, a missing
 * property — on the first line. {@link AcceptedKey} is the key union and
 * {@link ArgsFor} dispatches the params on the key.
 *
 * @typeParam D - Instance-level default interpolation params.
 * @typeParam R - `string` for `t`, `TranslationResult` for `tRaw`.
 */
export interface TranslateFn<D extends DefaultTranslationParams = {}, R = string> {
  <
    K extends { [P in AcceptedKey]: P }[AcceptedKey] | NamespacedKeys<N>,
    N extends Namespaces = never,
  >(
    key: K,
    ...params: ArgsFor<K, undefined, D, N>
  ): R;
}

/**
 * Params for a BARE key under a bound namespace: `useI18n("admin").t("dashboard")`
 * types its params as `"admin:dashboard"`'s. Loose when the pair is not a
 * generated key.
 *
 * Public vocabulary, kept for the apps that name it. The call signatures no
 * longer route through it — {@link ArgsFor} computes the same tuple from the
 * key and the bound namespace, which is what lets there be ONE signature.
 */
export type NamespaceBoundParamsArg<
  NS extends string,
  K extends string,
  D extends DefaultTranslationParams = {},
> = `${NS}:${K}` extends keyof TranslationKeys
  ? ParamsArg<`${NS}:${K}` & keyof TranslationKeys, D>
  : [params?: TranslationParams];

/**
 * The `t` / `tRaw` a wrapper's `useI18n(ns)` returns: {@link TranslateFn} with
 * the bound namespace threaded into the params dispatch, so
 * `useI18n("admin").t("dashboard")` types its params as `"admin:dashboard"`'s
 * and `t("checkout")` from another namespace needs its `{ ns: "shop" }`. With
 * `NS` `undefined` (no namespace bound) or a namespace the registry does not
 * know, it behaves as {@link TranslateFn}.
 *
 * ONE call signature, not `TranslateFn` INTERSECTED with a bound one: an
 * intersection of two callables is an overload set by another name, and it
 * re-created the whole TS2769 problem this type exists to avoid.
 *
 * Every wrapper narrows through this ONE type, so the four cannot drift.
 *
 * @typeParam NS - The namespace the call site bound, or `undefined`.
 * @typeParam D - Instance-level default interpolation params.
 * @typeParam R - `string` for `t`, `TranslationResult` for `tRaw`.
 */
export interface NamespaceBoundTranslateFn<
  NS extends string | undefined,
  D extends DefaultTranslationParams = {},
  R = string,
> {
  <
    K extends { [P in AcceptedKey<NS>]: P }[AcceptedKey<NS>] | NamespacedKeys<N>,
    N extends Namespaces = never,
  >(
    key: K,
    ...params: ArgsFor<K, NS, D, N>
  ): R;
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
   * to enable ICU plural/select/selectordinal for every catalog this
   * instance ingests, wherever the catalog comes from.
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
   *
   * LOADING is the loader capability's job, so on a host without it this
   * option has nothing to do and `init()` says so in development.
   */
  ns?: string[];
  /**
   * Inline catalogs, keyed by `locale` or `"locale:namespace"`. Nested objects
   * (`{ nav: { home: "Home" } }`) and flat dotted keys (`{ "nav.home": "Home" }`)
   * are the same catalog: every host flattens on ingestion.
   */
  messages?: Record<string, Record<string, TranslationValue>>;
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
   * `devtools({ exposeGlobal })` or call `attachDevtools`. Passing it without
   * that capability does nothing, and `init()` says so in development.
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
    /**
     * A request-scoped host failed to tear down at the end of its request —
     * `@comvi/nuxt`'s per-request Nitro host. The response is already written
     * when this fires, so the error has nowhere else to go.
     */
    | "request-cleanup"
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
 * `never` params (so params are optional). Use `comvi typegen` for full
 * parameter typing.
 */
export type InferKeys<
  T extends Record<string, unknown>,
  NS extends string | undefined = undefined,
  DefaultNS extends string | undefined = undefined,
> = {
  [K in FlattenKeys<T> as AddPrefix<K, NS, DefaultNS>]: never;
};

export type TranslationValue = string | { [key: string]: TranslationValue };

export type FlattenedMessages = Record<string, string>;

export type MessagesCache = MessagesCacheClass;

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

  get messagesCache(): MessagesCache;

  get isLoading(): boolean;

  /** True only for the duration of `init()`. */
  get isInitializing(): boolean;

  /** True once `init()` has completed successfully. */
  get isInitialized(): boolean;

  hasLocale: (locale: string, namespace?: string) => boolean;

  addMessages: (translations: Record<string, Record<string, TranslationValue>>) => void;

  getMessages: (locale?: string, namespace?: string) => FlattenedMessages;

  /**
   * Clear CONTENT. An omitted `locale` or `namespace` clears all of them.
   *
   * No form of this call changes which namespaces are ACTIVE — deactivation is
   * `removeActiveNamespace()` on the loader capability.
   */
  clearMessages: (locale?: string, namespace?: string) => void;

  /**
   * Translate a key in the current locale. ONE call signature, so a wrong call
   * reports the actual problem on its first line: {@link AcceptedKey} is the
   * union of every key the registry knows and {@link ArgsFor} dispatches the
   * params on the key that was passed.
   *
   * A key of the default namespace is written bare. A key of another namespace
   * is written bare with its `ns`, or fully qualified — `t('admin:dashboard')`
   * and `t('dashboard', { ns: 'admin' })` are the same lookup. `null` is the
   * documented no-op and returns `""`.
   *
   * @example
   * ```typescript
   * t('common.welcome', { name: 'Alice' }); // ✅ Typed params
   * t('common.greeting'); // ✅ The key declares none
   * t('dashboard', { ns: 'admin' }); // ✅ Autocomplete drops the prefix
   * t('unknown.key'); // ❌ TS2345, naming the known keys
   *
   * // Dynamic keys require a type assertion
   * t(`errors.${code}` as keyof TranslationKeys);
   * ```
   */
  t<
    K extends { [P in AcceptedCoreKey]: P }[AcceptedCoreKey] | NamespacedKeys<N>,
    N extends Namespaces = never,
  >(
    key: K,
    ...params: ArgsFor<K, undefined, D, N>
  ): string;

  /** The rich-text half of {@link I18nCoreInstance.t}, keyed identically. */
  tRaw<
    K extends { [P in AcceptedCoreKey]: P }[AcceptedCoreKey] | NamespacedKeys<N>,
    N extends Namespaces = never,
  >(
    key: K,
    ...params: ArgsFor<K, undefined, D, N>
  ): TranslationResult;

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
 * `.use(attachLoader)` / `.use(loader(map))`. Absent from the base root by module
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
  reloadMessages: (locale?: string, namespace?: string) => Promise<void>;

  /**
   * Activate a namespace and load it for the current locale.
   *
   * Activation only matters when something loads namespaces, so it belongs to
   * the loader capability. Base hosts activate implicitly — `addMessages`
   * self-activates the namespaces it carries.
   */
  addActiveNamespace: (namespace: string) => Promise<void>;

  /** Activate several namespaces and load them for the current locale. */
  addActiveNamespaces: (namespaces: string[]) => Promise<void>;

  /**
   * Deactivate a namespace: a locale switch stops fetching it, a reload fetches
   * only what is still active, and whatever load is in flight for it is
   * cancelled. The one exception is a reload with NOTHING active left, which
   * falls back to the default namespace — see `removeActiveNamespace` on
   * `@comvi/core/loader`.
   *
   * Synchronous, and the mirror image of `addActiveNamespace` — it is INTENT
   * only. The catalog already in the cache stays there and keeps resolving;
   * `clearMessages(undefined, namespace)` is what drops the content.
   */
  removeActiveNamespace: (namespace: string) => void;

  /** Deactivate several namespaces and cancel their in-flight loads. */
  removeActiveNamespaces: (namespaces: string[]) => void;

  /**
   * Subscribe to load failures. Lives here because only the loader capability
   * can emit `loadError`.
   * @returns Cleanup function that removes the callback.
   */
  onLoadError: (callback: (locale: string, namespace: string, error: Error) => void) => () => void;
}

/**
 * Plugin-host capability — `@comvi/core/plugins`, composed on with
 * `.use(plugins())` / `attachPlugins`. Absent from the base root by module
 * graph. Constructor *options* (`postProcess`, `onMissingKey`) stay universal;
 * only the runtime registration APIs are a capability.
 */
export interface I18nPluginHostApi {
  /**
   * Register a raw plugin. Chainable. MUST be called before `init()`, which is
   * the only thing that drains the queue: a plugin registered afterwards does
   * not run now, the next `init()` drains it together with every plugin already
   * queued, and the cleanups of both drains accumulate. NOT a composition
   * verb — `.use(definePlugin(fn))` is how an app registers its own inline
   * plugin through the one verb.
   */
  registerPlugin(plugin: I18nPlugin, options?: PluginOptions): this;

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
  setLocale: (value: string) => Promise<void>;

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
 * A host with ANY default-params type — what a wrapper's provider / context
 * setter accepts.
 *
 * `I18nCoreInstance` declares `setDefaultParams` as a PROPERTY rather than a
 * method, so `strictFunctionTypes` checks its parameter contravariantly and
 * the host is INVARIANT in `D`: an instance from `createI18n({ defaultParams })`
 * was not assignable to `WrapperI18nHost<{}>` at all, so it could not be
 * passed in.
 *
 * Making the boundary generic over `D` does NOT fix it. Every `D` position in
 * the host is either a conditional type (`SetDefaultParamsArg<D>`,
 * `ParamsArg<K, D>`) or a bivariant method, so `D` has no inference site: it
 * silently falls back to the constraint and the call fails just the same.
 *
 * Widening the two members that carry the invariance is what actually works.
 * `setDefaultParams` is the source; `init()` re-imports it by returning the
 * host recursively. Every other `D` occurrence is a method (bivariant) or a
 * return type (covariant), so nothing else has to move.
 *
 * Both are widened with METHOD syntax and `any` rather than `never` /
 * `unknown` on purpose: methods are bivariant, so the result stays assignable
 * to `WrapperI18nHost<{}>` in BOTH directions. Everything downstream that
 * expects the plain host keeps compiling, and no wrapper needs an internal
 * cast.
 *
 * Declared ONCE here: react, solid and svelte re-export it as a type.
 */
export type AnyI18nHost = Omit<WrapperI18nHost, "setDefaultParams" | "init"> & {
  setDefaultParams(params: any): void;
  init(): Promise<any>;
};

/**
 * The instance surface a plugin may rely on. A plugin that calls loader APIs on
 * a base host needs `attachLoader` to have run first.
 */
export type I18nPluginHost<D extends DefaultTranslationParams = {}> = I18nCoreInstance<D> &
  I18nCoreExtraApi &
  I18nLoaderApi &
  I18nPluginHostApi;

/**
 * A COMPOSED host's shape. Only `reloadMessages`, `setPluginData` and
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
    Pick<I18nLoaderApi, "reloadMessages">,
    Pick<I18nPluginHostApi, "setPluginData" | "getPluginData"> {}
