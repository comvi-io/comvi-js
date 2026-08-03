// Type-level contract for the `@comvi/solid/slim` SINGLE-PACKAGE surface
// (framework-slim DX pass).
//
// Two claims are under test. First, the preset really builds a BARE slim host:
// the capability members are absent from its TYPE, so the §2.4 "type-honest by
// absence" rule survives the convenience. Second, the entry's type vocabulary
// and the capability toolkit are core's own — a wrapper that re-declared them
// would hand an app types that drift from the runtime it composes against.
//
// Every specifier below is the wrapper's slim entry. That is the point: an app
// gets its whole type vocabulary without naming `@comvi/core`.
import type {
  DefaultTranslationParams,
  I18n,
  I18nLoaderApi,
  I18nPluginHostApi,
  WrapperI18nHost,
} from "../../src/slim";
import {
  attachDevtools,
  attachLoader,
  attachPlugins,
  createI18n,
  flattenCatalog,
  icuCompiler,
} from "../../src/slim";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// ---------------------------------------------------------------------------
// (i) The preset builds a BARE slim host — the same type core-slim returns.
// ---------------------------------------------------------------------------

const bare = createI18n({ locale: "en" });

export type _BareIsSlimI18n = Expect<Equal<typeof bare, I18n<{}>>>;
export type _BareIsAHost = Expect<Equal<typeof bare extends WrapperI18nHost ? true : false, true>>;
export type _BareHasNoLoaderApi = Expect<
  Equal<typeof bare extends I18nLoaderApi ? true : false, false>
>;
export type _BareHasNoPluginApi = Expect<
  Equal<typeof bare extends I18nPluginHostApi ? true : false, false>
>;

// @ts-expect-error -- the preset host has no loader capability, in types or at runtime
bare.reloadTranslations();
// @ts-expect-error -- ...and none of the plugin host either
bare.onMissingKey(() => undefined);

// The core-safe surface is of course there.
bare.addTranslations({ en: { greeting: "Hello" } });

// ---------------------------------------------------------------------------
// (ii) ICU is injectable through the re-exported compiler, in the same call.
// ---------------------------------------------------------------------------

const _withIcu = createI18n({ locale: "en", compiler: icuCompiler });
export type _IcuHostIsStillSlim = Expect<Equal<typeof _withIcu, I18n<{}>>>;

// ---------------------------------------------------------------------------
// (iii) `const D` inference survives the entry hop: a declared default-param
//       set stays exact, so `setDefaultParams` keeps its narrow signature.
// ---------------------------------------------------------------------------

const _withDefaults = createI18n({ locale: "en", defaultParams: { brand: "Comvi" } });
export type _DefaultsAreExact = Expect<
  Equal<typeof _withDefaults, I18n<{ readonly brand: "Comvi" }>>
>;
export type _DefaultsSatisfyTheConstraint = Expect<
  Equal<{ readonly brand: "Comvi" } extends DefaultTranslationParams ? true : false, true>
>;

// ---------------------------------------------------------------------------
// (iv) The toolkit re-exports carry core's own widening types.
// ---------------------------------------------------------------------------

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

// The pure flattener needs no host at all.
const flat: Record<string, string> = flattenCatalog({ nav: { home: "Home" } });
void flat;
