// The host type `C` is exact exactly where the factory result is held, and
// NOWHERE else: through `inject` a component sees a capability-free
// `WrapperI18nHost`, so a capability call there is a compile error rather than
// a typed-then-crashes path.
import type { I18n, I18nLoaderApi, I18nPluginHostApi, WrapperI18nHost } from "../../src/index";
import { createI18n as createCore } from "@comvi/core";
import {
  attachLoader,
  attachPlugins,
  createI18n,
  createI18nFromCore,
  devtools,
  I18N_INJECTION_KEY,
  plugins,
} from "../../src/index";
import { inject } from "vue";
import type { VueI18n } from "../../src/VueI18n";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const baseCore = createCore({ locale: "en" });
const loaderHost = attachLoader(createCore({ locale: "en" }));
const composedHost = attachPlugins(attachLoader(createCore({ locale: "en" })));

// The INJECTED instance's core is not an `I18n`: capability members are absent
// from its type, so they cannot be called through the inject path.
const injected = inject(I18N_INJECTION_KEY)!;

type InjectedCore = (typeof injected)["core"];
type _InjectedCoreIsHostTyped = Expect<Equal<InjectedCore, WrapperI18nHost>>;
type _InjectedCoreIsNotTheClass = Expect<Equal<InjectedCore extends I18n ? true : false, false>>;

// @ts-expect-error — loader capability is absent from the injected core's type
injected.core.reloadTranslations();
// @ts-expect-error — plugin-host capability is absent from the injected core's type
injected.core.onMissingKey(() => undefined);
// @ts-expect-error — the eight dropped proxies are gone from the instance too
injected.registerLoader(() => Promise.resolve({}));
// @ts-expect-error — `use` dropped in 0.5.0 (P6); register through `core.use`
injected.use(() => undefined);

injected.core.addTranslations({ en: { greeting: "Hello" } });
void injected.t("greeting");

// The FACTORY RESULT preserves the exact host type `C`.
const fromComposed = createI18nFromCore(composedHost);
type _ComposedCoreIsExact = Expect<Equal<(typeof fromComposed)["core"], typeof composedHost>>;
type _ComposedInstanceIsExact = Expect<
  Equal<typeof fromComposed, VueI18n<{}, typeof composedHost>>
>;

// …so the capabilities the app composed ARE callable on the factory result.
const fromLoader = createI18nFromCore(loaderHost);
type _LoaderCoreHasLoaderApi = Expect<
  Equal<(typeof fromLoader)["core"] extends I18nLoaderApi ? true : false, true>
>;
type _LoaderCoreHasNoPluginApi = Expect<
  Equal<(typeof fromLoader)["core"] extends I18nPluginHostApi ? true : false, false>
>;
void fromLoader.core.reloadTranslations();
// @ts-expect-error — this host was composed WITHOUT the plugin capability
fromLoader.core.registerPostProcessor((result) => result);

const fromBase = createI18nFromCore(baseCore);
type _BaseCoreIsExact = Expect<Equal<(typeof fromBase)["core"], typeof baseCore>>;
// @ts-expect-error — a base host has no loader capability, at any level
fromBase.core.reloadTranslations();

// The preset path is capability-free too: its core is core's BASE `I18n`, the
// same class `createCore` builds. Compose what the app needs with `.use(…)`
// on the wrapper, which widens `core` on the instance the app holds.
const fromPreset = createI18n({ locale: "en" });
type _PresetCoreIsBase = Expect<Equal<(typeof fromPreset)["core"], I18n<{}>>>;
// @ts-expect-error — 0.4's root shipped the loader; the converged preset does not
fromPreset.core.registerLoader(() => Promise.resolve({}));
// …and one `.use(attachLoader)` on that same host buys it back, exactly typed.
void fromPreset.core.use(attachLoader).registerLoader(() => Promise.resolve({}));

// The WRAPPER pipe: `createI18n(options).use(installer)` is the same instance
// with `core` widened by the installer's return type, one capability per call.
const chained = createI18n({ locale: "en" }).use(attachLoader).use(plugins());
type _ChainedIsWrapper = Expect<
  Equal<typeof chained, VueI18n<{}, I18n<{}> & I18nLoaderApi & I18nPluginHostApi>>
