// Type-level contract for the `@comvi/next/client` surface.
// Companion to server-host.test-d.ts.
//
// `@comvi/next/client` exports exactly ONE host constructor, `createI18n`, and
// it is core's BASE host: every capability member is absent from its type until
// something composes it.
import type { I18nLoaderApi, I18nPluginHostApi } from "@comvi/core";
import type { I18n as BaseI18n } from "@comvi/core";
import * as clientEntry from "../../src/client";
import {
  attachDevtools,
  attachLoader,
  attachPlugins,
  createI18n,
  devtools,
  flattenCatalog,
  icu,
  icuCompiler,
  loader,
  plugins,
} from "../../src/client";
import type { CompilerLockedError } from "../../src/client";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// One constructor, and it is the base host.

const host = createI18n({ locale: "en" });

export type _HostIsBaseI18n = Expect<Equal<typeof host, BaseI18n<{}>>>;
export type _RetiredNameIsGone = Expect<
  Equal<Extract<keyof typeof clientEntry, "createSlimI18n">, never>
>;
export type _BaseHasNoLoaderApi = Expect<
  Equal<typeof host extends I18nLoaderApi ? true : false, false>
>;
export type _BaseHasNoPluginApi = Expect<
  Equal<typeof host extends I18nPluginHostApi ? true : false, false>
>;

// @ts-expect-error -- the client host has no loader capability; the server companion loads
host.reloadTranslations();
// @ts-expect-error -- ...and none of the plugin host either
host.onMissingKey(() => undefined);
// @ts-expect-error -- ...and no loader registration of any shape
void host.registerLoader(() => Promise.resolve({}));

// The hydration path a client actually uses.
host.addTranslations({ "en:default": { greeting: "Hello" } });

// ICU has two shapes on this entry, both typed. The COMPILER is for inline
// constructor catalogs; the INSTALLER is for catalogs that arrive later, and it
// must run before ingestion (`CompilerLockedError` is what a late call throws).

const _withIcuCompiler = createI18n({ locale: "en", compiler: icuCompiler });
export type _IcuHostIsStillBase = Expect<Equal<typeof _withIcuCompiler, BaseI18n<{}>>>;

const _withIcuInstaller = createI18n({ locale: "en" }).with(icu());
export type _IcuInstallerKeepsHostType = Expect<Equal<typeof _withIcuInstaller, BaseI18n<{}>>>;
export type _LockedErrorCode = Expect<Equal<CompilerLockedError["code"], "E_COMPILER_LOCKED">>;

// The toolkit re-exports carry core's own widening types.

const withLoader = attachLoader(createI18n({ locale: "en" }));
export type _LoaderWidens = Expect<
  Equal<typeof withLoader extends I18nLoaderApi ? true : false, true>
>;
void withLoader.registerLoader(() => Promise.resolve({}));
// @ts-expect-error -- attachLoader composes ONLY the loader capability
withLoader.registerPostProcessor((result) => result);

const _withPlugins = attachPlugins(createI18n({ locale: "en" }));
export type _PluginsWiden = Expect<
  Equal<typeof _withPlugins extends I18nPluginHostApi ? true : false, true>
>;

const _withDevtools = attachDevtools(createI18n({ locale: "en" }), { exposeGlobal: false });
export type _DevtoolsKeepsHostType = Expect<Equal<typeof _withDevtools, BaseI18n<{}>>>;

const flat: Record<string, string> = flattenCatalog({ nav: { home: "Home" } });
void flat;

// `.with(installer)` — the composition pipe. The generic host type must flow
// THROUGH it and come out widened, never decayed to `any`.

const piped = createI18n({ locale: "en", compiler: icuCompiler }).with(
  loader({ uk: async () => ({ default: { greeting: "Привіт" } }) }),
);
export type _PipedIsStillBase = Expect<Equal<typeof piped, BaseI18n<{}> & I18nLoaderApi>>;
void piped.registerLoader(() => Promise.resolve({}));
// @ts-expect-error -- loader() composes ONLY the loader capability
piped.use(() => undefined);

const _pipedBoth = createI18n({ locale: "en" }).with(loader()).with(plugins());
export type _ChainCompounds = Expect<
  Equal<typeof _pipedBoth extends I18nLoaderApi & I18nPluginHostApi ? true : false, true>
>;

// The pipe is on the base class. The import-map form is the configured
// installer's argument here — the published two-overload `registerLoader` lives
// on `@comvi/next`'s composed host, not on this base one.
export type _BaseHasThePipe = Expect<
  Equal<typeof host.with extends (i: never) => unknown ? true : false, true>
>;
const _hostPiped = createI18n({ locale: "en" })
  .with(loader({ en: async () => ({ hello: "world" }) }))
  .with(plugins());
void _hostPiped.registerLoader(() => Promise.resolve({}));
void _hostPiped.use(() => undefined);

// devtools() adds no public members, so the host type is unchanged.
const _pipedDevtools = createI18n({ locale: "en" }).with(devtools({ exposeGlobal: false }));
export type _DevtoolsPipeKeepsHostType = Expect<Equal<typeof _pipedDevtools, BaseI18n<{}>>>;

// @ts-expect-error -- the factory is not an installer; it must be called
createI18n({ locale: "en" }).with(loader);
