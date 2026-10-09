// Companion to factory-boundary.test-d.ts, which covers the inject boundary
// and the dropped proxies. Three claims: vue's preset builds a BASE host
// (`VueI18n<D, I18n<D>>` over core's own class, so capability members are
// absent from the TYPE); the exact-`C` custom-host path (core's `createI18n` +
// `createI18nFromCore`) preserves whatever the app composed; and the type
// vocabulary and toolkit are core's own — a wrapper that re-declared them
// would hand an app types that drift from the runtime it composes against.
import type {
  I18n,
  I18nLoaderApi,
  I18nPluginApi,
  VueI18n,
  WrapperI18nInstance,
} from "../../src/index";
import { createI18n as createCore } from "@comvi/core";
import { attachPlugins } from "@comvi/core/plugins";
import { attachDevtools } from "@comvi/core/devtools";
import { acquireLoaderApi } from "@comvi/core/loader";
import { acquirePluginsApi } from "@comvi/core/plugins";
import { useI18nLoader, useI18nPlugins } from "../../src/index";
import type { UseI18nLoaderReturn, UseI18nPluginsReturn } from "../../src/index";
import {
  attachLoader,
  createI18n,
  createI18nFromCore,
  definePlugin,
  devtools,
  icuCompiler,
  loader,
  plugins,
} from "../../src/index";
import * as rootEntry from "../../src/index";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// The preset returns a VueI18n over the BASE core, exactly typed.
const preset = createI18n({ locale: "en", ssrLocale: "en" });

export type _PresetIsVueI18nOverBase = Expect<Equal<typeof preset, VueI18n<{}, I18n<{}>>>>;
export type _PresetCoreIsBase = Expect<Equal<(typeof preset)["core"], I18n<{}>>>;
export type _PresetCoreIsAInstance = Expect<
  Equal<(typeof preset)["core"] extends WrapperI18nInstance ? true : false, true>
>;
export type _PresetCoreHasNoLoaderApi = Expect<
  Equal<(typeof preset)["core"] extends I18nLoaderApi ? true : false, false>
>;
export type _PresetCoreHasNoPluginApi = Expect<
  Equal<(typeof preset)["core"] extends I18nPluginApi ? true : false, false>
>;

// @ts-expect-error -- the preset host has no loader capability, in types or at runtime
preset.core.reloadMessages();
// @ts-expect-error -- ...and none of the plugin host either
preset.core.onMissingKey(() => undefined);
// @ts-expect-error -- the eight dropped proxies stay dropped on the preset path
preset.registerLoader(() => Promise.resolve({}));
// @ts-expect-error -- `use` left the class in 0.5.0 and does not come back here
preset.use(() => undefined);

preset.core.addMessages({ en: { greeting: "Hello" } });

// The class behind `createCore` is the one the preset builds on: core
// publishes ONE host and both construction paths reach it.
const _coreProbe = createCore({ locale: "en" });
export type _CreateCoreBuildsThePresetsClass = Expect<
  Equal<typeof _coreProbe, (typeof preset)["core"]>
>;

// ICU has ONE shape: the `compiler` option, which travels through vue's preset
// to the host it builds and never changes the wrapper's type.
const _withIcu = createI18n({ locale: "en", compiler: icuCompiler });
export type _IcuPresetIsStillBase = Expect<Equal<typeof _withIcu, VueI18n<{}, I18n<{}>>>>;

// The same option on a host built with `createCore`.
const _icuCore = createCore({ locale: "en", compiler: icuCompiler });
export type _IcuCoreIsStillBase = Expect<Equal<typeof _icuCore, I18n<{}>>>;

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

// `const D` inference survives the entry hop.
const _withDefaults = createI18n({ locale: "en", defaultParams: { brand: "Comvi" } });
export type _DefaultsAreExact = Expect<
  Equal<
    typeof _withDefaults,
    VueI18n<{ readonly brand: "Comvi" }, I18n<{ readonly brand: "Comvi" }>>
  >
>;

// The custom-host path: `createCore` is core's own constructor and
// `createI18nFromCore` preserves the composed type.
const _bareCore = createCore({ locale: "en" });
export type _CreateCoreIsBaseI18n = Expect<Equal<typeof _bareCore, I18n<{}>>>;

const loaderHost = attachLoader(createCore({ locale: "en" }));
const fromLoader = createI18nFromCore(loaderHost);
export type _ComposedCoreIsExact = Expect<Equal<(typeof fromLoader)["core"], typeof loaderHost>>;
export type _ComposedCoreHasLoaderApi = Expect<
  Equal<(typeof fromLoader)["core"] extends I18nLoaderApi ? true : false, true>
>;
export type _ComposedCoreHasNoPluginApi = Expect<
  Equal<(typeof fromLoader)["core"] extends I18nPluginApi ? true : false, false>
>;
void fromLoader.core.registerLoader(() => Promise.resolve({}));
// @ts-expect-error -- attachLoader composes ONLY the loader capability
fromLoader.core.registerPostProcessor((result) => result);

const _pluginInstance = attachPlugins(createCore({ locale: "en" }));
export type _PluginsWiden = Expect<
  Equal<typeof _pluginInstance extends I18nPluginApi ? true : false, true>
>;

const _withDevtools = attachDevtools(createCore({ locale: "en" }), { exposeGlobal: false });
export type _DevtoolsKeepsInstanceType = Expect<Equal<typeof _withDevtools, I18n<{}>>>;

