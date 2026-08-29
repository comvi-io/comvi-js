// Type-level contract for the capability split: `I18nInstance` is
// `I18nCoreInstance` + `I18nLoaderApi` + `I18nPluginHostApi` recomposed with an
// exact-member Pick. These tests prove the recomposition neither widened nor
// narrowed the root-exported surface, and that the class overloads the
// framework wrappers derive their public types from are unchanged.
import type {
  I18nInstance,
  I18nCoreInstance,
  I18nCoreExtraApi,
  I18nLoaderApi,
  I18nPluginHostApi,
  I18nPluginHost,
  WrapperI18nHost,
  I18nPlugin,
  PluginOptions,
  LoaderFn,
  TranslationValue,
} from "@comvi/core";
import { createI18n, I18n, TranslationCache } from "@comvi/core";
import { loader, type LoaderImportMap } from "@comvi/core/loader";
import { icuCompiler } from "@comvi/core/icu";
import { plugins } from "@comvi/core/plugins";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

/**
 * The `keyof I18nInstance` snapshot from before the split. NEVER regenerate it
 * from the source type — it exists precisely to be independent of it.
 */
type PreSplitKeySnapshot =
  | "locale"
  | "apiKey"
  | "collectContext"
  | "devMode"
  | "translationCache"
  | "isLoading"
  | "isInitializing"
  | "isInitialized"
  | "hasLocale"
  | "addTranslations"
  | "getTranslations"
  | "clearTranslations"
  | "reloadTranslations"
  | "t"
  | "tRaw"
  | "hasTranslation"
  | "setFallbackLocale"
  | "setDefaultParams"
  | "defaultParams"
  | "configRevision"
  | "setDefaultNamespace"
  | "on"
  | "setPluginData"
  | "getPluginData"
  | "reportError";

export type _ExactKeysDefault = Expect<Equal<keyof I18nInstance, PreSplitKeySnapshot>>;
export type _ExactKeysAny = Expect<Equal<keyof I18nInstance<any>, PreSplitKeySnapshot>>;

// The capability interfaces carry exactly the extracted members, and the base
// interface carries none of them. `addActiveNamespace(s)` and `onLoadError`
// deliberately moved into the loader capability; `I18nInstance` never listed
// them, so the snapshot above is untouched.
export type _LoaderApiKeys = Expect<
  Equal<
    keyof I18nLoaderApi,
    | "registerLoader"
    | "getLoader"
    | "reloadTranslations"
    | "addActiveNamespace"
    | "addActiveNamespaces"
    | "onLoadError"
  >
>;
export type _PluginApiKeys = Expect<
  Equal<
    keyof I18nPluginHostApi,
    | "use"
    | "registerLocaleDetector"
    | "getLanguageDetector"
    | "onMissingKey"
    | "registerPostProcessor"
    | "setPluginData"
    | "getPluginData"
  >
>;
export type _CoreHasNoCapabilities = Expect<
  Equal<Extract<keyof I18nCoreInstance, keyof I18nLoaderApi | keyof I18nPluginHostApi>, never>
>;

// The shapes a framework binding sees once the capabilities are composed on:
// interface-merge resolution drifting here would slip past the wrapper
// zero-diff gate. Derived from the COMPOSED host, because the base root
// deliberately has neither member.
type ComposedHost = I18nPluginHost & I18nLoaderApi & I18nCoreInstance;
export type _RegisterLoaderArg = Expect<
  Equal<Parameters<ComposedHost["registerLoader"]>[0], LoaderFn>
>;
export type _UseOptionsArg = Expect<
  Equal<Parameters<ComposedHost["use"]>[1], PluginOptions | undefined>
>;
// The published import-map shape survives as `@comvi/next`'s composed host and
// as the configured installer's argument — pinned here for the installer.
export type _LoaderInstallerArg = Expect<
  Equal<Parameters<typeof loader>[0], LoaderImportMap | undefined>
>;