>;
void chained.core.reloadTranslations();
void chained.core.onMissingKey(() => undefined);
void chained.core.registerPlugin(() => undefined);
void chained.t("greeting");

// Each step widens exactly by what it composed and nothing more.
const withLoaderOnly = createI18n({ locale: "en" }).use(attachLoader);
type _WithLoaderOnlyCore = Expect<Equal<(typeof withLoaderOnly)["core"], I18n<{}> & I18nLoaderApi>>;
void withLoaderOnly.core.addActiveNamespace("admin");
// @ts-expect-error — the plugin host was not composed on this chain
withLoaderOnly.core.onMissingKey(() => undefined);
// @ts-expect-error — an identity installer widens nothing: the core stays what it was
withLoaderOnly.use(devtools()).core.onMissingKey(() => undefined);

// `D` survives the pipe: the default-params generic is the wrapper's, not the installer's.
const unchainedParams = createI18n({ locale: "en", defaultParams: { brand: "Comvi" } });
const typedParams = unchainedParams.use(attachLoader);
type _DSurvives = Expect<
  Equal<(typeof typedParams)["core"], (typeof unchainedParams)["core"] & I18nLoaderApi>
>;
void typedParams.core.reloadTranslations();

// The pipe works on a `createI18nFromCore` wrapper as well, widening from its exact `C`.
const fromBaseChained = createI18nFromCore(baseCore).use(attachLoader);
type _FromBaseChainedCore = Expect<
  Equal<(typeof fromBaseChained)["core"], I18n<{}> & I18nLoaderApi>
>;
void fromBaseChained.core.reloadTranslations();

// `devtools()` is THE identity installer: it widens nothing, so the core keeps
// its exact type.
const withDevtools = createI18n({ locale: "en" }).use(devtools());
type _DevtoolsWidensNothing = Expect<Equal<(typeof withDevtools)["core"], I18n<{}>>>;
void withDevtools.t("greeting");

// A plugin package's installer has the `fetchLoader` / `cdnLoader` shape —
// `<T extends I18n<any>>(i18n: T) => T & I18nLoaderApi & I18nPluginHostApi` —
// and composes through the wrapper pipe with both capabilities typed on `core`.
declare const pluginInstaller: <T extends I18n<any>>(
  i18n: T,
) => T & I18nLoaderApi & I18nPluginHostApi;
const withPlugin = createI18n({ locale: "en" }).use(pluginInstaller);
type _PluginInstallerCore = Expect<
  Equal<(typeof withPlugin)["core"], I18n<{}> & I18nLoaderApi & I18nPluginHostApi>
>;
void withPlugin.core.reloadTranslations();
void withPlugin.core.registerPlugin(() => undefined);

// …but NOT through the inject path: the injected core is a bare
// `WrapperI18nHost`, which no installer accepts, so composing from inside a
// component is a compile error rather than a runtime surprise.
// @ts-expect-error — installers take an `I18n`; the injected core is host-typed
injected.use(attachLoader);

// The instance never regains the dropped proxies, whatever `C` is — including
// `use`, the last typed-present-may-throw member the class had. Probed on
// every `C` shape the factories produce.
// @ts-expect-error — dropped in 0.5.0; use `i18n.core.reloadTranslations()`
fromComposed.reloadTranslations();
// @ts-expect-error — an installer must return a host; use `i18n.core.registerPlugin(...)`
fromComposed.use(() => undefined);
// @ts-expect-error — dropped in 0.5.0 even on the one-call preset's wrapper
fromPreset.use(() => undefined);
// @ts-expect-error — dropped in 0.5.0; a base `C` has no `core.use` either
fromBase.use(() => undefined);

// The migrated shape compiles wherever the host really has the capability.
void fromComposed.core.registerPlugin(() => undefined);
// @ts-expect-error — …and does NOT where it does not: the preset host is base
fromPreset.core.registerPlugin(() => undefined);
