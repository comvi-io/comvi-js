// Type-level contract for the `@comvi/vue` SINGLE-ENTRY surface. Companion to
// factory-boundary.test-d.ts, which covers the inject boundary and the dropped
// proxies.
//
// Three claims are under test. First, vue's preset really builds a BASE host:
// `VueI18n<D, I18n<D>>` where `I18n` is core's own base class, so the capability
// members are absent from the TYPE and the §2.4 "type-honest by absence" rule
// survives the convenience. Second, the exact-`C` custom-host path
// (`createCore` + `createI18nFromCore`) still preserves whatever the app
// composed. Third, the entry's type vocabulary and the capability toolkit are
// core's own — a wrapper that re-declared them would hand an app types that
// drift from the runtime it composes against.
//
// Every specifier below is the wrapper's ONE entry. That is the point: an app
// gets its whole type vocabulary, its three constructors and its vue bindings
// without ever naming `@comvi/core`.
import type {
  I18n,
  I18nLoaderApi,
  I18nPluginHostApi,
  VueI18n,
  WrapperI18nHost,
} from "../../src/index";
import {
  attachDevtools,
  attachLoader,
  attachPlugins,
  createCore,
  createI18n,
  createI18nFromCore,
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

// ---------------------------------------------------------------------------
// (i) The preset returns a VueI18n over the BASE core, exactly typed.
// ---------------------------------------------------------------------------

const preset = createI18n({ locale: "en", ssrLocale: "en" });

export type _PresetIsVueI18nOverBase = Expect<Equal<typeof preset, VueI18n<{}, I18n<{}>>>>;
export type _PresetCoreIsBase = Expect<Equal<(typeof preset)["core"], I18n<{}>>>;
export type _PresetCoreIsAHost = Expect<
  Equal<(typeof preset)["core"] extends WrapperI18nHost ? true : false, true>
>;
export type _PresetCoreHasNoLoaderApi = Expect<
  Equal<(typeof preset)["core"] extends I18nLoaderApi ? true : false, false>
>;
export type _PresetCoreHasNoPluginApi = Expect<
  Equal<(typeof preset)["core"] extends I18nPluginHostApi ? true : false, false>
>;

// @ts-expect-error -- the preset host has no loader capability, in types or at runtime
preset.core.reloadTranslations();
// @ts-expect-error -- ...and none of the plugin host either
preset.core.onMissingKey(() => undefined);
// @ts-expect-error -- the eight dropped proxies stay dropped on the preset path
preset.registerLoader(() => Promise.resolve({}));
// @ts-expect-error -- `use` left the class in 0.5.0 and does not come back here
preset.use(() => undefined);

// The core-safe surface is of course there.
preset.core.addTranslations({ en: { greeting: "Hello" } });

// The class behind `createCore` is the one the preset builds on. Before the
// convergence this file also pinned "the preset's core is NOT the root class",
// distinguishing two entries that no longer exist: `@comvi/core` publishes ONE
// host and both construction paths reach it, so the distinction is gone with
// the second entry and the row that encoded it is deleted rather than inverted.
const _coreProbe = createCore({ locale: "en" });
export type _CreateCoreBuildsThePresetsClass = Expect<
  Equal<typeof _coreProbe, (typeof preset)["core"]>
>;

// ---------------------------------------------------------------------------
// (ii) ICU has TWO shapes and BOTH are named by this entry: the compiler for
//      an inline constructor catalog, the installer for a pre-ingestion pipe.
// ---------------------------------------------------------------------------

const _withIcu = createI18n({ locale: "en", compiler: icuCompiler });
export type _IcuPresetIsStillBase = Expect<Equal<typeof _withIcu, VueI18n<{}, I18n<{}>>>>;

// The installer goes on the CORE — vue's preset returns a wrapper, so the pipe
// lives at `i18n.core`, or on a host built with `createCore`.
const _icuInstalled = createCore({ locale: "en" }).with(icu());
export type _IcuInstallerKeepsHostType = Expect<Equal<typeof _icuInstalled, I18n<{}>>>;

// ---------------------------------------------------------------------------
// (iii) `const D` inference survives the entry hop.
// ---------------------------------------------------------------------------

const _withDefaults = createI18n({ locale: "en", defaultParams: { brand: "Comvi" } });
export type _DefaultsAreExact = Expect<
  Equal<
    typeof _withDefaults,
    VueI18n<{ readonly brand: "Comvi" }, I18n<{ readonly brand: "Comvi" }>>
  >
>;

// ---------------------------------------------------------------------------
// (iv) The custom-host path, from the same entry: createCore is core's own
//      constructor and `createI18nFromCore` preserves the composed type.
// ---------------------------------------------------------------------------

const _bareCore = createCore({ locale: "en" });
export type _CreateCoreIsBaseI18n = Expect<Equal<typeof _bareCore, I18n<{}>>>;

const loaderHost = attachLoader(createCore({ locale: "en" }));
const fromLoader = createI18nFromCore(loaderHost);
export type _ComposedCoreIsExact = Expect<Equal<(typeof fromLoader)["core"], typeof loaderHost>>;
export type _ComposedCoreHasLoaderApi = Expect<
  Equal<(typeof fromLoader)["core"] extends I18nLoaderApi ? true : false, true>
>;
export type _ComposedCoreHasNoPluginApi = Expect<
  Equal<(typeof fromLoader)["core"] extends I18nPluginHostApi ? true : false, false>
>;
void fromLoader.core.registerLoader(() => Promise.resolve({}));
// @ts-expect-error -- attachLoader composes ONLY the loader capability
fromLoader.core.registerPostProcessor((result) => result);

const _pluginHost = attachPlugins(createCore({ locale: "en" }));
export type _PluginsWiden = Expect<
  Equal<typeof _pluginHost extends I18nPluginHostApi ? true : false, true>
>;

// Devtools installs discovery without changing the host type.
const _withDevtools = attachDevtools(createCore({ locale: "en" }), { exposeGlobal: false });
export type _DevtoolsKeepsHostType = Expect<Equal<typeof _withDevtools, I18n<{}>>>;

// The pure flattener needs no host at all.
const flat: Record<string, string> = flattenCatalog({ nav: { home: "Home" } });
void flat;

// ---------------------------------------------------------------------------
// (v) `.with(installer)` — the composition pipe and the configured installers
//     (framework-slim DX-2). The claim: the generic host type flows THROUGH
//     the pipe and comes out widened, never decayed to `any`.
// ---------------------------------------------------------------------------

// The target DX, VERBATIM (README / MIGRATION §4 quickstart) on vue's core
// host, against a real `./uk.json` so the dynamic-import thunk is typed the
// way an app's is. `createCore` is core's constructor; `createI18n` here is
// vue's own preset, whose host is reachable as `i18n.core`.
const piped = createCore({ locale: "en", compiler: icuCompiler }).with(
  loader({ uk: () => import("./uk.json") }),
);
export type _PipedIsWidened = Expect<
  Equal<typeof piped extends I18nLoaderApi ? true : false, true>
>;
export type _PipedIsStillTheHost = Expect<Equal<typeof piped, I18n<{}> & I18nLoaderApi>>;
void piped.registerLoader(() => Promise.resolve({}));
// @ts-expect-error -- loader() composes ONLY the loader capability
piped.use(() => undefined);

// The preset's own host takes the pipe too — that is the one shape react has
// no counterpart for, because vue's factory returns a wrapper rather than the
// host itself.
const _presetPiped = createI18n({ locale: "en" }).core.with(loader());
export type _PresetHostTakesThePipe = Expect<Equal<typeof _presetPiped, I18n<{}> & I18nLoaderApi>>;

// Chaining compounds the widenings.
const _both = createCore({ locale: "en" }).with(loader()).with(plugins());
export type _ChainCompounds = Expect<
  Equal<typeof _both extends I18nLoaderApi & I18nPluginHostApi ? true : false, true>
>;
void _both.use(() => undefined).registerLoader(() => Promise.resolve({}));

// The DECAY PROBE: a declared default-param set must survive the pipe. If the
// host collapsed to `any`, `Equal<…>` would resolve against `any` and fail.
const _pipedDefaults = createCore({ locale: "en", defaultParams: { brand: "Comvi" } }).with(
  loader(),
);
export type _PipeKeepsExactDefaults = Expect<
  Equal<typeof _pipedDefaults, I18n<{ readonly brand: "Comvi" }> & I18nLoaderApi>
>;

// devtools() adds no public members, so the host type is unchanged.
const _pipedDevtools = createCore({ locale: "en" }).with(devtools({ exposeGlobal: false }));
export type _DevtoolsPipeKeepsHostType = Expect<Equal<typeof _pipedDevtools, I18n<{}>>>;

// The low-level attaches are installers too — the factories only add config.
void createCore({ locale: "en" })
  .with(attachLoader)
  .registerLoader(() => Promise.resolve({}));
void createCore({ locale: "en" })
  .with(attachPlugins)
  .use(() => undefined);
void createCore({ locale: "en" }).with(attachDevtools).addTranslations({ en: {} });

// @ts-expect-error -- the factory is not an installer; it must be called
createCore({ locale: "en" }).with(loader);
// @ts-expect-error -- an import map's values must be import functions
createCore({ locale: "en" }).with(loader({ uk: "./uk.json" }));
