// The PUBLISHED `@comvi/next` root type contract: `createNextI18n` returns the
// exact, explicitly published `NextComposedI18n<D>` the non-exported builder
// produces. `tests/composed-contract.test.ts` is the behavioural half.
import type { NextComposedI18n, NextPluginOptions } from "@comvi/next";
import { createNextI18n, definePlugin, loader, nextPlugin, nextPluginLazy } from "@comvi/next";
import { defineRouting } from "../../src/routing";
import type { CreateNextI18nResult } from "../../src/createNextI18n";
import type { I18n, I18nLoaderApi, I18nPlugin, I18nPluginHostApi, LoaderFn } from "@comvi/core";
import type { LoaderImportMap } from "@comvi/core/loader";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// The published type IS the result's `i18n` field — no drift possible.
export type _ResultHostIsTheExportedType = Expect<
  Equal<CreateNextI18nResult["i18n"], NextComposedI18n>
>;
export type _ResultHostIsTheExportedTypeGeneric = Expect<
  Equal<CreateNextI18nResult<{ brand: string }>["i18n"], NextComposedI18n<{ brand: string }>>
>;

// It carries the base host, the loader API and the plugin host.
export type _CarriesBaseHost = Expect<Equal<NextComposedI18n extends I18n ? true : false, true>>;
export type _CarriesPluginHost = Expect<
  Equal<NextComposedI18n extends I18nPluginHostApi ? true : false, true>
>;
export type _CarriesLoaderApi = Expect<
  Equal<NextComposedI18n extends I18nLoaderApi ? true : false, true>
>;

// BOTH `registerLoader` overloads survive — the one affordance the generic
// loader capability does not carry.
declare const composed: NextComposedI18n;
const fn: LoaderFn = async () => ({});
composed.registerLoader(fn);
const map: LoaderImportMap = { en: async () => ({ default: { k: "EN" } }) };
composed.registerLoader(map);
// @ts-expect-error -- neither a loader function nor an import map
composed.registerLoader(42);

// `.use(installer)` is the composition pipe: it hands back the SAME result
// type with `i18n` retyped to what the installer widened the host to.
const _result = createNextI18n({ locales: ["en"], defaultLocale: "en" });
export type _ResultIsThreeFields = Expect<
  Equal<keyof CreateNextI18nResult, "i18n" | "routing" | "use">
>;

declare const plugin: I18nPlugin;
const _piped = _result
  .use(loader({ en: async () => ({ default: { k: "EN" } }) }))
  .use(nextPlugin(plugin, { runtime: "client", environment: "development", required: false }))
  .use(nextPluginLazy(async () => plugin, { runtime: "server" }))
  .use(definePlugin(plugin));
export type _PipeKeepsTheResultShape = Expect<
  Equal<keyof typeof _piped, "i18n" | "routing" | "use">
>;
// The composed host already carries both capabilities, so these installers
// widen it to itself: `i18n` stays the published type, and the pipe is still
// exact rather than `any`.
export type _PipeWidensToTheComposedHost = Expect<
  Equal<typeof _piped.i18n, NextComposedI18n & I18nLoaderApi & I18nPluginHostApi>
>;
export type _PipeIsStillTheComposedHost = Expect<
  Equal<typeof _piped.i18n extends NextComposedI18n ? true : false, true>
>;
export type _PipeRoutingUnchanged = Expect<
  Equal<typeof _piped.routing, CreateNextI18nResult["routing"]>
>;

// A widening installer of the reader's own carries its widening onto `i18n`.
declare function withMetrics<T extends I18n<any>>(i18n: T): T & { metrics: () => void };
const _widened = _result.use(withMetrics);
export type _OwnInstallerWidens = Expect<
  Equal<typeof _widened.i18n extends { metrics: () => void } ? true : false, true>
>;
_widened.i18n.metrics();
_widened.i18n.registerPlugin(plugin);

