// Type-level contract for the `@comvi/next/client` SINGLE-PACKAGE surface
// (framework-slim DX pass). Companion to server-host.test-d.ts.
//
// `@comvi/next/client` exports BOTH constructors: the published-0.4.x
// `createI18n` and `createSlimI18n`. Since the single-entry convergence
// `@comvi/core` IS the base host, so the two names denote the SAME type and
// the claim under test became "both are the base host, and its capability
// members are absent until composed". P4 deletes the duplicate name.
import type { I18nLoaderApi, I18nPluginHostApi } from "@comvi/core";
import type { I18n as BaseI18n } from "@comvi/core";
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

export type _SlimIsBaseI18n = Expect<Equal<typeof slim, BaseI18n<{}>>>;
export type _RootIsBaseI18n = Expect<Equal<typeof root, BaseI18n<{}>>>;
export type _BothNamesAreTheSameHost = Expect<Equal<typeof slim, typeof root>>;
export type _BaseHasNoLoaderApi = Expect<
  Equal<typeof slim extends I18nLoaderApi ? true : false, false>
>;
export type _BaseHasNoPluginApi = Expect<
  Equal<typeof slim extends I18nPluginHostApi ? true : false, false>
>;

// @ts-expect-error -- the client host has no loader capability; the server companion loads
slim.reloadTranslations();
// @ts-expect-error -- ...and none of the plugin host either
slim.onMissingKey(() => undefined);

// The hydration path a client actually uses.
slim.addTranslations({ "en:default": { greeting: "Hello" } });

// @ts-expect-error -- the second name is the same base host: no loader either
void root.registerLoader(() => Promise.resolve({}));

// ---------------------------------------------------------------------------
// (ii) ICU is injectable in the same call — still one package.
// ---------------------------------------------------------------------------

const _withIcu = createSlimI18n({ locale: "en", compiler: icuCompiler });
export type _IcuHostIsStillBase = Expect<Equal<typeof _withIcu, BaseI18n<{}>>>;

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
export type _DevtoolsKeepsHostType = Expect<Equal<typeof _withDevtools, BaseI18n<{}>>>;

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
export type _PipedIsStillBase = Expect<Equal<typeof piped, BaseI18n<{}> & I18nLoaderApi>>;
void piped.registerLoader(() => Promise.resolve({}));
// @ts-expect-error -- loader() composes ONLY the loader capability
piped.use(() => undefined);

const _pipedBoth = createSlimI18n({ locale: "en" }).with(loader()).with(plugins());
export type _ChainCompounds = Expect<
  Equal<typeof _pipedBoth extends I18nLoaderApi & I18nPluginHostApi ? true : false, true>
>;

// The pipe is on the base class, so either name composes identically. The
// import-map form is the configured installer's argument now — the published
// two-overload `registerLoader` lives on `@comvi/next`'s composed host.
export type _BaseHasThePipe = Expect<
  Equal<typeof root.with extends (i: never) => unknown ? true : false, true>
>;
const _rootPiped = createI18n({ locale: "en" })
  .with(loader({ en: async () => ({ hello: "world" }) }))
  .with(plugins());
void _rootPiped.registerLoader(() => Promise.resolve({}));
void _rootPiped.use(() => undefined);

// devtools() adds no public members, so the host type is unchanged.
const _pipedDevtools = createSlimI18n({ locale: "en" }).with(devtools({ exposeGlobal: false }));
export type _DevtoolsPipeKeepsHostType = Expect<Equal<typeof _pipedDevtools, BaseI18n<{}>>>;

// @ts-expect-error -- the factory is not an installer; it must be called
createSlimI18n({ locale: "en" }).with(loader);