// The BASE root is assignable to the core surface, and to the full instance
// interface only once both capabilities are composed on.
const baseInstance: I18nCoreInstance = createI18n({ locale: "en" });
void baseInstance;
const composedInstance: I18nInstance = createI18n({ locale: "en" }).with(loader()).with(plugins());
void composedInstance;
// @ts-expect-error — the base root lacks the loader/plugin members
const notAnInstance: I18nInstance = createI18n({ locale: "en" });
void notAnInstance;

// A fetch-loader-shaped plugin (the real `@comvi/plugin-fetch-loader` shape:
// `setPluginData` + `registerLoader` through the host param) compiles against
// the composed `I18nPluginHost`.
const fetchLoaderShaped: I18nPlugin = (i18n) => {
  i18n.setPluginData("fetchLoader", { cdnUniqueId: "abc", projectId: 1 });
  const cfg = i18n.getPluginData<{ cdnUniqueId: string }>("fetchLoader");
  i18n.registerLoader(async (locale, namespace) => {
    const res = await fetch(`https://cdn.example/${cfg?.cdnUniqueId}/${locale}/${namespace}.json`);
    return (await res.json()) as Record<string, TranslationValue>;
  });
  i18n.onMissingKey((key) => `missing:${key}`);
  return () => void i18n.reloadTranslations();
};
void fetchLoaderShaped;

// The host alias really is the composed full surface.
export type _HostIsComposed = Expect<
  Equal<I18nPluginHost, I18nCoreInstance & I18nCoreExtraApi & I18nLoaderApi & I18nPluginHostApi>
>;

// The wrapper host alias must stay EXACTLY the pair of interfaces `class I18n`
// declares it implements. If a member is added to the class outside those two,
// or a capability leaks into either, this pin fails before any wrapper retypes
// against a host a bare instance cannot satisfy.
export type _WrapperHostIsWhatI18nImplements = Expect<
  Equal<WrapperI18nHost, I18nCoreInstance & I18nCoreExtraApi>
>;
export type _WrapperHostIsWhatI18nImplementsGeneric = Expect<
  Equal<WrapperI18nHost<{ brand: string }>, I18nCoreInstance<{ brand: string }> & I18nCoreExtraApi>
>;

// Type honesty by absence: no loader/plugin member is reachable on the host.
export type _WrapperHostHasNoCapabilities = Expect<
  Equal<Extract<keyof WrapperI18nHost, keyof I18nLoaderApi | keyof I18nPluginHostApi>, never>
>;

// The plugin host is exactly the wrapper host plus both capabilities.
export type _PluginHostExtendsWrapperHost = Expect<
  Equal<I18nPluginHost, WrapperI18nHost & I18nLoaderApi & I18nPluginHostApi>
>;

// A ROOT instance is a wrapper host — the root stays first-class.
const rootAsHost: WrapperI18nHost = createI18n({ locale: "en" });
void rootAsHost;

// @ts-expect-error — the host type does not carry loader members
rootAsHost.reloadTranslations();

// The published one-argument facade.
//
// The runtime binding IS the base class, whose constructor takes an internal
// second `compiler` parameter. The published `I18n` is annotated with a
// NARROWED construct signature, so that parameter is unreachable — and
// unwritable — from the package surface. `compiler` is instead a documented
// constructor OPTION on `I18nOptions`.
const facadeInstance = new I18n({ locale: "en" });
void facadeInstance;

export type _FacadeTakesExactlyOneArgument = Expect<
  Equal<ConstructorParameters<typeof I18n>["length"], 1>
>;

// @ts-expect-error — zero arguments: `options.locale` is required
new I18n();
// @ts-expect-error — the internal compiler parameter is not part of the surface
new I18n({ locale: "en" }, icuCompiler);

// The option form is how a caller chooses a compiler.
const icuByOption: I18n = new I18n({ locale: "en", compiler: icuCompiler });
void icuByOption;

// `getInternalMap()` hands back a ReadonlyMap: the runtime suite pins the
// contents, and only the type level can pin that callers may not write to it.
const internalMap = new TranslationCache().getInternalMap();
void internalMap.get("en:default");
// @ts-expect-error — the snapshot is readonly at the type level
internalMap.set("en:default", { hello: "Hello" });
// @ts-expect-error — the snapshot is readonly at the type level
internalMap.delete("en:default");
