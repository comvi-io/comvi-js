// Two claims. First, the entry's factory builds a BASE host: the capability
// members are absent from its TYPE, so "type-honest by absence" survives the
// convenience. Second, the type vocabulary and the capability toolkit are
// core's own — a wrapper that re-declared them would hand an app types that
// drift from the runtime it composes against.
import type {
  DefaultTranslationParams,
  I18n,
  I18nLoaderApi,
  I18nPluginHostApi,
  I18nProviderProps,
  WrapperI18nHost,
} from "../../src/index";
import {
  attachDevtools,
  attachLoader,
  attachPlugins,
  createI18n,
  devtools,
  flattenCatalog,
  icu,
  icuCompiler,
  loader,
  plugins,
} from "../../src/index";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// The entry's factory builds a BASE host — core's own root host type.

const bare = createI18n({ locale: "en" });

export type _BareIsBaseI18n = Expect<Equal<typeof bare, I18n<{}>>>;
export type _BareIsAHost = Expect<Equal<typeof bare extends WrapperI18nHost ? true : false, true>>;
export type _BareHasNoLoaderApi = Expect<
  Equal<typeof bare extends I18nLoaderApi ? true : false, false>
>;
export type _BareHasNoPluginApi = Expect<
  Equal<typeof bare extends I18nPluginHostApi ? true : false, false>
>;

// @ts-expect-error -- the base host has no loader capability, in types or at runtime
bare.reloadTranslations();
// @ts-expect-error -- ...and none of the plugin host either
bare.onMissingKey(() => undefined);

bare.addTranslations({ en: { greeting: "Hello" } });

// ICU has TWO shapes, both named by this entry: the compiler for an inline
// constructor catalog, the installer for a pre-ingestion pipe.

const _withIcu = createI18n({ locale: "en", compiler: icuCompiler });
export type _IcuHostIsStillBase = Expect<Equal<typeof _withIcu, I18n<{}>>>;

// `.with(icu())` composes a compiler, never a capability: the host type is
// unchanged, and the default argument makes the call site argument-free.
const _withIcuInstaller = createI18n({ locale: "en" }).with(icu());
export type _IcuInstallerKeepsHostType = Expect<Equal<typeof _withIcuInstaller, I18n<{}>>>;
const _withIcuCustom = createI18n({ locale: "en" }).with(icu(icuCompiler));
export type _IcuInstallerTakesACompiler = Expect<Equal<typeof _withIcuCustom, I18n<{}>>>;

// @ts-expect-error -- `icu` is the installer FACTORY; the pipe wants its result
createI18n({ locale: "en" }).with(icu);

// The host the entry builds is the host its provider accepts: one entry, one
// `WrapperI18nHost`, no cross-entry structural drift.

export type _BaseHostFitsTheProvider = Expect<
  Equal<typeof bare extends I18nProviderProps["i18n"] ? true : false, true>
>;

// `const D` inference survives the entry hop: a declared default-param set
// stays exact, so `setDefaultParams` keeps its narrow signature.

const _withDefaults = createI18n({ locale: "en", defaultParams: { brand: "Comvi" } });
export type _DefaultsAreExact = Expect<
  Equal<typeof _withDefaults, I18n<{ readonly brand: "Comvi" }>>
>;
export type _DefaultsSatisfyTheConstraint = Expect<
  Equal<{ readonly brand: "Comvi" } extends DefaultTranslationParams ? true : false, true>
>;

// The toolkit re-exports carry core's own widening types.

const withLoader = attachLoader(createI18n({ locale: "en" }));
export type _LoaderWidens = Expect<
  Equal<typeof withLoader extends I18nLoaderApi ? true : false, true>
>;
export type _LoaderDoesNotWidenPlugins = Expect<
  Equal<typeof withLoader extends I18nPluginHostApi ? true : false, false>
>;
void withLoader.registerLoader(() => Promise.resolve({}));
// @ts-expect-error -- attachLoader composes ONLY the loader capability
withLoader.registerPostProcessor((result) => result);

const _withPlugins = attachPlugins(createI18n({ locale: "en" }));
export type _PluginsWiden = Expect<
  Equal<typeof _withPlugins extends I18nPluginHostApi ? true : false, true>
>;
void _withPlugins.use(() => undefined);

// Devtools installs discovery without changing the host type.
const _withDevtools = attachDevtools(createI18n({ locale: "en" }), { exposeGlobal: false });
export type _DevtoolsKeepsHostType = Expect<Equal<typeof _withDevtools, I18n<{}>>>;

const flat: Record<string, string> = flattenCatalog({ nav: { home: "Home" } });
void flat;

// `.with(installer)`: the generic host type flows THROUGH the pipe and comes
// out widened, never decayed to `any`. Against a real `./uk.json`, so the
// dynamic-import thunk is typed the way an app's is.
const piped = createI18n({ locale: "en", compiler: icuCompiler }).with(
  loader({ uk: () => import("./uk.json") }),
);
export type _PipedIsWidened = Expect<
  Equal<typeof piped extends I18nLoaderApi ? true : false, true>
>;
export type _PipedIsStillTheHost = Expect<Equal<typeof piped, I18n<{}> & I18nLoaderApi>>;
void piped.registerLoader(() => Promise.resolve({}));
// @ts-expect-error -- loader() composes ONLY the loader capability
piped.use(() => undefined);

// Chaining compounds the widenings.
const _both = createI18n({ locale: "en" }).with(loader()).with(plugins());
export type _ChainCompounds = Expect<
  Equal<typeof _both extends I18nLoaderApi & I18nPluginHostApi ? true : false, true>
>;
void _both.use(() => undefined).registerLoader(() => Promise.resolve({}));

// The DECAY PROBE: a declared default-param set must survive the pipe. If the
// host collapsed to `any`, `Equal<…>` would resolve against `any` and fail.
const _pipedDefaults = createI18n({ locale: "en", defaultParams: { brand: "Comvi" } }).with(
  loader(),
);
export type _PipeKeepsExactDefaults = Expect<
  Equal<typeof _pipedDefaults, I18n<{ readonly brand: "Comvi" }> & I18nLoaderApi>
>;

// devtools() adds no public members, so the host type is unchanged.
const _pipedDevtools = createI18n({ locale: "en" }).with(devtools({ exposeGlobal: false }));
export type _DevtoolsPipeKeepsHostType = Expect<Equal<typeof _pipedDevtools, I18n<{}>>>;

// The low-level attaches are installers too — the factories only add config.
void createI18n({ locale: "en" })
  .with(attachLoader)
  .registerLoader(() => Promise.resolve({}));
void createI18n({ locale: "en" })
  .with(attachPlugins)
  .use(() => undefined);
void createI18n({ locale: "en" }).with(attachDevtools).addTranslations({ en: {} });

// @ts-expect-error -- the factory is not an installer; it must be called
createI18n({ locale: "en" }).with(loader);
// @ts-expect-error -- an import map's values must be import functions
createI18n({ locale: "en" }).with(loader({ uk: "./uk.json" }));
