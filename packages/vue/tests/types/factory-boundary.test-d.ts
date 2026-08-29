// Type-level contract for the vue factory boundary (framework-slim §3.2,
// "Vue inject-path type honesty" — the two tests named there).
//
// The claim under test is that the host type `C` is exact exactly where the
// factory result is held, and NOWHERE else: through `inject`, a component sees
// a capability-free `WrapperI18nHost`, so a capability call there is a compile
// error rather than a typed-then-crashes path.
import type { I18n, I18nLoaderApi, I18nPluginHostApi, WrapperI18nHost } from "../../src/index";
import {
  attachLoader,
  attachPlugins,
  createCore,
  createI18n,
  createI18nFromCore,
  I18N_INJECTION_KEY,
} from "../../src/index";
import { inject } from "vue";
import type { VueI18n } from "../../src/VueI18n";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const baseCore = createCore({ locale: "en" });
const loaderHost = attachLoader(createCore({ locale: "en" }));
const composedHost = attachPlugins(attachLoader(createCore({ locale: "en" })));

// ---------------------------------------------------------------------------
// (i) The INJECTED instance's core is not an `I18n`: capability members are
//     absent from its type, so they cannot be called through the inject path.
// ---------------------------------------------------------------------------

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

// The core-safe surface still resolves through the same path.
injected.core.addTranslations({ en: { greeting: "Hello" } });
void injected.t("greeting");

// ---------------------------------------------------------------------------
// (ii) The FACTORY RESULT preserves the exact host type `C`.
// ---------------------------------------------------------------------------

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

// A base host keeps its bare type: nothing is invented for it.
const fromBase = createI18nFromCore(baseCore);
type _BaseCoreIsExact = Expect<Equal<(typeof fromBase)["core"], typeof baseCore>>;
// @ts-expect-error — a base host has no loader capability, at any level
fromBase.core.reloadTranslations();

// Vue's own one-call factory keeps its 0.4.x CALL shape, and since the
// single-entry convergence its core is core's BASE `I18n` — the same class
// `createCore` builds. So the preset path is capability-free too: this is the
// deliberate published break, stated here as a compile error rather than as
// prose. Compose what the app needs on `i18n.core`, or build the host with
// `createCore` and hand it to `createI18nFromCore`.
const fromPreset = createI18n({ locale: "en" });
type _PresetCoreIsBase = Expect<Equal<(typeof fromPreset)["core"], I18n<{}>>>;
// @ts-expect-error — 0.4's root shipped the loader; the converged preset does not
fromPreset.core.registerLoader(() => Promise.resolve({}));
// …and one `.with(loader())` on that same host buys it back, exactly typed.
void fromPreset.core.with(attachLoader).registerLoader(() => Promise.resolve({}));

// The instance itself never regains the dropped proxies, whatever `C` is —
// including `use`, whose guarded proxy was the last typed-present-may-throw
// member on the class (§2.4). Probed on every `C` shape the factories produce.
// @ts-expect-error — dropped in 0.5.0; use `i18n.core.reloadTranslations()`
fromComposed.reloadTranslations();
// @ts-expect-error — dropped in 0.5.0; use `i18n.core.use(...)`
fromComposed.use(() => undefined);
// @ts-expect-error — dropped in 0.5.0 even on the one-call preset's wrapper
fromPreset.use(() => undefined);
// @ts-expect-error — dropped in 0.5.0; a base `C` has no `core.use` either
fromBase.use(() => undefined);

// The migrated shape compiles wherever the host really has the capability.
void fromComposed.core.use(() => undefined);
// @ts-expect-error — …and does NOT where it does not: the preset host is base
fromPreset.core.use(() => undefined);