// Nested catalogs are BASE behaviour, so this root no longer re-exports
// `flattenCatalog` — it lives on the `@comvi/core` root alone (C1).
// @ts-expect-error -- flattenCatalog is not part of this entry
void (rootEntry.flattenCatalog as unknown);
createCore({ locale: "en", messages: { en: { nav: { home: "Home" } } } });

// `.use(installer)`: the generic host type flows THROUGH the pipe and comes
// out widened, never decayed to `any`. Against a real `./uk.json`, so the
// dynamic-import thunk is typed the way an app's is.
const piped = createCore({ locale: "en", compiler: icuCompiler }).use(
  loader({ uk: () => import("./uk.json") }),
);
export type _PipedIsWidened = Expect<
  Equal<typeof piped extends I18nLoaderApi ? true : false, true>
>;
export type _PipedIsStillTheInstance = Expect<Equal<typeof piped, I18n<{}> & I18nLoaderApi>>;
void piped.registerLoader(() => Promise.resolve({}));
// @ts-expect-error -- loader(map) composes ONLY the loader capability
piped.registerPlugin(() => undefined);

// The preset's own host takes the pipe too, at `i18n.core` — vue's factory
// returns a wrapper rather than the host itself.
const _presetPiped = createI18n({ locale: "en" }).core.use(attachLoader);
export type _PresetInstanceTakesThePipe = Expect<
  Equal<typeof _presetPiped, I18n<{}> & I18nLoaderApi>
>;

// Chaining compounds the widenings.
const _both = createCore({ locale: "en" }).use(attachLoader).use(plugins());
export type _ChainCompounds = Expect<
  Equal<typeof _both extends I18nLoaderApi & I18nPluginApi ? true : false, true>
>;
void _both.registerPlugin(() => undefined).registerLoader(() => Promise.resolve({}));

// The DECAY PROBE: a declared default-param set must survive the pipe. If the
// host collapsed to `any`, `Equal<…>` would resolve against `any` and fail.
const _pipedDefaults = createCore({ locale: "en", defaultParams: { brand: "Comvi" } }).use(
  attachLoader,
);
export type _PipeKeepsExactDefaults = Expect<
  Equal<typeof _pipedDefaults, I18n<{ readonly brand: "Comvi" }> & I18nLoaderApi>
>;

// devtools() adds no public members, so the host type is unchanged.
const _pipedDevtools = createCore({ locale: "en" }).use(devtools({ exposeGlobal: false }));
export type _DevtoolsPipeKeepsInstanceType = Expect<Equal<typeof _pipedDevtools, I18n<{}>>>;

// The low-level attaches are installers too — the factories only add config.
void createCore({ locale: "en" })
  .use(attachLoader)
  .registerLoader(() => Promise.resolve({}));
void createCore({ locale: "en" })
  .use(attachPlugins)
  .registerPlugin(() => undefined);
void createCore({ locale: "en" }).use(attachDevtools).addMessages({ en: {} });

// @ts-expect-error -- the factory is not an installer; it must be called
createCore({ locale: "en" }).use(loader);
// @ts-expect-error -- an import map's values must be import functions
createCore({ locale: "en" }).use(loader({ uk: "./uk.json" }));

// `definePlugin(fn)` — the root's re-export of the inline-plugin installer.
// Pinned here so a root that dropped it fails the type gate rather than only
// the runtime surface test. `plugins()` attaches the plugin HOST;
// `definePlugin(fn)` registers ONE plugin on it, and both flow through `.use`.
const _withDefinedPlugin = createCore({ locale: "en" }).use(definePlugin(() => {}));
export type _DefinePluginWidensToThePluginInstance = Expect<
  Equal<typeof _withDefinedPlugin extends I18nPluginApi ? true : false, true>
>;
void _withDefinedPlugin.registerPlugin(() => {});
// @ts-expect-error -- definePlugin takes a PLUGIN, not an installer
createCore({ locale: "en" }).use(definePlugin(attachLoader));

// P5: `I18n` is a TYPE-only export from a binding root. `createI18n(o)` and
// `new I18n(o)` build the same object, so the class VALUE is `@comvi/core`'s.
// @ts-expect-error -- `I18n` only refers to a type from this root
void rootEntry.I18n;
export type _I18nTypeStillReachable = I18n<{}>;

// P6: no `createCore` alias either — the escape-hatch host is built with
// `createI18n` from `@comvi/core` directly.
// @ts-expect-error -- `createCore` is not exported from `@comvi/vue`
void rootEntry.createCore;

// Q7 — `useI18nLoader()` / `useI18nPlugins()` return CORE's acquired surfaces,
// not a re-declared copy. The four bindings used to own a byte-identical copy
// of the acquisition and one of them drifted; the return types are now the same
// declarations `acquireLoaderApi` / `acquirePluginsApi` produce, so a re-typed
// local bag fails here rather than in a release.
export type _LoaderHookReturnsCoresBag = Expect<
  Equal<ReturnType<typeof useI18nLoader>, ReturnType<typeof acquireLoaderApi>>
>;
export type _PluginsHookReturnsCoresBag = Expect<
  Equal<ReturnType<typeof useI18nPlugins>, ReturnType<typeof acquirePluginsApi>>
>;
export type _PublicLoaderAliasIsCores = Expect<
  Equal<UseI18nLoaderReturn, ReturnType<typeof acquireLoaderApi>>
>;
export type _PublicPluginsAliasIsCores = Expect<
  Equal<UseI18nPluginsReturn, ReturnType<typeof acquirePluginsApi>>
>;
