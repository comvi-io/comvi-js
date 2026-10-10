// Type-level contract for the `@comvi/next/client` surface.
// Companion to server-host.test-d.ts.
//
// `@comvi/next/client` exports exactly ONE host constructor, `createI18n`, and
// it is core's BASE host: every capability member is absent from its type until
// something composes it.
import type { I18nLoaderApi, I18nPluginApi, WrapperI18nInstance } from "@comvi/core";
import type { I18n as BaseI18n } from "@comvi/core";
import * as clientEntry from "../../src/client";
import {
  attachLoader,
  createI18n,
  definePlugin,
  devtools,
  icuCompiler,
  loader,
  plugins,
} from "../../src/client";
import { attachPlugins } from "@comvi/core/plugins";
import { attachDevtools } from "@comvi/core/devtools";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// One constructor, and it is the base host.

const host = createI18n({ locale: "en" });

export type _InstanceIsBaseI18n = Expect<Equal<typeof host, BaseI18n<{}>>>;
export type _RetiredNameIsGone = Expect<
  Equal<Extract<keyof typeof clientEntry, "createSlimI18n">, never>
>;
export type _BaseHasNoLoaderApi = Expect<
  Equal<typeof host extends I18nLoaderApi ? true : false, false>
>;
export type _BaseHasNoPluginApi = Expect<
  Equal<typeof host extends I18nPluginApi ? true : false, false>
>;

// @ts-expect-error -- the client host has no loader capability; the server companion loads
host.reloadMessages();
// @ts-expect-error -- ...and none of the plugin host either
host.onMissingKey(() => undefined);
// @ts-expect-error -- ...and no loader registration of any shape
void host.registerLoader(() => Promise.resolve({}));

// The hydration path a client actually uses.
host.addMessages({ "en:default": { greeting: "Hello" } });

// ICU has ONE shape on this entry: the `compiler` option, for every catalog
// source. It configures the host rather than widening it.

const _withIcuCompiler = createI18n({ locale: "en", compiler: icuCompiler });
export type _IcuInstanceIsStillBase = Expect<Equal<typeof _withIcuCompiler, BaseI18n<{}>>>;

// …and no installer beside it.
export type _NoIcuInstaller = Expect<Equal<Extract<keyof typeof clientEntry, "icu">, never>>;

// P4: the low-level `attach*` pair for plugins/devtools is gone from this
// entry — `plugins()`/`devtools()` are the configured installers here, and
// the advanced pair lives on `@comvi/core/plugins` / `@comvi/core/devtools`.
export type _NoAttachPluginsExport = Expect<
  Equal<Extract<keyof typeof clientEntry, "attachPlugins">, never>
>;
export type _NoAttachDevtoolsExport = Expect<
  Equal<Extract<keyof typeof clientEntry, "attachDevtools">, never>
>;
// @ts-expect-error -- `CompilerLockedError` went with the lock it described
export type _NoLockedError = clientEntry.CompilerLockedError;

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
  Equal<typeof _withPlugins extends I18nPluginApi ? true : false, true>
>;

const _withDevtools = attachDevtools(createI18n({ locale: "en" }), { exposeGlobal: false });
export type _DevtoolsKeepsInstanceType = Expect<Equal<typeof _withDevtools, BaseI18n<{}>>>;

// Nested catalogs are BASE behaviour, so this root no longer re-exports
// `flattenCatalog` — it lives on the `@comvi/core` root alone (C1).
// @ts-expect-error -- flattenCatalog is not part of this entry
void (clientEntry.flattenCatalog as unknown);
createI18n({ locale: "en", messages: { en: { nav: { home: "Home" } } } });

// `.use(installer)` — the composition pipe. The generic host type must flow
// THROUGH it and come out widened, never decayed to `any`.

const piped = createI18n({ locale: "en", compiler: icuCompiler }).use(
  loader({ uk: async () => ({ default: { greeting: "Привіт" } }) }),
);
export type _PipedIsStillBase = Expect<Equal<typeof piped, BaseI18n<{}> & I18nLoaderApi>>;
void piped.registerLoader(() => Promise.resolve({}));
// @ts-expect-error -- loader(map) composes ONLY the loader capability
piped.registerPlugin(() => undefined);

const _pipedBoth = createI18n({ locale: "en" }).use(attachLoader).use(plugins());
export type _ChainCompounds = Expect<
  Equal<typeof _pipedBoth extends I18nLoaderApi & I18nPluginApi ? true : false, true>
>;

// The pipe is on the base class. The import-map form is the configured
// installer's argument here — the published two-overload `registerLoader` lives
// on `@comvi/next`'s composed host, not on this base one.
export type _BaseHasThePipe = Expect<
  Equal<typeof host.use extends (i: never) => unknown ? true : false, true>
>;
const _hostPiped = createI18n({ locale: "en" })
  .use(loader({ en: async () => ({ hello: "world" }) }))
  .use(plugins());
void _hostPiped.registerLoader(() => Promise.resolve({}));
void _hostPiped.registerPlugin(() => undefined);

// devtools() adds no public members, so the host type is unchanged.
const _pipedDevtools = createI18n({ locale: "en" }).use(devtools({ exposeGlobal: false }));
export type _DevtoolsPipeKeepsInstanceType = Expect<Equal<typeof _pipedDevtools, BaseI18n<{}>>>;

// @ts-expect-error -- the factory is not an installer; it must be called
createI18n({ locale: "en" }).use(loader);

// `definePlugin(fn)` — the inline-plugin installer, re-exported by BOTH next
// entries beside `plugins`. Pinned here so an entry that dropped it fails the
// type gate.
const _withDefinedPlugin = createI18n({ locale: "en" }).use(definePlugin(() => {}));
export type _DefinePluginWidensToThePluginInstance = Expect<
  Equal<typeof _withDefinedPlugin extends I18nPluginApi ? true : false, true>
>;
void _withDefinedPlugin.registerPlugin(() => {});
export type _ServerEntryAlsoPublishesIt = Expect<
  Equal<
    (typeof import("../../src/server"))["definePlugin"] extends typeof definePlugin ? true : false,
    true
  >
>;
// @ts-expect-error -- definePlugin takes a PLUGIN, not an installer
createI18n({ locale: "en" }).use(definePlugin(attachLoader));

// React's 0.5 surface, whole: `useI18nInstance` is the bare-host reader every SPA
// binding publishes under that name, and `ComponentMap` is the type a typed
// `<T components={…}>` map needs. Both are pinned to react's own declarations,
// so a re-export that drifted would fail here.
export type _UseI18nInstanceIsReacts = Expect<
  Equal<typeof clientEntry.useI18nInstance, typeof import("@comvi/react").useI18nInstance>
>;
export type _InstanceReaderReturnsTheBareInstance = Expect<
  Equal<ReturnType<typeof clientEntry.useI18nInstance>, WrapperI18nInstance<{}>>
>;
export type _ComponentMapIsReacts = Expect<
  Equal<clientEntry.ComponentMap, import("@comvi/react").ComponentMap>
>;
const _components: clientEntry.ComponentMap = { bold: "strong" };
void _components;
