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
  devtools,
  flattenCatalog,
  icuCompiler,
  loader,
  plugins,
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

// ---------------------------------------------------------------------------
// (v) `.with(installer)` — the composition pipe and the configured installers
//     (framework-slim DX-2). The claim: the generic host type flows THROUGH
//     the pipe and comes out widened, never decayed to `any`.
// ---------------------------------------------------------------------------

// The target DX, with the import map spelled inline (this package's type-test
// program has no JSON fixture; react/vue pin the `import("./uk.json")` form).
const piped = createI18n({ locale: "en", compiler: icuCompiler }).with(
  loader({ uk: async () => ({ default: { greeting: "Привіт" } }) }),
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
