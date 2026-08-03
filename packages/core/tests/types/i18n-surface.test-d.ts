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
  WrapperI18nHost,
  I18nPlugin,
  PluginOptions,
  LoaderFn,
  TranslationValue,
} from "@comvi/core";
import { createI18n, I18n } from "@comvi/core";
import { loader, type LoaderImportMap } from "@comvi/core/loader";
import { icuCompiler } from "@comvi/core/icu";
import { plugins } from "@comvi/core/plugins";

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
// Deliberate C1/C2 update: `addActiveNamespace(s)` and `onLoadError` moved
// out of `I18nCoreExtraApi` into the loader capability. `I18nInstance` never
// listed them, so `PreSplitKeySnapshot` above is untouched.
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

// Composed-surface exactness: these are the shapes a framework binding sees
// once the capabilities are composed on, so interface-merge resolution
// drifting here would slip past the wrapper zero-diff gate. Since the
// single-entry convergence they are derived from the COMPOSED host, because
// the base root deliberately has neither member.
type ComposedHost = I18nPluginHost & I18nLoaderApi & I18nCoreInstance;
export type _RegisterLoaderArg = Expect<
  Equal<Parameters<ComposedHost["registerLoader"]>[0], LoaderFn>
>;
export type _UseOptionsArg = Expect<
  Equal<Parameters<ComposedHost["use"]>[1], PluginOptions | undefined>
>;
// The published import-map shape survives as `@comvi/next`'s composed host and
// as the configured installer's argument (`next-contract.test-d.ts` pins the
// two-overload form; here it is the installer's).
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

// ── WrapperI18nHost: the framework-slim P1 wrapper contract ───────────────
//
// The alias must stay EXACTLY the pair of interfaces `class I18n` declares it
// implements (`core/i18n.ts`: `implements I18nCoreInstance<D>, I18nCoreExtraApi`).
// If a member is ever added to the class outside those two interfaces, or a
// capability leaks into either of them, this pin fails before any wrapper
// retypes against a host that bare slim cannot satisfy.
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

// A ROOT instance is a wrapper host (Principle 5: root stays first-class).
const rootAsHost: WrapperI18nHost = createI18n({ locale: "en" });
void rootAsHost;

// @ts-expect-error — the host type does not carry loader members
rootAsHost.reloadTranslations();

// ── the published one-argument facade (P0.4 candidate C4n, A11) ────────────
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
