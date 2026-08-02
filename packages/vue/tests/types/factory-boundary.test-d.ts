// Type-level contract for the framework-slim vue factory boundary (plan §3.2,
// "Vue inject-path type honesty" — the two tests named there).
//
// The claim under test is that the host type `C` is exact exactly where the
// factory result is held, and NOWHERE else: through `inject`, a component sees
// a capability-free `WrapperI18nHost`, so a capability call there is a compile
// error rather than a typed-then-crashes path.
import type { I18n, I18nLoaderApi, I18nPluginHostApi, WrapperI18nHost } from "@comvi/core";
import { createI18n as createSlimI18n } from "@comvi/core/slim";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";
import { inject } from "vue";
import { createI18n } from "../../src/createI18n";
import { createI18nFromCore } from "../../src/createI18nFromCore";
import { I18N_INJECTION_KEY } from "../../src/keys";
import type { VueI18n } from "../../src/VueI18n";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

const slimCore = createSlimI18n({ locale: "en" });
const loaderHost = attachLoader(createSlimI18n({ locale: "en" }));
const composedHost = attachPlugins(attachLoader(createSlimI18n({ locale: "en" })));

// ---------------------------------------------------------------------------
// (i) The INJECTED instance's core is not an `I18n`: capability members are
//     absent from its type, so they cannot be called through the inject path.
// ---------------------------------------------------------------------------

const injected = inject(I18N_INJECTION_KEY)!;

type InjectedCore = (typeof injected)["core"];
type _InjectedCoreIsHostTyped = Expect<Equal<InjectedCore, WrapperI18nHost>>;
type _InjectedCoreIsNotRoot = Expect<Equal<InjectedCore extends I18n ? true : false, false>>;

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

// A bare slim host keeps its bare type: nothing is invented for it.
const fromBare = createI18nFromCore(slimCore);
type _BareCoreIsExact = Expect<Equal<(typeof fromBare)["core"], typeof slimCore>>;
// @ts-expect-error — bare slim has no loader capability, at any level
fromBare.core.reloadTranslations();

// The root factory keeps its 0.4.x shape and its full-capability core.
const fromRoot = createI18n({ locale: "en" });
type _RootCoreIsRoot = Expect<Equal<(typeof fromRoot)["core"], I18n<{}>>>;
void fromRoot.core.registerLoader(() => Promise.resolve({}));

// The instance itself never regains the dropped proxies, whatever `C` is —
// including `use`, whose guarded proxy was the last typed-present-may-throw
// member on the class (§2.4). Probed on every `C` shape the factories produce.
// @ts-expect-error — dropped in 0.5.0; use `i18n.core.reloadTranslations()`
fromComposed.reloadTranslations();
// @ts-expect-error — dropped in 0.5.0; use `i18n.core.use(...)`
fromComposed.use(() => undefined);
// @ts-expect-error — dropped in 0.5.0 even where `C` is the ROOT `I18n`
fromRoot.use(() => undefined);
// @ts-expect-error — dropped in 0.5.0; a bare slim `C` has no `core.use` either
fromBare.use(() => undefined);

// The migrated shape compiles wherever the host really has the capability.
void fromComposed.core.use(() => undefined);
void fromRoot.core.use(() => undefined);
