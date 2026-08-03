// Type-level contract for the `@comvi/next/client` SINGLE-PACKAGE surface
// (framework-slim DX pass). Companion to server-host.test-d.ts.
//
// `@comvi/next/client` is the one entry in the wave that exports BOTH
// constructors: the published-0.4.x `createI18n` (root, full capability) and
// the new `createSlimI18n`. The claim under test is that the type system tells
// them apart — a client app that picks the slim one gets a host whose
// capability members are absent, and one that keeps the root one is unchanged.
import type { I18n as RootI18n, I18nLoaderApi, I18nPluginHostApi } from "@comvi/core";
import type { I18n as SlimI18n } from "@comvi/core/slim";
import {
  attachDevtools,
  attachLoader,
  attachPlugins,
  createI18n,
  createSlimI18n,
  devtools,
  flattenCatalog,
  icuCompiler,
  loader,
  plugins,
} from "../../src/client";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// ---------------------------------------------------------------------------
// (i) The two constructors are different types, not aliases.
// ---------------------------------------------------------------------------

const slim = createSlimI18n({ locale: "en" });
const root = createI18n({ locale: "en" });

export type _SlimIsSlimI18n = Expect<Equal<typeof slim, SlimI18n<{}>>>;
export type _RootIsRootI18n = Expect<Equal<typeof root, RootI18n<{}>>>;
export type _SlimIsNotRoot = Expect<Equal<typeof slim extends RootI18n ? true : false, false>>;
export type _SlimHasNoLoaderApi = Expect<
  Equal<typeof slim extends I18nLoaderApi ? true : false, false>
>;
export type _RootHasLoaderApi = Expect<
  Equal<typeof root extends I18nLoaderApi ? true : false, true>
>;
export type _RootHasPluginApi = Expect<
  Equal<typeof root extends I18nPluginHostApi ? true : false, true>
>;

// @ts-expect-error -- the client host has no loader capability; the server companion loads
slim.reloadTranslations();
// @ts-expect-error -- ...and none of the plugin host either
slim.onMissingKey(() => undefined);

// The hydration path a client actually uses.
slim.addTranslations({ "en:default": { greeting: "Hello" } });

// The root constructor is untouched by this release.
void root.registerLoader(() => Promise.resolve({}));

// ---------------------------------------------------------------------------
// (ii) ICU is injectable in the same call — still one package.
// ---------------------------------------------------------------------------

const _withIcu = createSlimI18n({ locale: "en", compiler: icuCompiler });
export type _IcuHostIsStillSlim = Expect<Equal<typeof _withIcu, SlimI18n<{}>>>;

// ---------------------------------------------------------------------------
// (iii) The toolkit re-exports carry core's own widening types.
// ---------------------------------------------------------------------------

const withLoader = attachLoader(createSlimI18n({ locale: "en" }));
export type _LoaderWidens = Expect<
  Equal<typeof withLoader extends I18nLoaderApi ? true : false, true>
>;
void withLoader.registerLoader(() => Promise.resolve({}));
// @ts-expect-error -- attachLoader composes ONLY the loader capability
withLoader.registerPostProcessor((result) => result);

const _withPlugins = attachPlugins(createSlimI18n({ locale: "en" }));
export type _PluginsWiden = Expect<
  Equal<typeof _withPlugins extends I18nPluginHostApi ? true : false, true>
>;

const _withDevtools = attachDevtools(createSlimI18n({ locale: "en" }), { exposeGlobal: false });
export type _DevtoolsKeepsHostType = Expect<Equal<typeof _withDevtools, SlimI18n<{}>>>;

const flat: Record<string, string> = flattenCatalog({ nav: { home: "Home" } });
void flat;

// ---------------------------------------------------------------------------
// (iv) `.with(installer)` — the composition pipe (framework-slim DX-2). The
//      generic host type must flow THROUGH the pipe and come out widened,
//      never decayed to `any` — on BOTH constructors this entry exports.
// ---------------------------------------------------------------------------

const piped = createSlimI18n({ locale: "en", compiler: icuCompiler }).with(
  loader({ uk: async () => ({ default: { greeting: "Привіт" } }) }),
);
export type _PipedIsStillSlim = Expect<Equal<typeof piped, SlimI18n<{}> & I18nLoaderApi>>;
void piped.registerLoader(() => Promise.resolve({}));
// @ts-expect-error -- loader() composes ONLY the loader capability
piped.use(() => undefined);

const _pipedBoth = createSlimI18n({ locale: "en" }).with(loader()).with(plugins());
export type _ChainCompounds = Expect<
  Equal<typeof _pipedBoth extends I18nLoaderApi & I18nPluginHostApi ? true : false, true>
>;

// The root constructor has every capability already: composing is a typed
// no-op that keeps the root host type intact.
export type _RootPipeKeepsRoot = Expect<
  Equal<typeof root.with extends (i: never) => unknown ? true : false, true>
>;
const _rootPiped = createI18n({ locale: "en" }).with(loader());
void _rootPiped.registerLoader({ en: async () => ({ hello: "world" }) });
void _rootPiped.use(() => undefined);

// devtools() adds no public members, so the host type is unchanged.
const _pipedDevtools = createSlimI18n({ locale: "en" }).with(devtools({ exposeGlobal: false }));
export type _DevtoolsPipeKeepsHostType = Expect<Equal<typeof _pipedDevtools, SlimI18n<{}>>>;

// @ts-expect-error -- the factory is not an installer; it must be called
createSlimI18n({ locale: "en" }).with(loader);
