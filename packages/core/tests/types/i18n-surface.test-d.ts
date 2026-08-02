// Type-level contract for the Phase-7 capability split (acceptance A7).
//
// `I18nInstance` was split into `I18nCoreInstance` + `I18nLoaderApi` +
// `I18nPluginHostApi` and recomposed with an exact-member Pick. These tests
// are the proof that the recomposition did not widen (or narrow) the
// root-exported surface, and that the root class overloads the framework
// wrappers derive their public types from are unchanged.
import type {
  I18nInstance,
  I18nCoreInstance,
  I18nCoreExtraApi,
  I18nLoaderApi,
  I18nPluginHostApi,
  I18nPluginHost,
  I18nPlugin,
  PluginOptions,
  LoaderFn,
  TranslationValue,
} from "@comvi/core";
import { createI18n, I18n } from "@comvi/core";
import type { LoaderImportMap } from "@comvi/core/loader";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

/**
 * The `keyof I18nInstance` snapshot taken from the tree BEFORE the split
 * (`packages/core/src/types.ts` at commit cb1735a). Never regenerate this
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
// interface carries none of them.
export type _LoaderApiKeys = Expect<
  Equal<keyof I18nLoaderApi, "registerLoader" | "getLoader" | "reloadTranslations">
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

// Root-overload exactness: the wrappers derive public types from these
// (`VueI18n.ts` uses `Parameters<I18n["use"]>[1]`), so interface-merge
// resolution drifting here would slip past the wrapper zero-diff gate.
export type _RegisterLoaderArg = Expect<
  Equal<Parameters<I18n["registerLoader"]>[0], LoaderFn | LoaderImportMap>
>;
export type _UseOptionsArg = Expect<Equal<Parameters<I18n["use"]>[1], PluginOptions | undefined>>;

// The root instance stays assignable to the exported instance interface.
const rootInstance: I18nInstance = createI18n({ locale: "en" });
void rootInstance;

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
  Equal<
    I18nPluginHost,
    I18nCoreInstance & I18nCoreExtraApi & I18nLoaderApi & I18nPluginHostApi
  >
>;
