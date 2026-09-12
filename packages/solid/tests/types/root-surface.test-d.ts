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
  attachLoader,
  createI18n,
  definePlugin,
  devtools,
  icuCompiler,
  loader,
  plugins,
} from "../../src/index";
import { attachPlugins } from "@comvi/core/plugins";
import { attachDevtools } from "@comvi/core/devtools";
import * as rootEntry from "../../src/index";

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

// ICU has ONE shape: the compiler option. It never changes the host type,
// because it configures the host rather than widening it.
const _withIcu = createI18n({ locale: "en", compiler: icuCompiler });
export type _IcuHostIsStillBase = Expect<Equal<typeof _withIcu, I18n<{}>>>;

// …and there is no installer beside it: `icu` is gone from the entry.
export type _NoIcuInstaller = Expect<
  Equal<"icu" extends keyof typeof import("../../src") ? true : false, false>
>;

// P4: the low-level `attach*` pair for plugins/devtools is gone from this
// root — `plugins()`/`devtools()` are the configured installers here, and the
// advanced pair lives on `@comvi/core/plugins` / `@comvi/core/devtools`.
export type _NoAttachPluginsExport = Expect<
  Equal<"attachPlugins" extends keyof typeof import("../../src") ? true : false, false>
>;
export type _NoAttachDevtoolsExport = Expect<
  Equal<"attachDevtools" extends keyof typeof import("../../src") ? true : false, false>
>;

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
void _withPlugins.registerPlugin(() => undefined);

const _withDevtools = attachDevtools(createI18n({ locale: "en" }), { exposeGlobal: false });
export type _DevtoolsKeepsHostType = Expect<Equal<typeof _withDevtools, I18n<{}>>>;

// Nested catalogs are BASE behaviour, so this root no longer re-exports
// `flattenCatalog` — it lives on the `@comvi/core` root alone (C1).
// @ts-expect-error -- flattenCatalog is not part of this entry
void (rootEntry.flattenCatalog as unknown);
createI18n({ locale: "en", translation: { en: { nav: { home: "Home" } } } });

// `.use(installer)`: the generic host type flows THROUGH the pipe and comes
// out widened, never decayed to `any`. The import map is spelled inline here —
// this package's type-test program has no JSON fixture, so react/vue are where
// the `import("./uk.json")` form is pinned.
const piped = createI18n({ locale: "en", compiler: icuCompiler }).use(
  loader({ uk: async () => ({ default: { greeting: "Привіт" } }) }),
);
export type _PipedIsWidened = Expect<
  Equal<typeof piped extends I18nLoaderApi ? true : false, true>
>;
export type _PipedIsStillTheHost = Expect<Equal<typeof piped, I18n<{}> & I18nLoaderApi>>;
void piped.registerLoader(() => Promise.resolve({}));
// @ts-expect-error -- loader() composes ONLY the loader capability
piped.registerPlugin(() => undefined);

// Chaining compounds the widenings.
const _both = createI18n({ locale: "en" }).use(loader()).use(plugins());
export type _ChainCompounds = Expect<
  Equal<typeof _both extends I18nLoaderApi & I18nPluginHostApi ? true : false, true>
>;
void _both.registerPlugin(() => undefined).registerLoader(() => Promise.resolve({}));

// The DECAY PROBE: a declared default-param set must survive the pipe. If the
// host collapsed to `any`, `Equal<…>` would resolve against `any` and fail.
const _pipedDefaults = createI18n({ locale: "en", defaultParams: { brand: "Comvi" } }).use(
  loader(),
);
export type _PipeKeepsExactDefaults = Expect<
  Equal<typeof _pipedDefaults, I18n<{ readonly brand: "Comvi" }> & I18nLoaderApi>
>;

// devtools() adds no public members, so the host type is unchanged.
const _pipedDevtools = createI18n({ locale: "en" }).use(devtools({ exposeGlobal: false }));
export type _DevtoolsPipeKeepsHostType = Expect<Equal<typeof _pipedDevtools, I18n<{}>>>;

// The low-level attaches are installers too — the factories only add config.
void createI18n({ locale: "en" })
  .use(attachLoader)
  .registerLoader(() => Promise.resolve({}));
void createI18n({ locale: "en" })
  .use(attachPlugins)
  .registerPlugin(() => undefined);
void createI18n({ locale: "en" }).use(attachDevtools).addTranslations({ en: {} });

// @ts-expect-error -- the factory is not an installer; it must be called
createI18n({ locale: "en" }).use(loader);
// @ts-expect-error -- an import map's values must be import functions
createI18n({ locale: "en" }).use(loader({ uk: "./uk.json" }));

// `definePlugin(fn)` — the root's re-export of the inline-plugin installer.
// Pinned here so a root that dropped it fails the type gate rather than only
// the runtime surface test. `plugins()` attaches the plugin HOST;
// `definePlugin(fn)` registers ONE plugin on it, and both flow through `.use`.
const _withDefinedPlugin = createI18n({ locale: "en" }).use(definePlugin(() => {}));
export type _DefinePluginWidensToThePluginHost = Expect<
  Equal<typeof _withDefinedPlugin extends I18nPluginHostApi ? true : false, true>
>;
void _withDefinedPlugin.registerPlugin(() => {});
// @ts-expect-error -- definePlugin takes a PLUGIN, not an installer
createI18n({ locale: "en" }).use(definePlugin(attachLoader));

// P5: `I18n` is a TYPE-only export from a binding root. `createI18n(o)` and
// `new I18n(o)` build the same object, so the class VALUE is `@comvi/core`'s.
// @ts-expect-error -- `I18n` only refers to a type from this root
void rootEntry.I18n;
export type _I18nTypeStillReachable = I18n<{}>;