// The three misuses are compile errors, exactly as on core's `use`.
// @ts-expect-error -- an async function returns a Promise, not the host
_result.use(async (i18n) => i18n);
// @ts-expect-error -- an installer must return the host it was given
_result.use((i18n) => {
  void i18n;
});
// @ts-expect-error -- a spread copy is a different object, and its type drops the host's methods
_result.use((i18n) => ({ ...i18n }));
// @ts-expect-error -- a raw plugin is not an installer: it goes through nextPlugin / definePlugin
_result.use(plugin);
// @ts-expect-error -- the factory is not an installer; it must be called
_result.use(nextPlugin);

// The four scoped delegates are GONE, not deprecated.
// @ts-expect-error -- removed in 0.5: `.use(nextPlugin(p, { runtime: "client" }))`
_result.useClient(plugin);
// @ts-expect-error -- removed in 0.5: `.use(nextPlugin(p, { runtime: "server" }))`
_result.useServer(plugin);
// @ts-expect-error -- removed in 0.5: `.use(nextPluginLazy(load, { runtime: "client" }))`
_result.useClientLazy(async () => plugin);
// @ts-expect-error -- removed in 0.5: `.use(nextPluginLazy(load, { runtime: "server" }))`
_result.useServerLazy(async () => plugin);
// @ts-expect-error -- the old scoped raw-plugin form: scoping lives on nextPlugin now
_result.use(plugin, { runtime: "client" });

// `nextPlugin` / `nextPluginLazy` take a PLUGIN / LOADER and the Next scopes;
// their options type is published.
export type _NextPluginOptionsShape = Expect<
  Equal<keyof NextPluginOptions, "runtime" | "environment" | "required" | "timeout" | "onError">
>;
// @ts-expect-error -- runtime is "client" | "server"
nextPlugin(plugin, { runtime: "edge" });
// @ts-expect-error -- environment is "all" | "development" | "production"
nextPlugin(plugin, { environment: "staging" });
// @ts-expect-error -- `lazy` is not an option: the lazy form is its own installer
nextPlugin(plugin, { lazy: true });
// @ts-expect-error -- an installer is not a plugin
nextPlugin(loader({ uk: () => Promise.resolve({}) }));
// @ts-expect-error -- the lazy installer takes a LOADER, not a plugin
nextPluginLazy(plugin);

// The base composition pipe is reachable on the published host.
export type _HasThePipe = Expect<
  Equal<NextComposedI18n["use"] extends (installer: never) => unknown ? true : false, true>
>;

// `D` flows when named explicitly. It does NOT infer from `defaultParams`
// alone — `CreateNextI18nOptions<D>` reaches it through
// `Pick<I18nOptions<D>, "defaultParams">`, a conditional type TS cannot infer
// through: a pre-existing limitation, deliberately pinned rather than papered
// over.
const _branded = createNextI18n<{ brand: string }>({
  locales: ["en"],
  defaultLocale: "en",
  defaultParams: { brand: "Comvi" },
});
export type _ExplicitDFlows = Expect<
  Equal<typeof _branded.i18n, NextComposedI18n<{ brand: string }>>
>;

const _inferred = createNextI18n({
  locales: ["en"],
  defaultLocale: "en",
  defaultParams: { brand: "Comvi" },
});
export type _DDoesNotInferFromDefaultParams = Expect<
  Equal<typeof _inferred.i18n, NextComposedI18n<{}>>
>;

// `defineRouting`'s own output must be spreadable into `createNextI18n`. Every
// other locale list in this package is `readonly` — `RoutingConfig.locales`,
// `hasLocale`, and the middleware helpers — so a `NextRoutingOptions.locales`
// that demanded a mutable array made the package's documented composition
// uncompilable, and rejected the `as const` tuple `hasLocale` narrowing needs.
const _routing = defineRouting({ locales: ["en", "de"], defaultLocale: "en" } as const);
const _spread = createNextI18n({ ..._routing, messages: { en: {} } });
export type _RoutingSpreadsIntoFactory = Expect<Equal<typeof _spread.i18n, NextComposedI18n<{}>>>;

// The same tuple handed straight to the factory, which is what an app that
// wants `hasLocale(LOCALES, x)` narrowing writes.
const LOCALES = ["en", "de"] as const;
const _fromTuple = createNextI18n({ locales: LOCALES, defaultLocale: "en" });
export type _AsConstLocalesAccepted = Expect<Equal<typeof _fromTuple.i18n, NextComposedI18n<{}>>>;
